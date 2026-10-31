// Personnalisation visuelle des cartes (couleurs, police, papier…). Toutes les valeurs sont validées :
// aucune chaîne libre n'atteint le CSS (pas d'injection).

export const FONTS = ['serif', 'sans', 'mono', 'hand'];
export const SIZES = ['sm', 'md', 'lg', 'xl'];
export const ALIGNS = ['left', 'center'];
export const PAPERS = ['ruled', 'plain', 'grid', 'dots'];

/** Couleurs de papier proposées (l'utilisateur peut aussi choisir n'importe quelle couleur #RRGGBB). */
export const PAPER_COLORS = [
  { id: 'white', hex: '#FFFFFF' },
  { id: 'yellow', hex: '#FFF3A3' },
  { id: 'pink', hex: '#FFD9E2' },
  { id: 'mint', hex: '#CFF1DC' },
  { id: 'blue', hex: '#D3E5FF' },
  { id: 'lavender', hex: '#E3DAFF' },
  { id: 'peach', hex: '#FFE0C2' },
  { id: 'ink', hex: '#1B2A41' },
];

export const isHex = (s) => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);
const isMedia = (s) => typeof s === 'string' && /^media\/[0-9a-f]{64}\.[0-9a-z]{1,6}$/.test(s);

/** Couleurs proposées pour les mots révélés d'un texte à trous. */
export const CLOZE_COLORS = [
  { id: 'blue', hex: '#1F4FD0' },
  { id: 'red', hex: '#C62828' },
  { id: 'green', hex: '#2E7D32' },
  { id: 'orange', hex: '#C2410C' },
  { id: 'purple', hex: '#6A1B9A' },
  { id: 'pink', hex: '#AD1457' },
];

/** Ne garde que les clés valides d'un style : {bg, backBg, fg, cloze, font, size, align, paper, bgImage}. */
export function sanitizeStyle(raw) {
  const s = {};
  if (!raw || typeof raw !== 'object') return s;
  if (isHex(raw.bg)) s.bg = raw.bg.toUpperCase();
  if (isHex(raw.backBg)) s.backBg = raw.backBg.toUpperCase();
  if (isHex(raw.fg)) s.fg = raw.fg.toUpperCase();
  if (isHex(raw.cloze)) s.cloze = raw.cloze.toUpperCase();
  if (FONTS.includes(raw.font)) s.font = raw.font;
  if (SIZES.includes(raw.size)) s.size = raw.size;
  if (ALIGNS.includes(raw.align)) s.align = raw.align;
  if (PAPERS.includes(raw.paper)) s.paper = raw.paper;
  if (isMedia(raw.bgImage)) s.bgImage = raw.bgImage;
  return s;
}

/** Style effectif : le style de la carte complète celui du jeu. */
export const mergeStyle = (setStyle, cardStyle) => ({ ...sanitizeStyle(setStyle), ...sanitizeStyle(cardStyle) });

export function luminance(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const INK = '#1B2A41';
const PAPER = '#FFFFFF';

/** Couleur de texte lisible sur `bg` (la couleur choisie si elle est assez contrastée, sinon encre ou blanc). */
export function autoFg(bg, preferred) {
  if (!isHex(bg)) return preferred && isHex(preferred) ? preferred : null;
  if (preferred && isHex(preferred) && contrast(bg, preferred) >= 4.5) return preferred;
  return contrast(bg, INK) >= contrast(bg, PAPER) ? INK : PAPER;
}

/** Variables CSS + classes pour une face (`side` = 'prompt' | 'answer'). */
export function cardAppearance(style = {}, side = 'prompt') {
  const bg = side === 'answer' && style.backBg ? style.backBg : style.bg;
  const fg = autoFg(bg, style.fg);
  const vars = {};
  if (bg) vars['--card-bg'] = bg;
  if (fg) vars['--card-fg'] = fg;
  // mots révélés : couleur choisie (ou accent par défaut), remplacée si illisible sur le fond de la carte
  if (bg) {
    const wanted = style.cloze || (luminance(bg) < 0.25 ? '#7EA4FF' : '#1F4FD0');
    vars['--card-cloze'] = contrast(bg, wanted) >= 4.5 ? wanted : fg;
  } else if (style.cloze) vars['--card-cloze'] = style.cloze;
  const cls = [
    'font-' + (style.font || 'default'), // défaut : manuscrite (ou celle du thème, voir styles.css)
    'size-' + (style.size || 'md'),
    'align-' + (style.align || 'left'),
    'paper-' + (style.paper || 'ruled'),
  ];
  if (bg && luminance(bg) < 0.25) cls.push('is-dark');
  if (style.bgImage) cls.push('has-bg-image');
  return { vars, className: cls.join(' '), bgImage: style.bgImage || null };
}
