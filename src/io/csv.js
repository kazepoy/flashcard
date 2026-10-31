// CSV / TSV / texte Quizlet : analyse et export.
import { expandCard } from '../core/items.js';
import { newCard } from '../core/format.js';
import { hasCloze } from '../core/text.js';

/** Détecte le séparateur de colonnes le plus probable. */
export function detectDelimiter(text) {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, 20);
  if (!lines.length) return '\t';
  const score = (d) => lines.filter((l) => l.includes(d)).length;
  if (score('\t') >= Math.max(1, lines.length * 0.6)) return '\t';
  const sc = score(';');
  const cm = score(',');
  if (sc && sc >= cm) return ';';
  if (cm) return ',';
  return '\t';
}

/**
 * Analyse un texte délimité.
 * - `delimiter` d'un seul caractère : analyse RFC 4180 (guillemets, champs multi-lignes).
 * - `delimiter` plus long : simple découpage (ex. « :: », « - »).
 * - `rowDelimiter` personnalisé (ex. « ;; » ou « \n\n ») : sinon retours à la ligne.
 */
export function parseDelimited(text, { delimiter = null, rowDelimiter = null } = {}) {
  text = String(text).replace(/^\uFEFF/, '');
  const delim = delimiter ?? detectDelimiter(text);
  if (rowDelimiter && rowDelimiter !== '\n') {
    return text
      .split(rowDelimiter)
      .map((r) => r.replace(/^\s+|\s+$/g, ''))
      .filter((r) => r.length)
      .map((r) => splitRow(r, delim));
  }
  if (delim.length > 1) {
    return text
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => l.split(delim).map((x) => x.trim()));
  }
  const rows = [];
  let row = [];
  let field = '';
  let q = false;
  let wasQuoted = false;
  const pushField = () => {
    row.push(wasQuoted ? field : field.trim());
    field = '';
    wasQuoted = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += c;
    } else if (c === '"' && field.trim() === '') {
      q = true;
      wasQuoted = true;
      field = '';
    } else if (c === delim) pushField();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      pushField();
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  pushField();
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

function splitRow(r, delim) {
  if (delim.length > 1) return r.split(delim).map((x) => x.trim());
  return parseDelimited(r, { delimiter: delim })[0] || [''];
}

const HEADER_ALIASES = {
  term: ['term', 'terme', 'front', 'recto', 'question', 'mot', 'word'],
  definition: ['definition', 'définition', 'back', 'verso', 'answer', 'réponse', 'reponse', 'meaning', 'sens'],
  hint: ['hint', 'indice', 'aide'],
  example: ['example', 'exemple'],
  tags: ['tags', 'tag', 'étiquettes', 'etiquettes'],
  type: ['type'],
  image: ['image'],
  audio: ['audio', 'son'],
};

function headerMap(row) {
  const map = {};
  row.forEach((cell, idx) => {
    const k = cell.trim().toLowerCase();
    for (const [field, names] of Object.entries(HEADER_ALIASES))
      if (names.includes(k) && !(field in map)) map[field] = idx;
  });
  return 'term' in map && 'definition' in map ? map : null;
}

/** Transforme des lignes en cartes. Détecte une ligne d'en-tête (term, definition, …). */
export function rowsToCards(rows) {
  if (!rows.length) return [];
  const map = headerMap(rows[0]);
  const body = map ? rows.slice(1) : rows;
  const m = map || { term: 0, definition: 1 };
  const get = (r, f) => (f in m ? (r[m[f]] ?? '').trim() : '');
  const cards = [];
  for (const r of body) {
    const term = get(r, 'term');
    const definition = get(r, 'definition');
    if (!term && !definition) continue;
    const type = get(r, 'type') === 'cloze' || (hasCloze(term) && !definition) ? 'cloze' : 'basic';
    cards.push(
      newCard({
        type,
        term,
        definition,
        hint: get(r, 'hint'),
        example: get(r, 'example'),
        tags: get(r, 'tags')
          ? get(r, 'tags')
              .split(/[\s,]+/)
              .filter(Boolean)
          : [],
        image: get(r, 'image') || null,
        audio: get(r, 'audio') || null,
      }),
    );
  }
  return cards;
}

const esc = (v, d) => {
  const s = String(v ?? '');
  return s.includes(d) || /["\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/** Export CSV/TSV riche (toutes les colonnes). */
export function exportDelimited(set, { delimiter = ',' } = {}) {
  const head = ['term', 'definition', 'hint', 'example', 'tags', 'type', 'image', 'audio'];
  const lines = [head.join(delimiter)];
  for (const c of set.cards) {
    lines.push(
      [c.term, c.definition, c.hint, c.example, c.tags.join(' '), c.type, c.image || '', c.audio || '']
        .map((v) => esc(v, delimiter))
        .join(delimiter),
    );
  }
  return lines.join('\n') + '\n';
}

/**
 * Export « texte Quizlet » : une ligne par carte, terme⇥définition, sans guillemets.
 * Les textes à trous sont développés (un énoncé à trou par ligne).
 */
export function exportQuizletText(set, { termSep = '\t', cardSep = '\n' } = {}) {
  const flat = (s) =>
    String(s)
      .replace(/\s*[\r\n]+\s*/g, ' ')
      .replaceAll(termSep, ' ')
      .replaceAll(cardSep.trim() || '\u0000', ' ');
  const rows = [];
  for (const c of set.cards) {
    for (const it of expandCard(c, 'term')) rows.push(flat(it.prompt) + termSep + flat(it.answer));
  }
  return rows.join(cardSep);
}
