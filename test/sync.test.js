import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/storage/stores.js';
import { Library } from '../src/storage/library.js';
import { PURGED, clearRemote, removeStrayFiles, syncLibrary } from '../src/storage/sync.js';
import { newCard, newSet } from '../src/core/format.js';

/** Dossier distant en mémoire : `rev` change à chaque écriture. */
class MemoryRemote {
  constructor() {
    this.files = new Map();
    this.n = 0;
  }
  async list() {
    return [...this.files].map(([path, f]) => ({ path, rev: f.rev }));
  }
  async read(path) {
    return this.files.get(path).bytes;
  }
  async write(path, bytes) {
    const rev = `r${++this.n}`;
    this.files.set(path, { bytes: new Uint8Array(bytes), rev });
    return rev;
  }
  async remove(path) {
    this.files.delete(path);
  }
}

const mkLib = () => new Library(new MemoryStore()).init();
const card = (term) => newCard({ term, definition: term.toUpperCase() });

/** Deux appareils et un dossier distant ; `sync(i)` synchronise l'appareil i. */
async function devices() {
  const remote = new MemoryRemote();
  const libs = [await mkLib(), await mkLib()];
  const states = [{}, {}];
  const sync = async (i) => {
    const r = await syncLibrary(libs[i], remote, states[i]);
    states[i] = r.state;
    return r;
  };
  return { remote, libs, sync };
}

test("sync : un jeu créé sur un appareil arrive sur l'autre, médias compris", async () => {
  const { libs, sync } = await devices();
  const media = await libs[0].putMedia(new Uint8Array([1, 2, 3]), 'png');
  const s = newSet({ title: 'Capitales', cards: [{ ...card('paris'), image: media }] });
  await libs[0].saveSet(s);
  assert.equal((await sync(0)).pushed, 2);
  const r = await sync(1);
  assert.equal(r.pulled, 2);
  assert.equal((await libs[1].loadSet(s.id)).title, 'Capitales');
  assert.deepEqual([...(await libs[1].readMedia(media))], [1, 2, 3]);
  // rien n'a changé : aucun transfert
  const again = await sync(1);
  assert.deepEqual([again.pulled, again.pushed, again.merged], [0, 0, 0]);
});

test('sync : modifications des deux côtés fusionnées (cartes, progression, journal)', async () => {
  const { libs, sync } = await devices();
  const s = newSet({ title: 'Jeu', cards: [card('a')] });
  await libs[0].saveSet(s);
  await sync(0);
  await sync(1);
  // appareil 0 ajoute une carte, appareil 1 en ajoute une autre et révise
  const s0 = await libs[0].loadSet(s.id);
  s0.cards.push(card('b'));
  await libs[0].saveSet(s0);
  await libs[0].appendLog(s.id, [{ t: '2026-10-31T10:00:00.000Z', item: 'x', mode: 'srs', rating: 3 }]);
  const s1 = await libs[1].loadSet(s.id);
  s1.cards.push(card('c'));
  await libs[1].saveSet(s1);
  await libs[1].appendLog(s.id, [{ t: '2026-10-31T11:00:00.000Z', item: 'y', mode: 'srs', rating: 1 }]);
  await sync(0);
  const r = await sync(1);
  assert.ok(r.merged >= 2, 'jeu et journal fusionnés');
  await sync(0);
  for (const lib of libs) {
    assert.deepEqual((await lib.loadSet(s.id)).cards.map((c) => c.term).sort(), ['a', 'b', 'c']);
    assert.equal((await lib.readLog(s.id)).length, 2);
  }
});

test('sync : suppressions propagées (jeu entier, carte)', async () => {
  const { libs, sync, remote } = await devices();
  const keep = newSet({ title: 'Garder', cards: [card('a'), card('b')] });
  const drop = newSet({ title: 'Jeter', cards: [card('z')] });
  await libs[0].saveSet(keep);
  await libs[0].saveSet(drop);
  await sync(0);
  await sync(1);
  // appareil 1 supprime un jeu et une carte (avec marque de suppression, comme l'éditeur)
  await libs[1].deleteSet(drop.id);
  const k = await libs[1].loadSet(keep.id);
  const [gone] = k.cards.splice(1, 1);
  k.deleted = { [gone.id]: new Date().toISOString() };
  await libs[1].saveSet(k);
  await sync(1);
  assert.equal(
    [...remote.files.keys()].some((p) => p.includes(drop.id)),
    false,
  );
  const r = await sync(0);
  assert.ok(r.removed >= 1);
  assert.equal(await libs[0].loadSet(drop.id), null);
  assert.deepEqual(
    (await libs[0].loadSet(keep.id)).cards.map((c) => c.term),
    ['a'],
  );
});

test("sync : la synchronisation n'est pas déclenchée par ses propres écritures", async () => {
  const { libs, sync } = await devices();
  await libs[0].saveSet(newSet({ cards: [card('a')] }));
  await sync(0);
  const seen = [];
  libs[1].onWrite((p) => seen.push(p));
  await sync(1);
  assert.deepEqual(seen, []);
  await libs[1].saveSet(newSet({ cards: [card('b')] }));
  assert.equal(seen.length, 1);
});

test("PKCE : défi S256 conforme à l'exemple de la RFC 7636", async () => {
  const { pkceChallenge } = await import('../src/ui/pkce.js');
  assert.equal(
    await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  );
});

test('PKCE : le jeton durable survit à une panne de réseau, pas à un refus du fournisseur', async () => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  try {
    const { pkceClient } = await import('../src/ui/pkce.js');
    let answer = null; // réponse du fournisseur à la prochaine demande de jeton
    const client = pkceClient({
      name: 'Test',
      storageKey: 'jeton-test',
      clientId: () => 'app',
      authorizeUrl: 'https://exemple.test/authorize',
      tokenUrl: 'https://exemple.test/token',
      fetchImpl: async () => answer(),
    });
    const reply = (status, body) => () => ({ ok: status === 200, status, json: async () => body });
    mem.set('jeton-test', JSON.stringify({ access: 'ancien', exp: Date.now() - 1, refresh: 'durable' }));
    // sortie de veille sans réseau : erreur réseau, le jeton durable reste
    answer = () => {
      throw new TypeError('Failed to fetch');
    };
    await assert.rejects(client.token(), { code: 'syncOffline' });
    assert.equal(client.canRenew(), true);
    // service en panne : idem
    answer = reply(503, {});
    await assert.rejects(client.token(), { code: 'syncHttp' });
    assert.equal(client.canRenew(), true);
    // réseau revenu : nouveau jeton sans clic, le jeton durable est conservé
    answer = reply(200, { access_token: 'neuf', expires_in: 14400 });
    assert.equal(await client.token(), 'neuf');
    assert.equal(await client.token(), 'neuf', 'en cache');
    answer = reply(200, { access_token: 'renouvele', expires_in: 14400 });
    assert.equal(await client.token({ renew: true }), 'renouvele');
    assert.equal(JSON.parse(mem.get('jeton-test')).refresh, 'durable');
    // accès révoqué : reconnexion nécessaire
    answer = reply(400, { error: 'invalid_grant' });
    await assert.rejects(client.token({ renew: true }), { code: 'syncAuth' });
    assert.equal(client.canRenew(), false);
  } finally {
    delete globalThis.localStorage;
  }
});

test("Dropbox : jeton refusé par l'API, renouvelé une fois avant de demander une reconnexion", async () => {
  const { DropboxRemote } = await import('../src/storage/dropbox.js');
  const asked = [];
  const getToken = async (o) => (asked.push(!!o?.renew), o?.renew ? 'neuf' : 'perime');
  const fetchImpl = async (url, init) =>
    init.headers.Authorization === 'Bearer neuf'
      ? { ok: true, status: 200, json: async () => ({ entries: [], has_more: false }) }
      : { ok: false, status: 401, text: async () => '' };
  assert.deepEqual(await new DropboxRemote(getToken, { fetchImpl }).list(), []);
  assert.deepEqual(asked, [false, true]);
  const refused = async () => ({ ok: false, status: 401, text: async () => '' });
  await assert.rejects(new DropboxRemote(getToken, { fetchImpl: refused }).list(), { code: 'syncAuth' });
});

test("fiabilité : un jeu ouvert puis enregistré ne perd pas ce que la synchronisation vient d'apporter", async () => {
  const { libs, sync } = await devices();
  const s = newSet({ title: 'Partagé', cards: [card('a')] });
  await libs[0].saveSet(s);
  await sync(0);
  await sync(1);
  // appareil 1 : jeu ouvert dans l'éditeur (copie en mémoire)
  const open = await libs[1].loadSet(s.id);
  // pendant ce temps, l'appareil 0 ajoute une carte et la synchronisation l'apporte sur l'appareil 1
  const s0 = await libs[0].loadSet(s.id);
  s0.cards.push(card('b'));
  await libs[0].saveSet(s0);
  await sync(0);
  const seen = [];
  libs[1].onExternalChange((p) => seen.push(p));
  await sync(1);
  assert.deepEqual(seen, [`sets/${s.id}.json`], 'le jeu ouvert est prévenu');
  // l'éditeur enregistre sa copie périmée (titre modifié) : la carte « b » est conservée
  open.title = 'Renommé';
  await libs[1].saveSet(open);
  const saved = await libs[1].loadSet(s.id);
  assert.equal(saved.title, 'Renommé');
  assert.deepEqual(saved.cards.map((c) => c.term).sort(), ['a', 'b']);
});

test('fiabilité : supprimer une carte puis « Annuler » la garde, même après enregistrement de la suppression', async () => {
  const lib = await mkLib();
  const a = card('a');
  const s = newSet({ cards: [a, card('b')] });
  await lib.saveSet(s);
  // suppression enregistrée (marque), puis annulation : carte restaurée et datée
  const [gone] = s.cards.splice(0, 1);
  const deletedAt = new Date(Date.now() - 1000).toISOString();
  s.deleted = { [gone.id]: deletedAt };
  await lib.saveSet(s);
  s.cards.unshift({ ...gone, restoredAt: new Date().toISOString() });
  delete s.deleted[gone.id];
  await lib.saveSet(s);
  assert.deepEqual(
    (await lib.loadSet(s.id)).cards.map((c) => c.term),
    ['a', 'b'],
  );
  const { mergeSets } = await import('../src/core/merge.js');
  // un autre appareil ne connaît que l'ancienne suppression (sans la carte) : la restauration l'emporte
  const other = {
    ...s,
    cards: s.cards.filter((c) => c.id !== a.id),
    deleted: { [a.id]: deletedAt },
    updated: '2000-01-01T00:00:00.000Z',
  };
  assert.ok(mergeSets(await lib.loadSet(s.id), other).cards.some((c) => c.id === a.id));
});

/** Faux Dropbox (dossier d'application) : requêtes utilisées par DropboxRemote. */
function fakeDropbox() {
  const files = new Map(); // chemin (/sets/…) → { bytes, rev }
  let n = 0;
  const ok = (body) => ({
    ok: true,
    status: 200,
    json: async () => body,
    arrayBuffer: async () => body.buffer,
    text: async () => '',
  });
  const fetchImpl = async (url, init) => {
    assert.match(init.headers.Authorization, /^Bearer jeton$/);
    const u = new URL(url);
    const args = init.headers['Dropbox-API-Arg'] && JSON.parse(init.headers['Dropbox-API-Arg']);
    if (u.pathname === '/2/files/list_folder' && !JSON.parse(init.body).recursive) {
      // premier niveau : dossiers et fichiers à la racine
      const top = new Set([...files.keys()].map((p) => p.split('/').slice(0, 2).join('/')));
      return ok({
        entries: [...top].map((p) => ({ '.tag': files.has(p) ? 'file' : 'folder', path_display: p })),
        has_more: false,
      });
    }
    if (u.pathname === '/2/files/list_folder') {
      // deux pages, pour la pagination
      const all = [...files].map(([p, f]) => ({ '.tag': 'file', path_display: p, rev: f.rev }));
      return ok({ entries: all.slice(0, 1), has_more: all.length > 1, cursor: 'suite' });
    }
    if (u.pathname === '/2/files/list_folder/continue') {
      const all = [...files].map(([p, f]) => ({ '.tag': 'file', path_display: p, rev: f.rev }));
      return ok({ entries: all.slice(1), has_more: false });
    }
    if (u.pathname === '/2/files/upload') {
      assert.equal(args.mode, 'overwrite');
      files.set(args.path, { bytes: new Uint8Array(init.body), rev: `r${++n}` });
      return ok({ rev: files.get(args.path).rev });
    }
    if (u.pathname === '/2/files/download') return ok(files.get(args.path).bytes);
    if (u.pathname === '/2/files/delete_v2') {
      const path = JSON.parse(init.body).path; // fichier, ou dossier et son contenu
      for (const p of [...files.keys()]) if (p === path || p.startsWith(path + '/')) files.delete(p);
      return ok({});
    }
    throw new Error(`requête inattendue ${url}`);
  };
  return { files, fetchImpl };
}

test('Dropbox : synchronisation entre deux appareils, liste paginée, suppression', async () => {
  const { DropboxRemote } = await import('../src/storage/dropbox.js');
  const dbx = fakeDropbox();
  const remote = () => new DropboxRemote(async () => 'jeton', { fetchImpl: dbx.fetchImpl });
  const libs = [await mkLib(), await mkLib()];
  const states = [{}, {}];
  const sync = async (i) => {
    const r = await syncLibrary(libs[i], remote(), states[i]);
    states[i] = r.state;
    return r;
  };
  const media = await libs[0].putMedia(new Uint8Array([9, 8, 7]), 'png');
  const s = newSet({ title: 'Dropbox', cards: [{ ...card('a'), image: media }] });
  await libs[0].saveSet(s);
  assert.equal((await sync(0)).pushed, 2);
  assert.ok(dbx.files.has(`/sets/${s.id}.json`));
  assert.equal((await sync(1)).pulled, 2, 'les deux pages de la liste sont lues');
  assert.equal((await libs[1].loadSet(s.id)).title, 'Dropbox');
  await libs[1].deleteSet(s.id);
  await sync(1);
  await sync(0);
  assert.equal(await libs[0].loadSet(s.id), null);
});

test('stockage en ligne : nettoyage des fichiers étrangers, purge complète (Dropbox compris)', async () => {
  const { remote, libs, sync } = await devices();
  await libs[0].saveSet(newSet({ title: 'Gardé', cards: [card('a')] }));
  await sync(0);
  await remote.write('sets/notes.txt', new Uint8Array([1]));
  await remote.write('sets/01ABC (copie en conflit).json', new Uint8Array([1]));
  assert.equal(await removeStrayFiles(remote), 2);
  assert.deepEqual(
    (await remote.list()).map((f) => f.path.split('/')[0]),
    ['sets'],
    'seuls les fichiers de la bibliothèque restent',
  );
  await sync(1);
  assert.equal(await clearRemote(remote), 1);
  assert.deepEqual(
    (await remote.list()).map((f) => f.path),
    [PURGED],
  );
  assert.equal((await libs[0].listSets()).sets.length, 1, 'la bibliothèque locale est intacte');
  // un autre appareil encore relié ne prend pas le dossier purgé pour des suppressions
  await assert.rejects(sync(1), { code: 'syncRemoteEmpty' });
  assert.equal((await libs[1].listSets()).sets.length, 1);
  // reconnecté (état oublié) : sa bibliothèque est renvoyée ; la marque survit au nettoyage
  const r = await syncLibrary(libs[1], remote, {});
  assert.equal(r.pushed, 1);
  assert.equal(await removeStrayFiles(remote), 0);

  const { DropboxRemote } = await import('../src/storage/dropbox.js');
  const dbx = fakeDropbox();
  const dr = new DropboxRemote(async () => 'jeton', { fetchImpl: dbx.fetchImpl });
  for (const p of ['sets/a.json', 'media/b.png', 'progress/c.json', 'reste.txt'])
    await dr.write(p, new Uint8Array([1]));
  assert.equal(await clearRemote(dr), 4);
  assert.deepEqual([...dbx.files.keys()], ['/' + PURGED]);
});

test("sync : un jeu archivé sur un appareil l'est aussi sur l'autre (archive à part)", async () => {
  const { remote, libs, sync } = await devices();
  const s = newSet({ title: 'À ranger', cards: [card('a')] });
  await libs[0].saveSet(s);
  await sync(0);
  await sync(1);
  await libs[0].archiveSet(s.id);
  await sync(0);
  assert.ok((await remote.list()).some((f) => f.path === `archive/${s.id}.flashcard.zip`));
  await sync(1);
  assert.equal(await libs[1].loadSet(s.id), null);
  assert.equal((await libs[1].listArchives())[0].title, 'À ranger');
  // restauré sur le second : de retour partout, archive supprimée
  await libs[1].restoreArchive(s.id);
  await sync(1);
  await sync(0);
  assert.equal((await libs[0].loadSet(s.id)).title, 'À ranger');
  assert.equal((await libs[0].listArchives()).length, 0);
});

test("sync : réglages d'étude partagés, apparence des cartes et thème propres à chaque appareil", async () => {
  const { remote, libs, sync } = await devices();
  // A règle l'étude, son apparence des cartes et son thème
  await libs[0].saveSettings({
    ...libs[0].settings,
    newPerDay: 35,
    retention: 0.85,
    cardStyle: { paper: 'dots' },
    theme: 'sepia',
  });
  // B : première ouverture (langues par défaut, non datées), puis change seulement la lecture à voix haute
  await libs[1].saveSettings({ ...libs[1].settings, language: { term: 'en', definition: 'en' } }, { initial: true });
  await libs[1].saveSettings({ ...libs[1].settings, tts: false });
  await sync(0);
  await sync(1);
  await sync(0);
  for (const lib of libs) {
    const s = await lib.loadSettings();
    assert.equal(s.newPerDay, 35);
    assert.equal(s.retention, 0.85);
    assert.equal(s.tts, false, 'changement de B arrivé sur A, sans écraser ceux de A');
  }
  const [a, b] = await Promise.all(libs.map((l) => l.loadSettings()));
  assert.deepEqual(a.cardStyle, { paper: 'dots' });
  assert.deepEqual(b.cardStyle, {}, "l'apparence des cartes reste sur A");
  assert.equal(b.theme, 'auto', 'le thème reste sur A');
  assert.ok((await remote.list()).some((f) => f.path === 'shared/settings.json'));
});

test('réglages partagés : fusion par réglage, la modification la plus récente gagne, indépendante de l’ordre', async () => {
  const { mergeSharedSettings } = await import('../src/core/merge.js');
  const f = (values, changed) => ({ format: 'flashcard.sharedSettings', version: 1, values, changed });
  const a = f({ newPerDay: 10, tts: true }, { newPerDay: '2026-01-02', tts: '2026-01-01' });
  const b = f({ newPerDay: 50, tts: false }, { newPerDay: '2026-01-01', tts: '2026-01-03' });
  const m = mergeSharedSettings(a, b);
  assert.deepEqual(m.values, { newPerDay: 10, tts: false });
  assert.deepEqual(mergeSharedSettings(b, a), m);
  // non datée (valeur par défaut d'un nouvel appareil) : ne remplace pas une valeur choisie
  assert.equal(mergeSharedSettings(f({ newPerDay: 20 }, { newPerDay: '' }), a).values.newPerDay, 10);
});

test('sync : après une vérification complète, seuls les fichiers écrits depuis sont relus', async () => {
  const { remote, libs } = await devices();
  const lib = libs[0];
  const sets = [];
  for (let i = 0; i < 5; i++) {
    const s = newSet({ title: 'Jeu ' + i, cards: [card('a' + i)] });
    await lib.saveSet(s);
    sets.push(s);
  }
  const written = new Set();
  lib.onWrite((p) => written.add(p));
  let r = await syncLibrary(lib, remote, {}); // vérification complète
  const reads = [];
  const readFile = lib.readFile.bind(lib);
  lib.readFile = (p) => (reads.push(p), readFile(p));
  written.clear();
  sets[2].title = 'Modifié';
  await lib.saveSet(sets[2]);
  r = await syncLibrary(lib, remote, r.state, { unchanged: (p) => !written.has(p) });
  assert.deepEqual(reads, [`sets/${sets[2].id}.json`, `sets/${sets[2].id}.json`], 'relu pour l’empreinte puis envoyé');
  assert.equal(r.pushed, 1);
  // rien d'écrit : rien de relu
  reads.length = 0;
  written.clear();
  r = await syncLibrary(lib, remote, r.state, { unchanged: (p) => !written.has(p) });
  assert.deepEqual(reads, []);
  assert.equal(r.pushed + r.pulled, 0);
});
