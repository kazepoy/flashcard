// Image masquée (« image occlusion ») : masques sur une image, un élément d'étude par groupe.
// Coordonnées normalisées (0..1) par rapport à l'image, comme Anki depuis la version 23.10.

export const SHAPES = ['rect', 'ellipse', 'polygon'];
/** 'all' : tous les masques couverts, on devine le groupe actif (Anki « Masquer tout, deviner un »).
 *  'one' : seul le groupe actif est couvert (Anki « Masquer un, deviner un »). */
export const MODES = ['all', 'one'];

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.parseFloat(v));
const round = (v) => Math.round(v * 10000) / 10000;

/** Ne garde que des masques valides : {n ≥ 1, shape, x, y, w, h, angle?, points?, label?}. */
export function normalizeMasks(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const shape = SHAPES.includes(m.shape) ? m.shape : 'rect';
    const n = Math.max(1, Math.floor(num(m.n)) || 1);
    const mask = { n, shape };
    if (shape === 'polygon') {
      const pts = (Array.isArray(m.points) ? m.points : [])
        .map((p) => [clamp01(num(p?.[0])), clamp01(num(p?.[1]))])
        .filter((p) => p.every(Number.isFinite));
      if (pts.length < 3) continue;
      mask.points = pts.map((p) => p.map(round));
      Object.assign(mask, bbox(mask.points));
    } else {
      let [x, y, w, h] = [m.x, m.y, m.w, m.h].map(num);
      if (![x, y, w, h].every(Number.isFinite)) continue;
      x = clamp01(x);
      y = clamp01(y);
      w = Math.min(1 - x, Math.max(0, w));
      h = Math.min(1 - y, Math.max(0, h));
      if (w <= 0.002 || h <= 0.002) continue;
      Object.assign(mask, { x: round(x), y: round(y), w: round(w), h: round(h) });
      const a = num(m.angle);
      if (Number.isFinite(a) && a % 360 !== 0) mask.angle = round(a % 360);
    }
    // étiquette gardée telle quelle (saisie en cours) ; nettoyée à l'usage
    if (typeof m.label === 'string' && m.label.trim()) mask.label = m.label;
    out.push(mask);
  }
  return out;
}

function bbox(points) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x: round(x), y: round(y), w: round(Math.max(...xs) - x), h: round(Math.max(...ys) - y) };
}

/** Numéros de groupe présents, triés. */
export const groupsOf = (masks) => [...new Set(masks.map((m) => m.n))].sort((a, b) => a - b);

/** Réponse textuelle d'un groupe : les étiquettes de ses masques (vide si aucune). */
export function groupAnswer(masks, n) {
  return [...new Set(masks.filter((m) => m.n === n && m.label?.trim()).map((m) => m.label.trim()))].join(', ');
}

/**
 * État d'affichage d'un masque pour le groupe actif `n`.
 * @returns {'active'|'cover'|'reveal'|'none'}  active : à deviner ; cover : masqué ; reveal : réponse
 */
export function maskState(mask, n, mode, side) {
  if (mask.n === n) return side === 'prompt' ? 'active' : 'reveal';
  return mode === 'all' ? 'cover' : 'none';
}

/** Renumérote les groupes 1..k sans trou (après suppression). */
export function compactGroups(masks) {
  const map = new Map(groupsOf(masks).map((n, i) => [n, i + 1]));
  return masks.map((m) => ({ ...m, n: map.get(m.n) }));
}

// ------------------------------------------------------------------ format Anki

/** Lit une valeur d'occlusion Anki (`rect:left=.2:top=.3:width=.1:height=.1:oi=1`). */
export function parseAnkiShape(text) {
  const i = text.indexOf(':');
  const shape = i < 0 ? text : text.slice(0, i);
  const props = {};
  // propriétés séparées par « : », avec \: et \\ échappés
  let key = null;
  let buf = '';
  let mode = 'key';
  const flush = () => {
    if (key != null) props[key] = buf;
    key = null;
    buf = '';
    mode = 'key';
  };
  for (let j = i < 0 ? text.length : i + 1; j < text.length; j++) {
    const ch = text[j];
    if (ch === '\\' && j + 1 < text.length) {
      buf += text[++j];
    } else if (mode === 'key' && ch === '=') {
      key = buf;
      buf = '';
      mode = 'value';
    } else if (ch === ':' && mode === 'value') {
      flush();
    } else buf += ch;
  }
  flush();
  return { shape, props };
}

/**
 * Extrait les masques du champ « Occlusion » d'une note Anki.
 * @param {string} field  ex. `{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.1:oi=1}}<br>…`
 * @param {{width:number, height:number}|null} size  dimensions de l'image, pour les anciennes notes en pixels
 * @returns {{masks:Array, mode:'all'|'one', skipped:number}}
 */
export function masksFromAnki(field, size = null) {
  const masks = [];
  let oi = 0;
  let total = 0;
  let skipped = 0;
  const re = /\{\{c(\d+(?:,\d+)*)::image-occlusion:([\s\S]*?)\}\}/g;
  for (const m of String(field || '').matchAll(re)) {
    const ordinals = m[1]
      .split(',')
      .map(Number)
      .filter((n) => n > 0);
    const { shape, props } = parseAnkiShape(m[2]);
    total++;
    if (props.oi === '1') oi++;
    if (!SHAPES.includes(shape) || !ordinals.length) {
      skipped++; // « text » (étiquette dessinée) et formes inconnues
      continue;
    }
    const raw = {
      shape,
      x: num(props.left),
      y: num(props.top),
      w: num(props.width),
      h: num(props.height),
      angle: num(props.angle),
    };
    if (shape === 'ellipse' && !Number.isFinite(raw.w) && Number.isFinite(num(props.rx))) {
      raw.w = num(props.rx) * 2;
      raw.h = num(props.ry) * 2;
    }
    if (shape === 'polygon')
      raw.points = String(props.points || '')
        .trim()
        .split(/\s+/)
        .map((p) => p.split(',').map(Number));
    // anciennes notes : coordonnées en pixels
    const abs = [raw.x, raw.y, raw.w, raw.h, ...(raw.points || []).flat()].some(
      (v) => Number.isFinite(v) && v > 1.0001,
    );
    if (abs) {
      if (!size?.width || !size?.height) {
        skipped++;
        continue;
      }
      raw.x /= size.width;
      raw.w /= size.width;
      raw.y /= size.height;
      raw.h /= size.height;
      if (raw.points) raw.points = raw.points.map(([x, y]) => [x / size.width, y / size.height]);
    }
    for (const n of ordinals) {
      const [mask] = normalizeMasks([{ ...raw, n }]);
      if (mask) masks.push(mask);
      else skipped++;
    }
  }
  return { masks, mode: total && oi === 0 ? 'one' : 'all', skipped };
}

const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/:/g, '\\:');
const fmt = (v) => String(round(v)).replace(/^0(?=\.)/, '');

/** Champ « Occlusion » Anki pour des masques Flashcard. */
export function masksToAnki(masks, mode = 'all') {
  return masks
    .map((m) => {
      let s = `image-occlusion:${m.shape}`;
      if (m.shape === 'polygon') s += `:points=${esc(m.points.map((p) => p.map(fmt).join(',')).join(' '))}`;
      else {
        s += `:left=${fmt(m.x)}:top=${fmt(m.y)}:width=${fmt(m.w)}:height=${fmt(m.h)}`;
        if (m.angle) s += `:angle=${fmt(m.angle)}`;
      }
      if (mode === 'all') s += ':oi=1';
      return `{{c${m.n}::${s}}}`;
    })
    .join('<br>');
}

// ------------------------------------------------------------------ dimensions d'image

/** Largeur et hauteur d'une image PNG, JPEG, GIF ou WebP depuis ses octets (null si inconnue). */
export function imageSize(b) {
  if (!b || b.length < 24) return null;
  const u16be = (i) => (b[i] << 8) | b[i + 1];
  const u16le = (i) => b[i] | (b[i + 1] << 8);
  const u32be = (i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { width: u32be(16), height: u32be(20) };
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { width: u16le(6), height: u16le(8) };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) {
    const kind = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (kind === 'VP8X')
      return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    if (kind === 'VP8 ') return { width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
    if (kind === 'VP8L') {
      const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 };
    }
    return null;
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      const len = u16be(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return { width: u16be(i + 7), height: u16be(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}
