// Bibliothèque : couche haut niveau au-dessus d'un magasin de fichiers (voir docs/SPEC.md).
import {
  DEFAULT_SETTINGS,
  collectMedia,
  newManifest,
  newProgress,
  normalizeProgress,
  normalizeSet,
  normalizeSettings,
  nowIso,
} from '../core/format.js';
import { sha256Hex } from '../core/ids.js';
import { mergeLogs, mergeProgress, mergeSets } from '../core/merge.js';
import { exportBundle, importBundle } from '../io/bundle.js';
import { AppError } from '../core/errors.js';

export const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  webm: 'audio/webm',
};
export const extOf = (name = '') => (name.match(/\.([a-z0-9]{1,6})$/i)?.[1] || 'bin').toLowerCase();

export class Library {
  /** @param {import('./stores.js').MemoryStore} store */
  constructor(store) {
    this.store = store;
    this._queues = new Map();
    this._urls = new Map();
    this._listeners = new Set();
    this._external = new Set();
  }

  // Sérialise les écritures par chemin (évite les entrelacements) ; prévient les abonnés
  // (synchronisation), sauf pour les écritures `silent` faites par la synchronisation elle-même.
  _enqueue(path, fn, { silent = false } = {}) {
    const prev = this._queues.get(path) || Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    this._queues.set(path, next);
    if (!silent)
      next.then(
        () => this._listeners.forEach((f) => f(path)),
        () => {},
      );
    return next;
  }

  /** Abonnement aux écritures de fichiers : `fn(path)` ; renvoie la fonction de désabonnement. */
  onWrite(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  // ---- fichiers bruts (synchronisation)
  listFiles(dir) {
    return this.store.list(dir);
  }
  async readFile(path) {
    await this._settled(path);
    return this.store.readBytes(path);
  }
  writeFile(path, bytes) {
    return this._writeExternal(path, () => this.store.writeBytes(path, bytes));
  }
  removeFile(path) {
    return this._writeExternal(path, () => this.store.remove(path));
  }
  /** Écriture venue d'ailleurs (synchronisation) : n'appelle pas `onWrite`, prévient `onExternalChange`. */
  async _writeExternal(path, fn) {
    await this._enqueue(path, fn, { silent: true });
    this._external.forEach((f) => f(path));
  }
  /** Abonnement aux fichiers modifiés par la synchronisation (ex. un jeu ouvert à recharger). */
  onExternalChange(fn) {
    this._external.add(fn);
    return () => this._external.delete(fn);
  }

  /** Attend les écritures en cours sur ce fichier : sinon on relit l'ancienne version
   *  (ex. quitter l'éditeur puis ouvrir aussitôt une étude). */
  async _settled(path) {
    await this._queues.get(path)?.catch(() => {});
  }

  async _readJson(path) {
    await this._settled(path);
    const t = await this.store.readText(path);
    if (t === null) return null;
    try {
      return JSON.parse(t);
    } catch (e) {
      throw new AppError('fileCorrupt', `Fichier corrompu : ${path} (${e.message})`, { path, m: e.message });
    }
  }

  _writeJson(path, obj) {
    return this._enqueue(path, () => this.store.writeText(path, JSON.stringify(obj, null, 2) + '\n'));
  }

  async init() {
    const m = await this._readJson('flashcard.json');
    if (!m) await this._writeJson('flashcard.json', newManifest());
    else if (m.format !== 'flashcard')
      throw new AppError('notALibrary', "Ce dossier n'est pas une bibliothèque Flashcard");
    else if (m.version > 1)
      throw new AppError('libraryVersion', `Bibliothèque de version ${m.version} non prise en charge`, {
        v: m.version,
      });
    this.settings = await this.loadSettings();
    return this;
  }

  // ---- paramètres
  async loadSettings() {
    return normalizeSettings(await this._readJson('settings.json'));
  }
  async saveSettings(s) {
    this.settings = { ...DEFAULT_SETTINGS, ...s };
    await this._writeJson('settings.json', this.settings);
  }

  // ---- jeux
  /** Liste des jeux (résumés). Ignore (et signale) les fichiers illisibles. */
  async listSets() {
    const out = [];
    const errors = [];
    for (const f of await this.store.list('sets')) {
      if (!f.endsWith('.json')) continue;
      try {
        const s = normalizeSet(await this._readJson(`sets/${f}`));
        out.push({
          id: s.id,
          title: s.title,
          folder: s.folder,
          count: s.cards.length,
          updated: s.updated,
          tags: s.tags,
          language: s.language,
          color: s.color,
        });
      } catch (e) {
        errors.push({ file: f, message: e.message });
      }
    }
    out.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
    return { sets: out, errors };
  }

  async loadSet(id) {
    const raw = await this._readJson(`sets/${id}.json`);
    if (!raw) return null;
    return normalizeSet(raw);
  }

  /**
   * Enregistre un jeu en le fusionnant avec la version sur disque : une synchronisation a pu y apporter
   * entre-temps les changements d'un autre appareil (les suppressions de cartes sont marquées, rien ne revient).
   */
  async saveSet(set) {
    set.updated = nowIso();
    const path = `sets/${set.id}.json`;
    await this._enqueue(path, async () => {
      let disk = null;
      try {
        disk = JSON.parse((await this.store.readText(path)) ?? 'null');
      } catch {
        disk = null; // fichier illisible : remplacé
      }
      const out = disk?.cards ? mergeSets(set, disk) : set; // à date égale, l'enregistrement en cours l'emporte
      await this.store.writeText(path, JSON.stringify(out, null, 2) + '\n');
    });
    return set;
  }

  async deleteSet(id) {
    for (const p of [`sets/${id}.json`, `progress/${id}.json`, `logs/${id}.jsonl`])
      await this._enqueue(p, () => this.store.remove(p));
  }

  /** Remise à zéro : jeux, progression, historique, médias et réglages supprimés ; le dossier reste une bibliothèque. */
  async wipe() {
    for (const dir of ['sets', 'progress', 'logs', 'media']) {
      for (const f of await this.store.list(dir))
        await this._enqueue(`${dir}/${f}`, () => this.store.remove(`${dir}/${f}`));
    }
    await this._enqueue('settings.json', () => this.store.remove('settings.json'));
    this.settings = normalizeSettings(null);
  }

  // ---- progression
  async loadProgress(setId) {
    return normalizeProgress(await this._readJson(`progress/${setId}.json`), setId);
  }
  async saveProgress(p) {
    await this._writeJson(`progress/${p.setId}.json`, p);
  }

  async appendLog(setId, lines) {
    if (!lines.length) return;
    const path = `logs/${setId}.jsonl`;
    await this._enqueue(path, async () => {
      const cur = (await this.store.readText(path)) || '';
      await this.store.writeText(path, cur + lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    });
  }
  async readLog(setId) {
    await this._settled(`logs/${setId}.jsonl`);
    const t = (await this.store.readText(`logs/${setId}.jsonl`)) || '';
    const out = [];
    for (const l of t.split('\n')) {
      if (!l.trim()) continue;
      try {
        out.push(JSON.parse(l));
      } catch {
        /* ligne corrompue ignorée */
      }
    }
    return out;
  }

  // ---- médias
  async putMedia(bytes, ext) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const path = `media/${await sha256Hex(u8)}.${ext.toLowerCase()}`;
    if (!(await this.store.exists(path))) await this._enqueue(path, () => this.store.writeBytes(path, u8));
    return path;
  }
  async readMedia(path) {
    return this.store.readBytes(path);
  }
  /** URL d'objet (blob:) pour afficher un média ; mise en cache. */
  async mediaUrl(path) {
    if (!path || !path.startsWith('media/')) return path;
    if (this._urls.has(path)) return this._urls.get(path);
    const b = await this.store.readBytes(path);
    if (!b) return '';
    const url = URL.createObjectURL(new Blob([b], { type: MIME[extOf(path)] || 'application/octet-stream' }));
    this._urls.set(path, url);
    return url;
  }
  /** Supprime les médias que plus aucune carte ne référence. Renvoie le nombre de fichiers supprimés. */
  async gcMedia() {
    const used = new Set();
    for (const f of await this.store.list('sets')) {
      const s = await this._readJson(`sets/${f}`).catch(() => null);
      if (!s?.cards) continue;
      for (const p of collectMedia(s)) used.add(p);
    }
    let n = 0;
    for (const f of await this.store.list('media')) {
      if (!used.has(`media/${f}`)) {
        await this.store.remove(`media/${f}`);
        this._urls.delete(`media/${f}`);
        n++;
      }
    }
    return n;
  }

  // ---- import / export
  /** Ajoute des jeux (et médias). Un jeu dont l'id existe déjà est fusionné (jamais écrasé). */
  async addSets(sets, media = new Map(), { progress = {}, logs = {} } = {}) {
    for (const [p, bytes] of media)
      if (!(await this.store.exists(p))) await this._enqueue(p, () => this.store.writeBytes(p, bytes));
    const ids = [];
    for (const s of sets) {
      const existing = await this.loadSet(s.id).catch(() => null);
      await this._writeJson(`sets/${s.id}.json`, existing ? mergeSets(existing, s) : s);
      if (progress[s.id]) await this.saveProgress(mergeProgress(await this.loadProgress(s.id), progress[s.id]));
      if (logs[s.id]) {
        const path = `logs/${s.id}.jsonl`;
        await this._enqueue(path, async () =>
          this.store.writeText(path, mergeLogs((await this.store.readText(path)) || '', logs[s.id])),
        );
      }
      ids.push(s.id);
    }
    return ids;
  }

  async importBundleBytes(bytes) {
    const b = await importBundle(bytes);
    return this.addSets(b.sets, b.media, { progress: b.progress, logs: b.logs });
  }

  async exportBundleBytes(setIds, { withProgress = true } = {}) {
    const sets = [];
    const progress = {};
    const logs = {};
    for (const id of setIds) {
      const s = await this.loadSet(id);
      if (!s) continue;
      sets.push(s);
      if (withProgress) {
        progress[id] = await this.loadProgress(id);
        const l = await this.store.readText(`logs/${id}.jsonl`);
        if (l) logs[id] = l;
      }
    }
    return exportBundle({ sets, progress, logs, getMedia: (p) => this.readMedia(p) });
  }

  /**
   * Résout les fichiers « en conflit » créés par les services de synchronisation
   * (ex. « abc 2.json », « abc (conflit).json », « abc.sync-conflict-….json ») : fusion puis suppression.
   * @returns {Promise<number>} nombre de fichiers fusionnés
   */
  async resolveConflicts() {
    let merged = 0;
    const CONFLICT = /^([0-9A-HJKMNP-TV-Z]{26})(?:[ _.(-].*)\.(json|jsonl)$/;
    for (const dir of ['sets', 'progress', 'logs']) {
      for (const f of await this.store.list(dir)) {
        const m = f.match(CONFLICT);
        if (!m) continue;
        const [, id, ext] = m;
        const cpath = `${dir}/${f}`;
        const mainPath = `${dir}/${id}.${ext}`;
        try {
          if (dir === 'logs') {
            const a = (await this.store.readText(mainPath)) || '';
            const b = (await this.store.readText(cpath)) || '';
            await this.store.writeText(mainPath, mergeLogs(a, b));
          } else if (dir === 'progress') {
            const a = await this._readJson(mainPath);
            const b = await this._readJson(cpath);
            await this._writeJson(
              mainPath,
              mergeProgress(a ? normalizeProgress(a, id) : null, normalizeProgress(b, id)),
            );
          } else {
            const a = await this._readJson(mainPath);
            const b = await this._readJson(cpath);
            await this._writeJson(mainPath, mergeSets(a ? normalizeSet(a) : null, normalizeSet(b)));
          }
          await this.store.remove(cpath);
          merged++;
        } catch {
          /* fichier illisible : on le laisse pour inspection manuelle */
        }
      }
    }
    return merged;
  }
}

export { newProgress };
