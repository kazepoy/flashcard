// Choix et ouverture du magasin de fichiers (dossier réel ou stockage du navigateur).
import { FsaStore, IdbStore } from '../storage/stores.js';
import { Library } from '../storage/library.js';
import { AppError } from '../core/errors.js';

const META = 'flashcard-meta';

function metaDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(META, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function metaGet(k) {
  const db = await metaDb();
  return new Promise((res, rej) => {
    const q = db.transaction('kv').objectStore('kv').get(k);
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
async function metaSet(k, v) {
  const db = await metaDb();
  return new Promise((res, rej) => {
    const tx = db.transaction('kv', 'readwrite');
    if (v === undefined) tx.objectStore('kv').delete(k);
    else tx.objectStore('kv').put(v, k);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export const fsaSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/**
 * Ouvre la bibliothèque.
 * @returns {Promise<{lib:Library, kind:'idb'|'fsa', folderName?:string, needsPermission?:FileSystemDirectoryHandle}>}
 */
export async function openLibrary() {
  let handle = null;
  try {
    handle = await metaGet('dirHandle');
  } catch {
    /* IndexedDB indisponible : on retombe sur le mode mémoire plus bas */
  }
  if (handle && handle.queryPermission) {
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      const lib = await new Library(new FsaStore(handle)).init();
      return { lib, kind: 'fsa', folderName: handle.name };
    }
    // Permission à redonner par un geste de l'utilisateur : on ouvre le stockage navigateur en attendant.
    const lib = await new Library(new IdbStore()).init();
    return { lib, kind: 'idb', needsPermission: handle, folderName: handle.name };
  }
  const lib = await new Library(new IdbStore()).init();
  try {
    navigator.storage?.persist?.();
  } catch {
    /* sans importance */
  }
  return { lib, kind: 'idb' };
}

/** Redemande l'accès au dossier mémorisé (doit être appelé depuis un clic). */
export async function reconnectFolder(handle) {
  const perm = await handle.requestPermission({ mode: 'readwrite' });
  if (perm !== 'granted') throw new AppError('folderDenied', 'Accès au dossier refusé');
  const lib = await new Library(new FsaStore(handle)).init();
  return { lib, kind: 'fsa', folderName: handle.name };
}

/** Ouvre le sélecteur de dossier ; `migrateFrom` : copie le contenu actuel dans le dossier choisi. */
export async function chooseFolder({ migrateFrom = null } = {}) {
  const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'flashcard-library' });
  const store = new FsaStore(handle);
  if (migrateFrom) await copyStore(migrateFrom, store);
  const lib = await new Library(store).init();
  await metaSet('dirHandle', handle);
  return { lib, kind: 'fsa', folderName: handle.name };
}

export async function openBrowserStorage() {
  await metaSet('dirHandle', undefined);
  const lib = await new Library(new IdbStore()).init();
  return { lib, kind: 'idb' };
}

export async function copyStore(from, to) {
  let n = 0;
  for (const f of ['flashcard.json', 'settings.json']) {
    const b = await from.readBytes(f);
    if (b && !(await to.exists(f))) {
      await to.writeBytes(f, b);
      n++;
    }
  }
  for (const dir of ['sets', 'progress', 'logs', 'media']) {
    for (const f of await from.list(dir)) {
      const p = `${dir}/${f}`;
      if (await to.exists(p)) continue;
      const b = await from.readBytes(p);
      if (b) {
        await to.writeBytes(p, b);
        n++;
      }
    }
  }
  return n;
}
