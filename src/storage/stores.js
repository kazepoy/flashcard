// Magasins de fichiers : une interface minimale, trois implémentations.
//   MemoryStore : tests
//   IdbStore    : navigateur (IndexedDB), partout
//   FsaStore    : dossier réel via File System Access API (Chrome, Edge, Opera… bureau)
//
// Interface : list(dir) → noms de fichiers ; readText/writeText ; readBytes/writeBytes ; remove ; exists.

const enc = new TextEncoder();
const dec = new TextDecoder();

export class MemoryStore {
  constructor() {
    this.files = new Map();
    this.kind = 'memory';
  }
  async list(dir) {
    const p = dir.replace(/\/?$/, '/');
    return [...this.files.keys()]
      .filter((k) => k.startsWith(p) && !k.slice(p.length).includes('/'))
      .map((k) => k.slice(p.length));
  }
  async exists(path) {
    return this.files.has(path);
  }
  async readBytes(path) {
    const v = this.files.get(path);
    return v ? v.slice() : null;
  }
  async readText(path) {
    const v = this.files.get(path);
    return v ? dec.decode(v) : null;
  }
  async writeBytes(path, bytes) {
    this.files.set(path, new Uint8Array(bytes));
  }
  async writeText(path, text) {
    this.files.set(path, enc.encode(text));
  }
  async remove(path) {
    this.files.delete(path);
  }
}

export class IdbStore {
  constructor(name = 'flashcard-library') {
    this.name = name;
    this.kind = 'idb';
    this._db = null;
  }
  _open() {
    if (!this._db) {
      this._db = new Promise((resolve, reject) => {
        const req = indexedDB.open(this.name, 1);
        req.onupgradeneeded = () => req.result.createObjectStore('files');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this._db;
  }
  async _tx(mode, fn) {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', mode);
      const r = fn(tx.objectStore('files'));
      tx.oncomplete = () => resolve(r?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  async list(dir) {
    const p = dir.replace(/\/?$/, '/');
    const keys = await this._tx('readonly', (s) => s.getAllKeys());
    return keys.filter((k) => k.startsWith(p) && !k.slice(p.length).includes('/')).map((k) => k.slice(p.length));
  }
  async exists(path) {
    return (await this.readBytes(path)) !== null;
  }
  async readBytes(path) {
    const v = await this._tx('readonly', (s) => s.get(path));
    return v ? new Uint8Array(v) : null;
  }
  async readText(path) {
    const v = await this.readBytes(path);
    return v ? dec.decode(v) : null;
  }
  async writeBytes(path, bytes) {
    const buf = bytes instanceof Uint8Array ? bytes.slice().buffer : bytes;
    await this._tx('readwrite', (s) => s.put(buf, path));
  }
  async writeText(path, text) {
    await this.writeBytes(path, enc.encode(text));
  }
  async remove(path) {
    await this._tx('readwrite', (s) => s.delete(path));
  }
}

export class FsaStore {
  /** @param {FileSystemDirectoryHandle} root */
  constructor(root) {
    this.root = root;
    this.kind = 'fsa';
    this.name = root.name;
  }
  async _dir(path, create = false) {
    const parts = path.split('/').filter(Boolean);
    const file = parts.pop();
    let d = this.root;
    for (const p of parts) d = await d.getDirectoryHandle(p, { create });
    return { d, file };
  }
  async list(dir) {
    try {
      const { d } = await this._dir(dir.replace(/\/?$/, '/') + '_');
      const out = [];
      for await (const [name, h] of d.entries()) if (h.kind === 'file') out.push(name);
      return out;
    } catch {
      return [];
    }
  }
  async exists(path) {
    try {
      const { d, file } = await this._dir(path);
      await d.getFileHandle(file);
      return true;
    } catch {
      return false;
    }
  }
  async readBytes(path) {
    try {
      const { d, file } = await this._dir(path);
      const f = await (await d.getFileHandle(file)).getFile();
      return new Uint8Array(await f.arrayBuffer());
    } catch (e) {
      if (e && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError')) return null;
      throw e;
    }
  }
  async readText(path) {
    const b = await this.readBytes(path);
    return b ? dec.decode(b) : null;
  }
  async writeBytes(path, bytes) {
    const { d, file } = await this._dir(path, true);
    const w = await (await d.getFileHandle(file, { create: true })).createWritable();
    await w.write(bytes);
    await w.close();
  }
  async writeText(path, text) {
    await this.writeBytes(path, enc.encode(text));
  }
  async remove(path) {
    try {
      const { d, file } = await this._dir(path);
      await d.removeEntry(file);
    } catch (e) {
      if (!(e && e.name === 'NotFoundError')) throw e;
    }
  }
}
