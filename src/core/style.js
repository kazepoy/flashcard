// Personnalisation visuelle des cartes (couleurs, police, papier…). Toutes les valeurs sont validées :
// aucune chaîne libre n'atteint le CSS (pas d'injection).

// « default » : police par défaut du lecteur (sur une carte, pour ne pas reprendre celle du jeu) ;
// les quatre dernières sont aussi les polices de lecture des réglages (ui/themes.js : READING_FONTS)
export const FONTS = ['default', 'serif', 'sans', 'mono', 'hand', 'opendyslexic', 'atkinson', 'lexend', 'andika'];
/** `auto` (défaut) : taille calculée pour remplir la fiche sans la dépasser (ui/components.jsx : fitText). */
export const SIZES = ['sm', 'md', 'lg', 'xl', 'auto'];
export const ALIGNS = ['center', 'left'];
/** Alignement vertical du contenu de la fiche (défaut : centré entre l'en-tête et le pied). */
export const VALIGNS = ['middle', 'top'];
export const PAPERS = ['ruled', 'plain', 'grid', 'dots'];
/** Rappel de la question au verso, au-dessus de la réponse (défaut : affiché). */
export const RECALLS = ['show', 'hide'];

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

/** Couleurs de texte proposées : encres foncées, et blanc pour les fonds sombres. */
export const TEXT_COLORS = [
  { id: 'black', hex: '#111111' },
  { id: 'blue', hex: '#1F4FD0' },
  { id: 'red', hex: '#C62828' },
  { id: 'green', hex: '#2E7D32' },
  { id: 'purple', hex: '#6A1B9A' },
  { id: 'brown', hex: '#6D4C41' },
  { id: 'white', hex: '#FFFFFF' },
];

/** Couleurs proposées pour les mots révélés d'un texte à trous. */
export const CLOZE_COLORS = [
  { id: 'blue', hex: '#1F4FD0' },
  { id: 'red', hex: '#C62828' },
  { id: 'green', hex: '#2E7D32' },
  { id: 'orange', hex: '#C2410C' },
  { id: 'purple', hex: '#6A1B9A' },
  { id: 'pink', hex: '#AD1457' },
];

/**
 * Ne garde que les clés valides d'un style : {bg, backBg, fg, cloze, font, size, align, valign, paper, recall,
 * bgImage}.
 */
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
  if (VALIGNS.includes(raw.valign)) s.valign = raw.valign;
  if (PAPERS.includes(raw.paper)) s.paper = raw.paper;
  if (RECALLS.includes(raw.recall)) s.recall = raw.recall;
  if (isMedia(raw.bgImage)) s.bgImage = raw.bgImage;
  return s;
}

/** Style effectif : chaque niveau complète le précédent (réglages, puis jeu, puis carte). */
export const mergeStyle = (...layers) => Object.assign({}, ...layers.map(sanitizeStyle));

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

/** Contraste minimal du texte d'une fiche (grands caractères : seuil WCAG du texte large). */
export const MIN_TEXT_CONTRAST = 3;

/**
 * Couleur de texte lisible sur `bg` : la couleur choisie si elle est assez contrastée, sinon encre ou blanc
 * (la plus contrastée).
 */
export function autoFg(bg, preferred) {
  if (!isHex(bg)) return preferred && isHex(preferred) ? preferred : null;
  if (preferred && isHex(preferred) && contrast(bg, preferred) >= MIN_TEXT_CONTRAST) return preferred;
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
    'font-' + (style.font || 'default'), // défaut : police des réglages ou du thème, sinon manuscrite (styles.css)
    'size-' + (style.size || 'auto'), // défaut : ajustée à la fiche
    'align-' + (style.align || 'center'), // défaut : centré
    'valign-' + (style.valign || 'middle'), // défaut : centré
    'paper-' + (style.paper || 'ruled'),
  ];
  if (bg && luminance(bg) < 0.25) cls.push('is-dark');
  if (style.bgImage) cls.push('has-bg-image');
  return { vars, className: cls.join(' '), bgImage: style.bgImage || null, fit: !style.size || style.size === 'auto' };
}
