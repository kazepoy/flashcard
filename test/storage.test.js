import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore, FsaStore } from '../src/storage/stores.js';
import { Library } from '../src/storage/library.js';
import { mergeProgress, mergeLogs, mergeSets } from '../src/core/merge.js';
import { newSet, newCard, newProgress } from '../src/core/format.js';
import { sha256Hex } from '../src/core/ids.js';
import { Scheduler, Grade } from '../src/core/srs.js';

// --- faux dossier File System Access API (pour tester FsaStore sans navigateur)
class FakeFile {
  constructor(bytes) {
    this.bytes = bytes;
  }
  async arrayBuffer() {
    return this.bytes.slice().buffer;
  }
}
class FakeFileHandle {
  constructor(name, dir) {
    this.kind = 'file';
    this.name = name;
    this.dir = dir;
  }
  async getFile() {
    return new FakeFile(this.dir.files.get(this.name));
  }
  async createWritable() {
    const self = this;
    let data;
    return {
      async write(b) {
        data = new Uint8Array(b);
      },
      async close() {
        self.dir.files.set(self.name, data);
      },
    };
  }
}
class FakeDir {
  constructor(name) {
    this.kind = 'directory';
    this.name = name;
    this.files = new Map();
    this.dirs = new Map();
  }
  async getDirectoryHandle(n, { create } = {}) {
    if (!this.dirs.has(n)) {
      if (!create) throw Object.assign(new Error('nf'), { name: 'NotFoundError' });
      this.dirs.set(n, new FakeDir(n));
    }
    return this.dirs.get(n);
  }
  async getFileHandle(n, { create } = {}) {
    if (!this.files.has(n)) {
      if (!create) throw Object.assign(new Error('nf'), { name: 'NotFoundError' });
      this.files.set(n, new Uint8Array());
    }
    return new FakeFileHandle(n, this);
  }
  async removeEntry(n) {
    if (!this.files.delete(n)) throw Object.assign(new Error('nf'), { name: 'NotFoundError' });
  }
  async *entries() {
    for (const n of this.files.keys()) yield [n, new FakeFileHandle(n, this)];
    for (const [n, d] of this.dirs) yield [n, d];
  }
}

for (const [label, make] of [
  ['MemoryStore', () => new MemoryStore()],
  ['FsaStore', () => new FsaStore(new FakeDir('root'))],
]) {
  test(`${label} : lecture, écriture, liste, suppression`, async () => {
    const st = make();
    assert.equal(await st.readText('a/b.json'), null);
    assert.equal(await st.exists('a/b.json'), false);
    await st.writeText('a/b.json', '{"x":1}');
    await st.writeBytes('a/c.bin', Uint8Array.from([1, 2, 3]));
    assert.equal(await st.readText('a/b.json'), '{"x":1}');
    assert.deepEqual([...(await st.readBytes('a/c.bin'))], [1, 2, 3]);
    assert.deepEqual((await st.list('a')).sort(), ['b.json', 'c.bin']);
    assert.deepEqual(await st.list('nope'), []);
    await st.remove('a/b.json');
    await st.remove('a/inexistant.json'); // pas d'erreur
    assert.equal(await st.exists('a/b.json'), false);
  });
}

const mkLib = async (store = new MemoryStore()) => new Library(store).init();

test('Library : init, jeux, progression, journal, paramètres', async () => {
  const lib = await mkLib();
  assert.equal(JSON.parse(await lib.store.readText('flashcard.json')).format, 'flashcard');
  const s = newSet({ title: 'A', cards: [newCard({ term: 'a', definition: 'b' })] });
  await lib.saveSet(s);
  const { sets, errors } = await lib.listSets();
  assert.equal(sets.length, 1);
  assert.equal(sets[0].count, 1);
  assert.deepEqual(errors, []);
  const loaded = await lib.loadSet(s.id);
  assert.equal(loaded.cards[0].term, 'a');
  const p = await lib.loadProgress(s.id);
  p.starred[s.cards[0].id] = true;
  await lib.saveProgress(p);
  assert.equal((await lib.loadProgress(s.id)).starred[s.cards[0].id], true);
  await lib.appendLog(s.id, [{ t: '2026-10-28T10:00:00Z', item: 'x', rating: 3 }]);
  await lib.appendLog(s.id, [{ t: '2026-10-28T11:00:00Z', item: 'y', rating: 1 }]);
  assert.equal((await lib.readLog(s.id)).length, 2);
  await lib.saveSettings({ ...lib.settings, newPerDay: 5 });
  assert.equal((await lib.loadSettings()).newPerDay, 5);
  await lib.deleteSet(s.id);
  assert.equal((await lib.listSets()).sets.length, 0);
  assert.equal(await lib.store.exists(`progress/${s.id}.json`), false);
});

test('Library : fichier de jeu corrompu signalé sans bloquer la liste', async () => {
  const lib = await mkLib();
  await lib.saveSet(newSet({ title: 'ok' }));
  await lib.store.writeText('sets/BAD.json', '{pas du json');
  const { sets, errors } = await lib.listSets();
  assert.equal(sets.length, 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /corrompu/);
});

test("Library : refuse un dossier qui n'est pas une bibliothèque ou de version future", async () => {
  const st = new MemoryStore();
  await st.writeText('flashcard.json', JSON.stringify({ format: 'autre' }));
  await assert.rejects(new Library(st).init(), /pas une biblioth/);
  const st2 = new MemoryStore();
  await st2.writeText('flashcard.json', JSON.stringify({ format: 'flashcard', version: 5 }));
  await assert.rejects(new Library(st2).init(), /version 5/);
});

test('Library : médias dédupliqués par hash, ramasse-miettes', async () => {
  const lib = await mkLib();
  const bytes = Uint8Array.from([1, 2, 3, 4]);
  const p1 = await lib.putMedia(bytes, 'PNG');
  const p2 = await lib.putMedia(bytes, 'png');
  assert.equal(p1, p2);
  assert.equal(p1, `media/${await sha256Hex(bytes)}.png`);
  const orphan = await lib.putMedia(Uint8Array.from([9, 9]), 'png');
  const s = newSet({ cards: [newCard({ term: 'a', definition: `x ![](${p1})` })] });
  await lib.saveSet(s);
  assert.equal(await lib.gcMedia(), 1);
  assert.equal(await lib.store.exists(orphan), false);
  assert.equal(await lib.store.exists(p1), true);
});

test('Library : bundle exporté puis importé dans une autre bibliothèque', async () => {
  const a = await mkLib();
  const media = await a.putMedia(Uint8Array.from([5, 6, 7]), 'png');
  const s = newSet({ title: 'Partagé', cards: [newCard({ term: 't', definition: 'd', image: media })] });
  await a.saveSet(s);
  const p = await a.loadProgress(s.id);
  p.starred[s.cards[0].id] = true;
  await a.saveProgress(p);
  const bytes = await a.exportBundleBytes([s.id]);
  const b = await mkLib();
  const ids = await b.importBundleBytes(bytes);
  assert.deepEqual(ids, [s.id]);
  assert.equal((await b.loadSet(s.id)).title, 'Partagé');
  assert.equal((await b.loadProgress(s.id)).starred[s.cards[0].id], true);
  assert.deepEqual([...(await b.readMedia(media))], [5, 6, 7]);
  // réimport : fusion, pas de doublon
  await b.importBundleBytes(bytes);
  assert.equal((await b.listSets()).sets.length, 1);
});

// ---------------------------------------------------------------- fusion (synchro iCloud, etc.)

const review = (progress, itemId, grade, when) => {
  const sch = new Scheduler({ fuzz: false });
  const it = (progress.items[itemId] ||= {});
  it.srs = sch.review(it.srs || null, grade, new Date(when)).srs;
};

test('mergeProgress : commutatif, idempotent, garde la révision la plus récente', () => {
  const a = newProgress('S');
  const b = newProgress('S');
  review(a, 'i1', Grade.Good, '2026-10-01T10:00:00Z');
  review(b, 'i1', Grade.Good, '2026-10-01T10:00:00Z');
  review(b, 'i1', Grade.Good, '2026-10-02T10:00:00Z'); // b est allé plus loin
  review(a, 'i2', Grade.Good, '2026-10-03T10:00:00Z'); // item seulement dans a
  a.starred.c1 = true;
  b.starred.c2 = true;
  a.daily['2026-10-01'] = { new: 3, reviews: 0, answers: 3, ms: 100 };
  b.daily['2026-10-01'] = { new: 2, reviews: 4, answers: 6, ms: 50 };
  a.games.match = { bestMs: 20000 };
  b.games.match = { bestMs: 15000 };
  a.items.i1.mastery = 1;
  b.items.i1.mastery = 2;

  const ab = mergeProgress(a, b);
  const ba = mergeProgress(b, a);
  assert.deepEqual(ab.items, ba.items);
  assert.deepEqual(ab.daily, ba.daily);
  assert.equal(ab.items.i1.srs.reps, b.items.i1.srs.reps);
  assert.equal(ab.items.i1.mastery, 2);
  assert.ok(ab.items.i2.srs);
  assert.deepEqual(Object.keys(ab.starred).sort(), ['c1', 'c2']);
  assert.deepEqual(ab.daily['2026-10-01'], { new: 3, reviews: 4, answers: 6, ms: 100 });
  assert.equal(ab.games.match.bestMs, 15000);
  assert.deepEqual(mergeProgress(ab, ab), ab); // idempotence
  assert.deepEqual(mergeProgress(mergeProgress(a, b), a), ab); // associativité (cas simple)
});

test('mergeLogs : union triée sans doublon', () => {
  const a = '{"t":"2026-10-02T00:00:00Z","item":"x"}\n{"t":"2026-10-01T00:00:00Z","item":"y"}\n';
  const b = '{"t":"2026-10-01T00:00:00Z","item":"y"}\n{"t":"2026-10-03T00:00:00Z","item":"z"}\n';
  const m = mergeLogs(a, b)
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l).item);
  assert.deepEqual(m, ['y', 'x', 'z']);
  assert.equal(mergeLogs('', ''), '');
});

test('mergeSets : le plus récent gagne, aucune carte perdue', () => {
  const c1 = newCard({ term: '1', definition: 'a' });
  const c2 = newCard({ term: '2', definition: 'b' });
  const c3 = newCard({ term: '3', definition: 'c' });
  const old = newSet({ id: 'S'.repeat(26), cards: [c1, c2], updated: '2026-10-01T00:00:00Z' });
  const recent = newSet({
    id: 'S'.repeat(26),
    cards: [{ ...c1, term: '1 modifié' }, c3],
    updated: '2026-10-02T00:00:00Z',
  });
  const m = mergeSets(old, recent);
  assert.equal(m.cards.find((c) => c.id === c1.id).term, '1 modifié');
  assert.equal(m.cards.length, 3);
});

test('Library.resolveConflicts : fusionne les copies « en conflit » iCloud/Syncthing', async () => {
  const lib = await mkLib();
  const s = newSet({ title: 'Conflit', cards: [newCard({ term: 'a', definition: 'b' })] });
  await lib.saveSet(s);
  const p = newProgress(s.id);
  review(p, 'i1', Grade.Good, '2026-10-01T10:00:00Z');
  await lib.saveProgress(p);
  const other = newProgress(s.id);
  review(other, 'i2', Grade.Good, '2026-10-02T10:00:00Z');
  await lib.store.writeText(`progress/${s.id} 2.json`, JSON.stringify(other));
  await lib.store.writeText(`logs/${s.id}.jsonl`, '{"t":"2026-10-01T00:00:00Z","item":"a"}\n');
  await lib.store.writeText(`logs/${s.id}.sync-conflict-20261002.jsonl`, '{"t":"2026-10-02T00:00:00Z","item":"b"}\n');
  await lib.store.writeText(
    `sets/${s.id} (conflit).json`,
    JSON.stringify({
      ...s,
      cards: [...s.cards, newCard({ term: 'z', definition: 'y' })],
      updated: '2026-01-01T00:00:00Z',
    }),
  );
  assert.equal(await lib.resolveConflicts(), 3);
  const merged = await lib.loadProgress(s.id);
  assert.ok(merged.items.i1 && merged.items.i2);
  assert.equal((await lib.readLog(s.id)).length, 2);
  assert.equal((await lib.loadSet(s.id)).cards.length, 2);
  assert.deepEqual(await lib.store.list('progress'), [`${s.id}.json`]);
  assert.equal(await lib.resolveConflicts(), 0);
});

test('firstRun : exemples dans la langue du navigateur, une seule fois, rien si la bibliothèque a des jeux', async () => {
  const { readFile } = await import('node:fs/promises');
  const { firstRun, browserLang } = await import('../src/ui/first-run.js');
  const fetchImpl = async (url) => {
    try {
      const b = await readFile(new URL('../examples/' + url.replace('./examples/', ''), import.meta.url));
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(b.toString()),
        arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length),
      };
    } catch {
      return { ok: false, status: 404 };
    }
  };
  assert.equal(browserLang({ language: 'fr-CA' }), 'fr');
  assert.equal(browserLang({ language: 'de-DE' }), 'en');

  const lib = await mkLib();
  assert.equal(await firstRun(lib, { lang: 'fr', fetchImpl }), true);
  const { sets } = await lib.listSets();
  assert.equal(sets.length, 1);
  assert.deepEqual(
    [lib.settings.lang, lib.settings.language, lib.settings.initialized],
    ['fr', { term: 'fr', definition: 'fr' }, true],
  );
  assert.equal(await firstRun(lib, { lang: 'fr', fetchImpl }), false, 'déjà fait');

  const busy = await mkLib();
  await busy.saveSet(newSet({ title: 'À moi', cards: [newCard({ term: 'a', definition: 'b' })] }));
  assert.equal(await firstRun(busy, { lang: 'fr', fetchImpl }), false);
  assert.equal((await busy.listSets()).sets.length, 1);
  assert.equal(busy.settings.initialized, true);

  const offline = await mkLib();
  await assert.rejects(firstRun(offline, { lang: 'fr', fetchImpl: async () => ({ ok: false, status: 503 }) }));
  assert.equal(offline.settings.initialized, false, 'nouvel essai à la prochaine ouverture');
});

test('Library.wipe : tout effacé sauf le manifeste ; réglages par défaut', async () => {
  const lib = await mkLib();
  const s = newSet({ title: 'x', cards: [newCard({ term: 'a', definition: 'b' })] });
  await lib.saveSet(s);
  await lib.putMedia(new Uint8Array([1, 2, 3]), 'png');
  await lib.saveSettings({ ...lib.settings, theme: 'neon', initialized: true });
  await lib.wipe();
  assert.equal((await lib.listSets()).sets.length, 0);
  assert.deepEqual(await lib.store.list('media'), []);
  assert.equal(lib.settings.initialized, false);
  assert.equal((await lib.loadSettings()).theme, 'auto');
  assert.ok(await lib.store.exists('flashcard.json'), 'le dossier reste une bibliothèque');
});

test('mergeSets : une carte supprimée sur un appareil ne revient pas', () => {
  const a = newCard({ term: 'a', definition: '1' });
  const b = newCard({ term: 'b', definition: '2' });
  const base = newSet({ cards: [a, b], updated: '2026-10-01T00:00:00.000Z' });
  // appareil 1 : supprime b ; appareil 2 (plus tard) : modifie le titre, b toujours présente
  const one = {
    ...base,
    cards: [a],
    deleted: { [b.id]: '2026-10-02T00:00:00.000Z' },
    updated: '2026-10-02T00:00:00.000Z',
  };
  const two = { ...base, title: 'Nouveau titre', updated: '2026-10-03T00:00:00.000Z' };
  for (const m of [mergeSets(one, two), mergeSets(two, one)]) {
    assert.equal(m.title, 'Nouveau titre');
    assert.deepEqual(
      m.cards.map((c) => c.term),
      ['a'],
    );
    assert.ok(m.deleted[b.id]);
  }
  // sans suppression, rien ne se perd et aucun champ « deleted » n'apparaît
  assert.equal('deleted' in mergeSets(base, two), false);
});

test('copySet : copie indépendante (nouveaux identifiants), titre choisi, sans historique de suppression', async () => {
  const { copySet } = await import('../src/core/format.js');
  const a = newCard({ term: 'a', definition: '1' });
  const s = { ...newSet({ title: 'Original', cards: [a] }), deleted: { [newCard().id]: '2026-10-01T00:00:00.000Z' } };
  const c = copySet(s, 'Copie');
  assert.notEqual(c.id, s.id);
  assert.notEqual(c.cards[0].id, a.id);
  assert.deepEqual([c.title, c.cards[0].term, 'deleted' in c], ['Copie', 'a', false]);
  const lib = await mkLib();
  await lib.addSets([s, c]);
  assert.equal((await lib.listSets()).sets.length, 2);
});
