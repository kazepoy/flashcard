// Bibliothèque : couche haut niveau au-dessus d'un magasin de fichiers (voir docs/SPEC.md).
import {
  DEFAULT_SETTINGS,
  SHARED_SETTINGS,
  collectMedia,
  newManifest,
  newProgress,
  normalizeProgress,
  normalizeSet,
  normalizeSettings,
  normalizeSharedSettings,
  nowIso,
} from '../core/format.js';
import { sha256Hex } from '../core/ids.js';
import { cardIdOfItem } from '../core/items.js';
import { mergeLogs, mergeProgress, mergeSets, mergeSharedSettings } from '../core/merge.js';
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
/** Partie partagée de réglages (format de shared/settings.json), avec les dates de `sharedChanged`. */
const sharedOf = (settings) => ({
  format: 'flashcard.sharedSettings',
  version: 1,
  values: Object.fromEntries(SHARED_SETTINGS.map((k) => [k, settings[k]])),
  changed: Object.fromEntries(SHARED_SETTINGS.map((k) => [k, settings.sharedChanged?.[k] || ''])),
});

/** Réglages partagés entre appareils (voir core/format.js : SHARED_SETTINGS). */
export const SHARED_PATH = 'shared/settings.json';

/** Nom d'un jeu archivé : archive/<id>.flashcard.zip. */
const ARCHIVE = /^([0-9A-Z]{26})\.flashcard\.zip$/;

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
    const { settings, repair } = await this._readSettings();
    this.settings = settings;
    if (repair) await this._mergeShared(repair);
    return this;
  }

  // ---- paramètres : settings.json (propres à l'appareil) et shared/settings.json (synchronisés). La copie
  // locale garde aussi les réglages partagés et la date de leur dernière modification (`sharedChanged`) : si
  // l'écriture du fichier partagé n'a pas abouti (page fermée ou rechargée entre les deux écritures), la version
  // la plus récente des deux l'emporte au chargement, et le fichier partagé est réparé à l'ouverture.

  /** Réglages effectifs, et fichier partagé à réécrire s'il est en retard sur la copie locale (sinon null). */
  async _readSettings() {
    const local = normalizeSettings(await this._readJson('settings.json'));
    const file = normalizeSharedSettings(await this._readJson(SHARED_PATH).catch(() => null));
    const merged = mergeSharedSettings(file, sharedOf(local));
    const settings = { ...local, ...merged.values, sharedChanged: merged.changed };
    // à réparer seulement si la copie locale a une modification plus récente que le fichier partagé
    const behind = SHARED_SETTINGS.some((k) => (local.sharedChanged?.[k] || '') > (file.changed[k] || ''));
    return { settings, repair: behind ? merged : null };
  }
  async loadSettings() {
    return (await this._readSettings()).settings;
  }

  /**
   * Enregistre les réglages. Les réglages partagés modifiés sont datés : la synchronisation garde, pour chacun,
   * la valeur la plus récente. `initial` (première ouverture) : valeurs par défaut de l'appareil, non datées,
   * qui ne remplacent pas celles déjà choisies sur un autre appareil.
   */
  async saveSettings(s, { initial = false } = {}) {
    const prev = this.settings || normalizeSettings(null);
    const now = new Date().toISOString();
    const stamps = { ...prev.sharedChanged };
    for (const k of SHARED_SETTINGS) if (!initial && JSON.stringify(s[k]) !== JSON.stringify(prev[k])) stamps[k] = now;
    const next = { ...DEFAULT_SETTINGS, ...s, sharedChanged: stamps };
    this.settings = next;
    await this._writeJson('settings.json', next); // d'abord la copie locale, datée
    await this._mergeShared(sharedOf(next));
  }

  /** Fusionne `shared` dans shared/settings.json (le plus récent gagne, réglage par réglage). */
  _mergeShared(shared) {
    return this._enqueue(SHARED_PATH, async () => {
      const file = normalizeSharedSettings(JSON.parse((await this.store.readText(SHARED_PATH)) ?? 'null'));
      const merged = mergeSharedSettings(file, shared);
      if (JSON.stringify(merged) !== JSON.stringify(file))
        await this.store.writeText(SHARED_PATH, JSON.stringify(merged, null, 2) + '\n');
    });
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
          created: s.created,
          tags: s.tags,
          language: s.language,
          color: s.color,
          inactive: s.inactive,
          styled: Object.keys(s.style).length > 0, // apparence propre au jeu (remplace celle des réglages)
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
      let disk;
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

  /**
   * Déplace des cartes `[{ setId, cardId }, …]` vers `targetSetId`, avec leur progression
   * (FSRS, maîtrise, étoile, drapeau, suspension) et leur historique de révisions.
   * @returns {Promise<number>} nombre de cartes effectivement déplacées
   */
  async moveCards(sources, targetSetId) {
    const bySet = new Map();
    for (const { setId, cardId } of sources || []) {
      if (!setId || !cardId || setId === targetSetId) continue;
      if (!bySet.has(setId)) bySet.set(setId, new Set());
      bySet.get(setId).add(cardId);
    }
    if (!bySet.size) return 0;
    const targetSet = await this.loadSet(targetSetId);
    if (!targetSet) return 0;

    const after = (iso) => new Date(Math.max(Date.now(), iso ? new Date(iso).getTime() + 1 : 0)).toISOString();
    const movedCards = [];
    const progressPatches = [];
    const movedLogChunks = [];

    for (const [fromSetId, cardIds] of bySet) {
      const fromSet = await this.loadSet(fromSetId);
      if (!fromSet) continue;
      const moving = fromSet.cards.filter((c) => cardIds.has(c.id));
      if (!moving.length) continue;
      const movedIds = new Set(moving.map((c) => c.id));
      fromSet.cards = fromSet.cards.filter((c) => !movedIds.has(c.id));
      fromSet.deleted = { ...fromSet.deleted };
      for (const c of moving) fromSet.deleted[c.id] = after(c.restoredAt);
      await this.saveSet(fromSet);
      movedCards.push(...moving);

      const fromProgress = await this.loadProgress(fromSetId);
      const patch = newProgress(targetSetId);
      let hasProgress = false;
      for (const [itemId, it] of Object.entries(fromProgress.items)) {
        if (movedIds.has(cardIdOfItem(itemId))) {
          patch.items[itemId] = it;
          delete fromProgress.items[itemId];
          hasProgress = true;
        }
      }
      for (const id of movedIds) {
        if (fromProgress.starred[id]) {
          patch.starred[id] = true;
          delete fromProgress.starred[id];
          hasProgress = true;
        }
        if (fromProgress.flags?.[id]) {
          patch.flags[id] = fromProgress.flags[id];
          delete fromProgress.flags[id];
          hasProgress = true;
        }
        if (fromProgress.suspended?.[id]) {
          patch.suspended[id] = fromProgress.suspended[id];
          delete fromProgress.suspended[id];
          hasProgress = true;
        }
      }
      if (hasProgress) {
        await this.saveProgress(fromProgress);
        progressPatches.push(patch);
      }

      const srcLogPath = `logs/${fromSetId}.jsonl`;
      await this._settled(srcLogPath);
      const rawLog = await this.store.readText(srcLogPath);
      if (rawLog) {
        const kept = [];
        const taken = [];
        for (const line of rawLog.split('\n')) {
          if (!line.trim()) continue;
          let moveLine = false;
          try {
            const parsed = JSON.parse(line);
            moveLine = !!(parsed.item && movedIds.has(cardIdOfItem(parsed.item)));
          } catch {
            /* ligne corrompue gardée sur place */
          }
          (moveLine ? taken : kept).push(line);
        }
        if (taken.length) {
          movedLogChunks.push(taken.join('\n') + '\n');
          await this._enqueue(srcLogPath, () =>
            this.store.writeText(srcLogPath, kept.length ? kept.join('\n') + '\n' : ''),
          );
        }
      }
    }

    if (!movedCards.length) return 0;

    const existingIds = new Set(targetSet.cards.map((c) => c.id));
    for (const c of movedCards) {
      if (existingIds.has(c.id)) continue;
      const delAt = targetSet.deleted?.[c.id];
      if (delAt) delete targetSet.deleted[c.id];
      targetSet.cards.push(delAt || c.restoredAt ? { ...c, restoredAt: after(delAt || c.restoredAt) } : c);
      existingIds.add(c.id);
    }
    if (targetSet.deleted && !Object.keys(targetSet.deleted).length) delete targetSet.deleted;
    await this.saveSet(targetSet);

    if (progressPatches.length) {
      let dstProgress = await this.loadProgress(targetSetId);
      for (const p of progressPatches) dstProgress = mergeProgress(dstProgress, p);
      await this.saveProgress(dstProgress);
    }

    if (movedLogChunks.length) {
      const dstLogPath = `logs/${targetSetId}.jsonl`;
      await this._enqueue(dstLogPath, async () => {
        const cur = (await this.store.readText(dstLogPath)) || '';
        await this.store.writeText(dstLogPath, mergeLogs(cur, movedLogChunks.join('\n')));
      });
    }

    return movedCards.length;
  }

  // ---- archives : un jeu archivé est une archive d'échange (jeu, progression, journal, médias) rangée dans
  // archive/<id>.flashcard.zip, synchronisée comme le reste ; il disparaît de la bibliothèque jusqu'à sa restauration.
  /** Archive un jeu puis le retire de la bibliothèque. */
  async archiveSet(id) {
    const path = `archive/${id}.flashcard.zip`;
    const bytes = await this.exportBundleBytes([id]);
    await this._enqueue(path, () => this.store.writeBytes(path, bytes));
    await this.deleteSet(id);
  }

  /** Jeux archivés (résumés), du plus récemment modifié au plus ancien ; les archives illisibles sont ignorées. */
  async listArchives() {
    const out = [];
    for (const f of await this.store.list('archive')) {
      const m = f.match(ARCHIVE);
      if (!m) continue;
      try {
        const { sets } = await importBundle(await this.readFile(`archive/${f}`));
        const s = sets.find((x) => x.id === m[1]) || sets[0];
        if (s) out.push({ id: m[1], title: s.title, folder: s.folder, count: s.cards.length, updated: s.updated });
      } catch {
        /* archive illisible : ignorée */
      }
    }
    return out.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  }

  /** Remet un jeu archivé dans la bibliothèque (fusionné s'il y existe déjà) et supprime l'archive. */
  async restoreArchive(id) {
    const path = `archive/${id}.flashcard.zip`;
    const bytes = await this.readFile(path);
    if (!bytes) return [];
    const ids = await this.importBundleBytes(bytes);
    await this._enqueue(path, () => this.store.remove(path));
    return ids;
  }

  /** Supprime définitivement un jeu archivé. */
  async deleteArchive(id) {
    const path = `archive/${id}.flashcard.zip`;
    await this._enqueue(path, () => this.store.remove(path));
  }

  /** Remise à zéro : jeux, progression, historique, médias et réglages supprimés ; le dossier reste une bibliothèque. */
  async wipe() {
    for (const dir of ['sets', 'progress', 'logs', 'media', 'archive']) {
      for (const f of await this.store.list(dir))
        await this._enqueue(`${dir}/${f}`, () => this.store.remove(`${dir}/${f}`));
    }
    for (const p of ['settings.json', SHARED_PATH]) await this._enqueue(p, () => this.store.remove(p));
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

  /** Importe une archive d'échange ; ses jeux archivés absents d'ici rejoignent les archives. */
  async importBundleBytes(bytes) {
    const b = await importBundle(bytes);
    for (const [p, a] of b.archives)
      if (!(await this.store.exists(p))) await this._enqueue(p, () => this.store.writeBytes(p, a));
    return this.addSets(b.sets, b.media, { progress: b.progress, logs: b.logs });
  }

  /** `withArchives` : joint les jeux archivés (sauvegarde complète de la bibliothèque). */
  async exportBundleBytes(setIds, { withProgress = true, withArchives = false } = {}) {
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
    const archives = new Map();
    if (withArchives)
      for (const f of await this.store.list('archive'))
        if (ARCHIVE.test(f)) archives.set(`archive/${f}`, await this.readFile(`archive/${f}`));
    return exportBundle({ sets, progress, logs, getMedia: (p) => this.readMedia(p), archives });
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
            const b = (await this.store.readText(cpath)) || '';
            await this._enqueue(mainPath, async () =>
              this.store.writeText(mainPath, mergeLogs((await this.store.readText(mainPath)) || '', b)),
            );
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
