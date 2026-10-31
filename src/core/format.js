// Modèle de données Flashcard v1 : création, validation, normalisation.
import { isId, ulid } from './ids.js';
import { MODES as OCCLUSION_MODES, normalizeMasks } from './occlusion.js';
import { isHex, sanitizeStyle } from './style.js';
import { AppError } from './errors.js';

export const FORMAT_VERSION = 1;
export const APP_ID = 'flashcard 0.1.0';

export const nowIso = () => new Date().toISOString();

export function newManifest() {
  return { format: 'flashcard', version: FORMAT_VERSION, created: nowIso(), app: APP_ID };
}

export function newCard(partial = {}) {
  return {
    id: ulid(),
    type: 'basic',
    term: '',
    definition: '',
    hint: '',
    example: '',
    image: null,
    termImage: null,
    audio: null,
    style: {},
    tags: [],
    ...partial,
  };
}

/** Copie indépendante d'un jeu : nouveaux identifiants (jeu et cartes), sans l'historique des suppressions. */
export function copySet(set, title = set.title) {
  const now = nowIso();
  const { deleted, ...rest } = set;
  return {
    ...rest,
    id: ulid(),
    title,
    created: now,
    updated: now,
    cards: set.cards.map((c) => ({ ...c, id: ulid() })),
  };
}

export function newSet(partial = {}) {
  const t = nowIso();
  return {
    format: 'flashcard.set',
    version: FORMAT_VERSION,
    id: ulid(),
    title: 'Nouveau jeu',
    description: '',
    folder: '',
    language: { term: null, definition: null },
    tags: [],
    color: null,
    style: {},
    created: t,
    updated: t,
    cards: [],
    ...partial,
  };
}

export function newProgress(setId) {
  return {
    format: 'flashcard.progress',
    version: FORMAT_VERSION,
    setId,
    items: {},
    starred: {},
    flags: {},
    suspended: {},
    daily: {},
    exam: null,
    games: {},
  };
}

export const DEFAULT_SETTINGS = {
  format: 'flashcard.settings',
  version: FORMAT_VERSION,
  lang: 'fr',
  theme: 'auto',
  readingFont: 'default', // police de l'interface et des cartes (voir ui/themes.js)
  language: { term: null, definition: null }, // langues proposées aux nouveaux jeux
  initialized: false, // première ouverture traitée (voir ui/first-run.js)
  newPerDay: 20,
  reviewsPerDay: 200,
  retention: 0.9,
  typoTolerance: true,
  tts: true,
};

/** Valide et nettoie un objet « set » lu depuis un fichier. Lève une Error si invalide. */
/** Cartes supprimées { id: date ISO } (synchronisation) : seules les entrées valides sont gardées. */
function deletedOf(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = Object.fromEntries(Object.entries(raw).filter(([id, at]) => isId(id) && typeof at === 'string'));
  return Object.keys(out).length ? { deleted: out } : {};
}

export function normalizeSet(raw) {
  if (!raw || typeof raw !== 'object') throw new AppError('setInvalid', 'Fichier de jeu invalide');
  if (raw.format !== 'flashcard.set')
    throw new AppError('notASet', "Ce fichier n'est pas un jeu Flashcard (format ≠ flashcard.set)");
  if (typeof raw.version !== 'number' || raw.version > FORMAT_VERSION) {
    throw new AppError('setVersion', `Version de format non prise en charge : ${raw.version}`, { v: raw.version });
  }
  const seen = new Set();
  const cards = (Array.isArray(raw.cards) ? raw.cards : []).map((c) => {
    // Type inconnu (version plus récente) : conservé tel quel, jamais étudié ni réécrit en « basic ».
    const type = typeof c.type === 'string' && c.type ? c.type : 'basic';
    const card = newCard({
      ...c,
      type,
      term: String(c.term ?? ''),
      definition: String(c.definition ?? ''),
      hint: String(c.hint ?? ''),
      example: String(c.example ?? ''),
      image: c.image || null,
      termImage: c.termImage || null,
      audio: c.audio || null,
      style: sanitizeStyle(c.style),
      tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
    });
    if (type === 'occlusion') {
      card.masks = normalizeMasks(c.masks);
      card.occlusion = OCCLUSION_MODES.includes(c.occlusion) ? c.occlusion : 'all';
    }
    if (!c.id || seen.has(c.id)) card.id = ulid();
    seen.add(card.id);
    return card;
  });
  const base = newSet();
  return {
    ...raw,
    id: raw.id || base.id,
    title: String(raw.title ?? 'Sans titre'),
    description: String(raw.description ?? ''),
    folder: String(raw.folder ?? ''),
    language: { term: raw.language?.term ?? null, definition: raw.language?.definition ?? null },
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    color: isHex(raw.color) ? raw.color.toUpperCase() : null,
    style: sanitizeStyle(raw.style),
    created: raw.created || base.created,
    updated: raw.updated || base.updated,
    cards,
    ...deletedOf(raw.deleted),
  };
}

export function normalizeProgress(raw, setId) {
  const base = newProgress(setId);
  if (!raw || raw.format !== 'flashcard.progress') return base;
  if (raw.version > FORMAT_VERSION)
    throw new AppError('progressVersion', `Version de progression non prise en charge : ${raw.version}`, {
      v: raw.version,
    });
  return {
    ...base,
    ...raw,
    items: raw.items || {},
    starred: raw.starred || {},
    flags: raw.flags || {},
    suspended: raw.suspended || {},
    daily: raw.daily || {},
    games: raw.games || {},
  };
}

export function normalizeSettings(raw) {
  return { ...DEFAULT_SETTINGS, ...(raw && raw.format === 'flashcard.settings' ? raw : {}) };
}

/** Tous les chemins media/… référencés par un jeu (images, audio, images de fond, markdown). */
export function collectMedia(set) {
  const used = new Set();
  const add = (p) => p && typeof p === 'string' && p.startsWith('media/') && used.add(p);
  add(set.style?.bgImage);
  for (const c of set.cards || []) {
    add(c.image);
    add(c.termImage);
    add(c.audio);
    add(c.style?.bgImage);
    for (const m of `${c.term}\n${c.definition}\n${c.hint}\n${c.example}`.matchAll(/\((media\/[^)\s]+)\)/g)) add(m[1]);
  }
  return used;
}
