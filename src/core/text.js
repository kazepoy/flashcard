// Utilitaires texte : normalisation, comparaison de réponses, cloze, markdown léger.

const CLOZE_RE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

/** Retire le markdown et le HTML pour comparer / lire à voix haute. */
export function stripMarkdown(s = '') {
  return String(s)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/(\*\*|__|\*|_|`|~~|\uE000|\uE001)/g, '')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalise une réponse : casse, accents, ponctuation, espaces. */
export function normalizeAnswer(s = '', { ignoreCase = true, ignoreAccents = true, ignorePunct = true } = {}) {
  let t = stripMarkdown(s);
  if (ignoreAccents) t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (ignoreCase) t = t.toLowerCase();
  if (ignorePunct) t = t.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

/** Découpe les alternatives acceptées : `a; b`, `a | b`, `a / b` (barre entourée d'espaces). */
export function splitAlternatives(s = '') {
  return String(s)
    .split(/\s*(?:;|\||\s\/\s|\n)\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Vérifie une réponse saisie.
 * @returns {{correct:boolean, close:boolean}} `close` = faute de frappe probable (l'UI peut proposer de valider).
 */
export function checkAnswer(expected, given, { typoTolerance = true } = {}) {
  const g = normalizeAnswer(given);
  if (!g) return { correct: false, close: false };
  const variants = new Set();
  const full = normalizeAnswer(expected);
  variants.add(full);
  for (const alt of splitAlternatives(expected)) {
    variants.add(normalizeAnswer(alt));
    // « to eat (food) » accepte aussi « to eat »
    const noParen = alt.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ');
    variants.add(normalizeAnswer(noParen));
  }
  variants.delete('');
  if (variants.has(g)) return { correct: true, close: false };
  if (typoTolerance) {
    for (const v of variants) {
      if (v.length < 4) continue;
      const max = v.length >= 12 ? 2 : 1;
      if (levenshtein(v, g) <= max) return { correct: false, close: true };
    }
  }
  return { correct: false, close: false };
}

// ---------------------------------------------------------------- cloze

export const hasCloze = (s = '') => /\{\{c\d+::/.test(s);

/** Liste les trous d'un texte : [{n, answer, hint}] (un par numéro, réponses concaténées si doublon). */
export function parseCloze(text = '') {
  const map = new Map();
  for (const m of String(text).matchAll(CLOZE_RE)) {
    const n = Number(m[1]);
    const cur = map.get(n);
    if (cur) cur.answer += ' / ' + m[2];
    else map.set(n, { n, answer: m[2], hint: m[3] || '' });
  }
  return [...map.values()].sort((a, b) => a.n - b.n);
}

/**
 * Rendu d'un texte à trous pour le trou `n`.
 * mode 'blank' : le trou cible devient [...] (ou [indice]) ; les autres trous sont révélés.
 * mode 'reveal' : le trou cible est marqué (CLOZE_OPEN … CLOZE_CLOSE), mis en valeur par mdToHtml.
 */
/** Délimiteurs du mot révélé : caractères à usage privé, absents de tout texte saisi. */
export const CLOZE_OPEN = '\uE000';
export const CLOZE_CLOSE = '\uE001';

export function renderCloze(text = '', n, mode = 'blank') {
  return String(text).replace(CLOZE_RE, (_, num, ans, hint) => {
    if (Number(num) !== n) return ans;
    if (mode === 'reveal') return `${CLOZE_OPEN}${ans}${CLOZE_CLOSE}`;
    return hint ? `[${hint}]` : '[…]';
  });
}

/** Texte de cloze sans balises (toutes réponses visibles). */
export const clozeToPlain = (text = '') => String(text).replace(CLOZE_RE, (_, _n, ans) => ans);

// ---------------------------------------------------------------- markdown → HTML (minimal, sûr)

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Markdown inline minimal : gras, italique, code, liens http(s), retours à la ligne. Échappe tout HTML. */
export function mdToHtml(s = '', resolveMedia = (p) => p) {
  let t = escapeHtml(String(s));
  t = t.replace(
    /!\[([^\]]*)\]\(([^)\s]+)\)/g,
    (_, alt, src) => `<img alt="${alt}" src="${escapeHtml(resolveMedia(src.replace(/&amp;/g, '&')))}">`,
  );
  t = t.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  t = t.replace(/\uE000([^\uE001]*)\uE001/g, '<mark class="cloze">$1</mark>');
  t = t.replace(/\n/g, '<br>');
  return t;
}
