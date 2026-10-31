// Import d'un fichier quelconque (détection par extension et contenu) → jeux prêts à être ajoutés.
import JSZip from 'jszip';
import { importApkg } from './apkg-import.js';
import { importBundle } from './bundle.js';
import { parseDelimited, rowsToCards } from './csv.js';
import { markdownToSet } from './markdown.js';
import { newSet, normalizeSet } from '../core/format.js';
import { AppError } from '../core/errors.js';

const extOf = (n) => (n.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
const baseName = (n) => n.replace(/\.(flashcard\.zip|[a-z0-9]+)$/i, '');
const decode = (bytes) => new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');

/**
 * @param {{name:string, bytes:Uint8Array}} file
 * @param {{delimiter?:string|null, rowDelimiter?:string|null}} [opts]
 * @returns {Promise<{kind:string, sets:Array, media:Map, progress:Object, logs:Object, warnings:string[]}>}
 */
export async function parseImportFile({ name, bytes }, opts = {}) {
  const ext = extOf(name);
  const empty = { media: new Map(), progress: {}, logs: {}, warnings: [] };
  if (ext === 'apkg' || ext === 'colpkg') return { kind: 'anki', ...empty, ...(await importApkg(bytes)) };
  if (ext === 'zip') {
    const zip = await JSZip.loadAsync(bytes);
    if (zip.file('flashcard.json'))
      return { kind: 'flashcard', ...empty, ...(await importBundle(bytes)), warnings: [] };
    if (zip.file('collection.anki21b') || zip.file('collection.anki21') || zip.file('collection.anki2'))
      return { kind: 'anki', ...empty, ...(await importApkg(bytes)) };
    throw new AppError('archiveUnknown', 'Archive non reconnue (ni Flashcard ni Anki)');
  }
  const text = decode(bytes);
  if (ext === 'json') {
    const raw = JSON.parse(text);
    return { kind: 'flashcard', ...empty, sets: [normalizeSet(raw)] };
  }
  if (ext === 'md' || ext === 'markdown') {
    const s = markdownToSet(text, baseName(name));
    if (!s.cards.length) throw new AppError('markdownEmpty', 'Aucune carte reconnue dans ce fichier Markdown');
    return { kind: 'markdown', ...empty, sets: [s] };
  }
  if (['csv', 'tsv', 'txt', 'text', ''].includes(ext)) {
    const delimiter = opts.delimiter ?? (ext === 'tsv' ? '\t' : null);
    const cards = rowsToCards(parseDelimited(text, { delimiter, rowDelimiter: opts.rowDelimiter ?? null }));
    if (!cards.length) throw new AppError('fileEmpty', 'Aucune carte reconnue dans ce fichier');
    return { kind: 'text', ...empty, sets: [newSet({ title: opts.title || baseName(name), cards })] };
  }
  throw new AppError('formatUnsupported', `Format non pris en charge : .${ext}`, { ext });
}

/** Même chose pour du texte collé. */
export function parsePastedText(text, { title = 'Import', delimiter = null, rowDelimiter = null } = {}) {
  const cards = rowsToCards(parseDelimited(text, { delimiter, rowDelimiter }));
  return {
    kind: 'text',
    sets: cards.length ? [newSet({ title, cards })] : [],
    media: new Map(),
    progress: {},
    logs: {},
    warnings: [],
  };
}
