// Navigateur de cartes : lignes (une par carte, tous jeux confondus) et langage de recherche
// inspiré d'Anki. Pur : aucune dépendance au stockage ni au DOM.
//
//   chien              texte libre (terme, définition, indice, exemple), sans casse ni accents
//   "la mesa"          expression exacte ; * = n'importe quelle suite de caractères
//   -chien             négation ; `a or b` : l'un ou l'autre (« or » moins prioritaire que le ET implicite)
//   term:x  def:x      dans un champ (aussi hint:, example:)
//   set:x  deck:x      jeu dont le titre ou le dossier contient x
//   tag:x              étiquette de la carte ou du jeu (exacte, * permis)
//   is:new|learn|review|due|starred|flagged|suspended|cloze|occlusion|basic|dupe
//   flag:0..7          drapeau (0 = aucun)
//   has:image|audio|hint|example
//   added:n  rated:n   créée / révisée dans les n derniers jours
//   prop:lapses>3      propriétés FSRS : lapses, reps, ivl (jours), due (jours depuis aujourd'hui),
//                      s (stabilité), d (difficulté), r (rappel en %) ; opérateurs < > <= >= = !=
import { ulidTime } from './ids.js';
import { cardIdOfItem } from './items.js';
import { groupsOf } from './occlusion.js';
import { SrsState } from './srs.js';
import { clozeToPlain, normalizeAnswer, parseCloze, stripMarkdown } from './text.js';

const DAY = 86400000;

export const FLAGS = [
  { n: 1, id: 'red', hex: '#D64545' },
  { n: 2, id: 'orange', hex: '#E8892B' },
  { n: 3, id: 'green', hex: '#3E9B5A' },
  { n: 4, id: 'blue', hex: '#3F73D8' },
  { n: 5, id: 'pink', hex: '#D66BB1' },
  { n: 6, id: 'teal', hex: '#2BA6A6' },
  { n: 7, id: 'purple', hex: '#8A5CD6' },
];

/** Texte comparable : sans markdown, cloze, casse, accents ni ponctuation superflue. */
export const fold = (s = '') => normalizeAnswer(clozeToPlain(String(s)), { ignorePunct: false });

/** Clé de doublon : le terme (ou le texte d'un cloze) normalisé, ponctuation comprise ignorée. */
export const dupeKey = (card) => (card.type === 'occlusion' ? '' : normalizeAnswer(clozeToPlain(card.term || '')));

export const flagOf = (progress, cardId) => progress?.flags?.[cardId]?.f || 0;

/**
 * Une ligne par carte.
 * @param {Array<{set:object, progress:object}>} libs
 */
export function buildRows(libs) {
  const rows = [];
  for (const { set, progress } of libs) {
    for (const card of set.cards) {
      const itemIds =
        card.type === 'cloze'
          ? parseCloze(card.term).map((c) => `${card.id}#c${c.n}`)
          : card.type === 'occlusion'
            ? groupsOf(card.masks || []).map((n) => `${card.id}#o${n}`)
            : [card.id, `${card.id}~r`];
      const items = itemIds.map((id) => ({ id, it: progress.items[id] })).filter((x) => x.it || !x.id.endsWith('~r'));
      rows.push({
        key: `${set.id}/${card.id}`,
        set,
        progress,
        card,
        items,
        starred: !!progress.starred[card.id],
        flag: flagOf(progress, card.id),
        suspended: !!progress.suspended?.[card.id]?.s,
        added: ulidTime(card.id),
        // texte affiché (original, sans markdown) et texte cherché (normalisé)
        display: {
          term: stripMarkdown(
            clozeToPlain(
              card.type === 'occlusion'
                ? [card.term, ...(card.masks || []).map((m) => m.label || '')].filter((x) => x.trim()).join(' · ')
                : card.term,
            ),
          ),
          def: stripMarkdown(clozeToPlain(card.definition)),
        },
        text: {
          term: fold(
            card.type === 'occlusion'
              ? [card.term, ...(card.masks || []).map((m) => m.label || '')].join(' ')
              : card.term,
          ),
          def: fold(card.definition),
          hint: fold(card.hint),
          example: fold(card.example),
        },
        dupe: false,
      });
    }
  }
  const byKey = new Map();
  for (const r of rows) {
    const k = dupeKey(r.card);
    if (!k) continue;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(r);
  }
  for (const list of byKey.values()) if (list.length > 1) for (const r of list) r.dupe = true;
  return rows;
}

/** États FSRS des items vus d'une ligne. */
const seenSrs = (row) => row.items.map((x) => x.it?.srs).filter((s) => s && s.state !== SrsState.New);

/** Résumé d'une ligne pour l'affichage et le tri. */
export function rowSummary(row, now = new Date()) {
  const srs = seenSrs(row);
  const state = !srs.length
    ? 'new'
    : srs.some((s) => s.state === SrsState.Learning || s.state === SrsState.Relearning)
      ? 'learn'
      : 'review';
  const due = srs.length ? Math.min(...srs.map((s) => +new Date(s.due))) : null;
  const lastReview = srs.length ? Math.max(...srs.map((s) => (s.last_review ? +new Date(s.last_review) : 0))) : null;
  return {
    state,
    due,
    isDue: due != null && due <= +now,
    lapses: srs.reduce((a, s) => a + (s.lapses || 0), 0),
    reps: srs.reduce((a, s) => a + (s.reps || 0), 0),
    ivl: srs.length ? Math.min(...srs.map((s) => s.scheduled_days || 0)) : null,
    stability: srs.length ? Math.min(...srs.map((s) => s.stability || 0)) : null,
    difficulty: srs.length ? Math.max(...srs.map((s) => s.difficulty || 0)) : null,
    lastReview: lastReview || null,
  };
}

// ------------------------------------------------------------------ analyse de la requête

/** Découpe en jetons ; les guillemets regroupent, y compris après `champ:` (term:"la mesa"). */
export function tokenize(q = '') {
  const out = [];
  const re = /(-?)((?:[a-z]+:)?)(?:"([^"]*)"?|(\S+))/gi;
  let m;
  while ((m = re.exec(q))) {
    const quoted = m[3] != null;
    const value = quoted ? m[3] : m[4];
    if (!m[2] && !quoted && !m[1] && /^or$/i.test(value)) out.push({ or: true });
    else out.push({ neg: m[1] === '-', field: m[2] ? m[2].slice(0, -1).toLowerCase() : '', value, quoted });
  }
  return out;
}

/** Requête → disjonction de conjonctions : [[terme, …], …]. */
export function parseQuery(q) {
  const groups = [[]];
  for (const tok of tokenize(q)) {
    if (tok.or) {
      if (groups[groups.length - 1].length) groups.push([]);
    } else groups[groups.length - 1].push(tok);
  }
  return groups.filter((g) => g.length);
}

const wildcard = (v, whole) => {
  const body = String(v)
    .split('*')
    .map((x) => fold(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(whole ? `^${body}$` : body);
};

const PROP = /^(lapses|reps|ivl|due|s|d|r)(<=|>=|!=|<|>|=)(-?\d+(?:\.\d+)?)$/;
const cmp = (a, op, b) => ({ '<': a < b, '>': a > b, '<=': a <= b, '>=': a >= b, '=': a === b, '!=': a !== b })[op];

const FIELDS = {
  term: 'term',
  front: 'term',
  def: 'def',
  definition: 'def',
  back: 'def',
  hint: 'hint',
  example: 'example',
};

/**
 * Prédicat d'un jeton. `ctx` : {now, retrievability?(srs, now) → 0..1}.
 * Un jeton inconnu (ex. `foo:bar`) est cherché comme du texte libre.
 */
function matchToken(row, tok, ctx) {
  const { field, value } = tok;
  const v = value.toLowerCase();
  const sum = () => (row._sum ||= rowSummary(row, ctx.now));
  switch (field) {
    case '': {
      const re = wildcard(value, false);
      const t = row.text;
      return re.test(t.term) || re.test(t.def) || re.test(t.hint) || re.test(t.example);
    }
    case 'set':
    case 'deck': {
      const re = wildcard(value, false);
      return re.test(fold(row.set.title)) || re.test(fold(row.set.folder));
    }
    case 'tag': {
      const re = wildcard(value, true);
      return [...row.card.tags, ...row.set.tags].some((x) => re.test(fold(x)));
    }
    case 'is':
      switch (v) {
        case 'new':
          return sum().state === 'new';
        case 'learn':
          return sum().state === 'learn';
        case 'review':
          return sum().state === 'review';
        case 'due':
          return sum().isDue;
        case 'starred':
          return row.starred;
        case 'flagged':
          return row.flag > 0;
        case 'cloze':
          return row.card.type === 'cloze';
        case 'occlusion':
          return row.card.type === 'occlusion';
        case 'basic':
          return row.card.type === 'basic';
        case 'dupe':
          return row.dupe;
        case 'suspended':
          return row.suspended;
        default:
          return false;
      }
    case 'flag':
      return row.flag === Number(v);
    case 'has':
      if (v === 'image') return !!(row.card.image || row.card.termImage);
      if (v === 'audio') return !!row.card.audio;
      if (v === 'hint') return !!stripMarkdown(row.card.hint);
      if (v === 'example') return !!stripMarkdown(row.card.example);
      return false;
    case 'added':
      return row.added != null && +ctx.now - row.added < Number(v) * DAY;
    case 'rated':
      return sum().lastReview != null && +ctx.now - sum().lastReview < Number(v) * DAY;
    case 'prop': {
      const m = v.match(PROP);
      if (!m) return false;
      const [, p, op, n] = m;
      const b = Number(n);
      const srs = seenSrs(row);
      if (!srs.length) return false;
      const s = sum();
      if (p === 'lapses') return cmp(s.lapses, op, b);
      if (p === 'reps') return cmp(s.reps, op, b);
      if (p === 'ivl') return cmp(s.ivl, op, b);
      if (p === 's') return cmp(s.stability, op, b);
      if (p === 'd') return cmp(s.difficulty, op, b);
      if (p === 'due') {
        const today = new Date(ctx.now);
        today.setHours(0, 0, 0, 0);
        const d = new Date(s.due);
        d.setHours(0, 0, 0, 0);
        return cmp(Math.round((d - today) / DAY), op, b);
      }
      if (p === 'r') {
        if (!ctx.retrievability) return false;
        return cmp(Math.round(Math.min(...srs.map((x) => ctx.retrievability(x, ctx.now))) * 100), op, b);
      }
      return false;
    }
    default:
      if (FIELDS[field]) return wildcard(value, false).test(row.text[FIELDS[field]]);
      return matchToken(row, { ...tok, field: '', value: `${field}:${value}` }, ctx);
  }
}

/** Filtre les lignes selon la requête. */
export function search(rows, query, ctx = {}) {
  const c = { now: new Date(), ...ctx };
  const groups = parseQuery(query);
  for (const r of rows) delete r._sum;
  if (!groups.length) return rows.slice();
  return rows.filter((row) => groups.some((g) => g.every((tok) => matchToken(row, tok, c) !== tok.neg)));
}

/** Tri : 'added' | 'term' | 'def' | 'set' | 'due' | 'lapses' | 'reps' ; `desc` inverse. */
export function sortRows(rows, by = 'added', desc = false, now = new Date()) {
  const key =
    {
      added: (r) => r.added ?? 0,
      term: (r) => r.text.term,
      def: (r) => r.text.def,
      set: (r) => fold(r.set.title),
      due: (r) => (r._sum ||= rowSummary(r, now)).due ?? Infinity,
      lapses: (r) => (r._sum ||= rowSummary(r, now)).lapses,
      reps: (r) => (r._sum ||= rowSummary(r, now)).reps,
    }[by] || ((r) => r.added ?? 0);
  const out = rows.slice().sort((a, b) => {
    const x = key(a);
    const y = key(b);
    return typeof x === 'string' ? x.localeCompare(y) : x - y;
  });
  return desc ? out.reverse() : out;
}

/** Historique d'une carte (lignes de journal de ses items), du plus récent au plus ancien. */
export function cardHistory(logLines, cardId) {
  return logLines
    .filter((l) => l.item && cardIdOfItem(l.item) === cardId)
    .sort((a, b) => (b.t || '').localeCompare(a.t || ''));
}

/** Pose (n = 1..7) ou retire (n = 0) un drapeau. L'horodatage sert à la fusion de synchronisation. */
export function setFlag(progress, cardId, n, now = new Date()) {
  progress.flags ||= {};
  progress.flags[cardId] = { f: n, t: now.toISOString() };
}
