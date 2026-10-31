import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/storage/stores.js';
import { Library } from '../src/storage/library.js';
import { syncLibrary } from '../src/storage/sync.js';
import { newCard, newSet } from '../src/core/format.js';

const require = createRequire(import.meta.url);

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

/** Faux Google Drive : les requêtes REST utilisées par GDriveRemote, sur une table en mémoire. */
function fakeDrive() {
  const { createHash } = require('node:crypto');
  const files = new Map(); // id → { name, parents, mimeType, bytes, trashed }
  let n = 0;
  const md5 = (b) => createHash('md5').update(b).digest('hex');
  const ok = (body) => ({
    ok: true,
    status: 200,
    json: async () => body,
    arrayBuffer: async () => body.buffer,
    text: async () => '',
  });
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    calls.push(`${method} ${u.pathname}`);
    assert.match(init.headers.Authorization, /^Bearer jeton$/);
    const q = u.searchParams.get('q') || '';
    if (method === 'GET' && u.pathname === '/drive/v3/files') {
      const list = [...files]
        .filter(([, f]) => !f.trashed)
        .filter(([, f]) =>
          q.includes(' in parents')
            ? f.parents?.includes(q.match(/'([^']+)' in parents/)[1])
            : f.name === q.match(/name='([^']+)'/)[1],
        );
      return ok({ files: list.map(([id, f]) => ({ id, name: f.name, md5Checksum: f.bytes && md5(f.bytes) })) });
    }
    if (method === 'POST' && u.pathname === '/drive/v3/files') {
      const id = `id${++n}`;
      files.set(id, { ...JSON.parse(init.body) });
      return ok({ id });
    }
    if (method === 'POST' && u.pathname === '/upload/drive/v3/files') {
      const raw = Buffer.from(await init.body.arrayBuffer());
      const boundary = init.headers['Content-Type'].split('boundary=')[1];
      const parts = raw.toString('latin1').split(`--${boundary}`);
      const meta = JSON.parse(parts[1].split('\r\n\r\n')[1]);
      const body = Buffer.from(parts[2].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, ''), 'latin1');
      const id = `id${++n}`;
      files.set(id, { ...meta, bytes: new Uint8Array(body) });
      return ok({ id, md5Checksum: md5(body) });
    }
    const id = u.pathname.split('/').pop();
    if (method === 'PATCH' && u.pathname.startsWith('/upload/')) {
      files.get(id).bytes = new Uint8Array(init.body);
      return ok({ id, md5Checksum: md5(init.body) });
    }
    if (method === 'PATCH') {
      Object.assign(files.get(id), JSON.parse(init.body));
      return ok({ id });
    }
    if (method === 'GET' && u.searchParams.get('alt') === 'media') return ok(files.get(id).bytes);
    throw new Error(`requête inattendue ${method} ${url}`);
  };
  return { files, fetchImpl, calls };
}

test('Google Drive : dossier créé une fois, fichiers créés puis mis à jour, suppression en corbeille', async () => {
  const { GDriveRemote } = await import('../src/storage/gdrive.js');
  const drive = fakeDrive();
  const remote = () => new GDriveRemote(async () => 'jeton', { fetchImpl: drive.fetchImpl });
  const libs = [await mkLib(), await mkLib()];
  const states = [{}, {}];
  const sync = async (i) => {
    const r = await syncLibrary(libs[i], remote(), states[i]);
    states[i] = r.state;
    return r;
  };
  const s = newSet({ title: 'Drive', cards: [card('a')] });
  await libs[0].saveSet(s);
  await sync(0);
  assert.equal([...drive.files.values()].filter((f) => f.mimeType?.includes('folder')).length, 1);
  assert.equal((await sync(1)).pulled, 1);
  assert.equal((await libs[1].loadSet(s.id)).title, 'Drive');
  // mise à jour : même fichier Drive, nouveau contenu
  const s1 = await libs[1].loadSet(s.id);
  s1.title = 'Drive modifié';
  await libs[1].saveSet(s1);
  await sync(1);
  assert.equal([...drive.files.values()].filter((f) => f.name === `sets/${s.id}.json`).length, 1);
  await sync(0);
  assert.equal((await libs[0].loadSet(s.id)).title, 'Drive modifié');
  // suppression : mise à la corbeille, plus listée
  await libs[0].deleteSet(s.id);
  await sync(0);
  assert.equal([...drive.files.values()].find((f) => f.name === `sets/${s.id}.json`).trashed, true);
  await sync(1);
  assert.equal(await libs[1].loadSet(s.id), null);
});

/** Faux Microsoft Graph (dossier d'application) : requêtes utilisées par OneDriveRemote. */
function fakeGraph() {
  const items = new Map(); // id → { name, parent, folder, bytes, cTag }
  let n = 0;
  const ok = (body) => ({
    ok: true,
    status: 200,
    json: async () => body,
    arrayBuffer: async () => body.buffer,
    text: async () => '',
  });
  const notFound = { ok: false, status: 404, json: async () => ({}), text: async () => 'itemNotFound' };
  const byPath = (path) => {
    const [dir, name] = path.split('/');
    const folder = [...items].find(([, i]) => i.folder && i.name === dir)?.[0];
    if (!name) return folder;
    return [...items].find(([, i]) => i.parent === folder && i.name === name)?.[0];
  };
  const sessions = new Map();
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    if (u.host === 'download.example') return ok(items.get(u.pathname.slice(1)).bytes);
    if (u.host === 'upload.example') {
      const s = sessions.get(u.pathname.slice(1));
      const [, a, , total] = init.headers['Content-Range'].match(/bytes (\d+)-(\d+)\/(\d+)/);
      s.bytes.set(init.body, Number(a));
      if (Number(a) + init.body.length < Number(total)) return { ok: true, status: 202, json: async () => ({}) };
      return ok(put(s.path, s.bytes));
    }
    assert.match(init.headers.Authorization, /^Bearer jeton$/);
    const m = u.pathname.match(/approot:\/(.+?):\/(children|content|createUploadSession)$/);
    if (method === 'GET' && m?.[2] === 'children') {
      const folder = byPath(m[1]);
      if (!folder) return notFound;
      const value = [...items]
        .filter(([, i]) => i.parent === folder)
        .map(([id, i]) => ({ id, name: i.name, cTag: i.cTag, file: {} }));
      return ok({ value });
    }
    if (method === 'POST' && u.pathname.endsWith('/approot/children')) {
      const { name } = JSON.parse(init.body);
      if (byPath(name)) return { ok: false, status: 409, text: async () => 'nameAlreadyExists' };
      items.set(`f${++n}`, { name, folder: true });
      return ok({});
    }
    if (method === 'PUT' && m?.[2] === 'content') return ok(put(m[1], new Uint8Array(init.body)));
    if (method === 'POST' && m?.[2] === 'createUploadSession') {
      const total = 5 * 1024 * 1024 + 7;
      sessions.set(`s${++n}`, { path: m[1], bytes: new Uint8Array(total) });
      return ok({ uploadUrl: `https://upload.example/s${n}` });
    }
    const id = u.pathname.split('/').pop();
    if (method === 'GET' && u.searchParams.get('$select')?.includes('downloadUrl'))
      return ok({ id, '@microsoft.graph.downloadUrl': `https://download.example/${id}` });
    if (method === 'DELETE') {
      items.delete(id);
      return ok({});
    }
    throw new Error(`requête inattendue ${method} ${url}`);
  };
  function put(path, bytes) {
    const [dir, name] = path.split('/');
    const folder = byPath(dir);
    assert.ok(folder, `dossier ${dir} créé avant l'écriture`);
    const id = byPath(path) || `i${++n}`;
    items.set(id, { name, parent: folder, bytes, cTag: `c${++n}` });
    return { id, cTag: items.get(id).cTag };
  }
  return { items, fetchImpl };
}

test('OneDrive : sous-dossiers créés, synchronisation entre deux appareils, gros fichier par morceaux', async () => {
  const { OneDriveRemote } = await import('../src/storage/onedrive.js');
  const graph = fakeGraph();
  const remote = () => new OneDriveRemote(async () => 'jeton', { fetchImpl: graph.fetchImpl });
  const libs = [await mkLib(), await mkLib()];
  const states = [{}, {}];
  const sync = async (i) => {
    const r = await syncLibrary(libs[i], remote(), states[i]);
    states[i] = r.state;
    return r;
  };
  const big = new Uint8Array(5 * 1024 * 1024 + 7).map((_, i) => i % 251);
  const audio = await libs[0].putMedia(big, 'mp3');
  const s = newSet({ title: 'OneDrive', cards: [{ ...card('a'), audio }] });
  await libs[0].saveSet(s);
  assert.equal((await sync(0)).pushed, 2);
  assert.equal((await sync(1)).pulled, 2);
  assert.equal((await libs[1].loadSet(s.id)).title, 'OneDrive');
  assert.deepEqual((await libs[1].readMedia(audio)).slice(0, 5), big.slice(0, 5));
  assert.equal((await libs[1].readMedia(audio)).length, big.length);
  await libs[1].deleteSet(s.id);
  await sync(1);
  await sync(0);
  assert.equal(await libs[0].loadSet(s.id), null);
});

test("PKCE : défi S256 conforme à l'exemple de la RFC 7636", async () => {
  const { pkceChallenge } = await import('../src/ui/microsoft-auth.js');
  assert.equal(
    await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  );
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
