// Jeu d'exemple « Visite guidée » : `node scripts/gen-examples.mjs` → examples/<langue>/*.flashcard.zip + index.json.
// Importés à la première ouverture d'une bibliothèque vide (ui/first-run.js), ou à la main avec « Importer ».
// Identifiants fixes : réimporter un exemple met le jeu à jour au lieu de le dupliquer.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { newCard, newSet } from '../src/core/format.js';
import { exportBundle } from '../src/io/bundle.js';

const DATE = '2026-10-31T00:00:00.000Z';
const id = (set, n = 0) => '01JZ' + String(set * 1000 + n).padStart(22, '0');
const media = new Map();
const addSvg = (svg) => {
  const bytes = new TextEncoder().encode(svg);
  const path = `media/${createHash('sha256').update(bytes).digest('hex')}.svg`;
  media.set(path, bytes);
  return path;
};
const makeSet = (n, fields, cards) => ({
  ...newSet({ created: DATE, updated: DATE, ...fields }),
  id: id(n),
  cards: cards.map((c, i) => ({ ...newCard(c), id: id(n, i + 1) })),
});

// ------------------------------------------------------------------ drapeaux (SVG 300 × 200)

const W = 300;
const H = 200;
const svg = (body, w = W, h = H) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="none" stroke="#9aa6b5"/></svg>`;
const rect = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
/** Bandes verticales ou horizontales ; [couleur, poids] ou couleur (poids 1). */
const bands = (dir, ...list) => {
  const parts = list.map((b) => (Array.isArray(b) ? b : [b, 1]));
  const total = parts.reduce((s, [, w]) => s + w, 0);
  let at = 0;
  return parts
    .map(([c, w]) => {
      const size = ((dir === 'v' ? W : H) * w) / total;
      const r = dir === 'v' ? rect(at, 0, size + 0.5, H, c) : rect(0, at, W, size + 0.5, c);
      at += size;
      return r;
    })
    .join('');
};
const vflag = (...c) => svg(bands('v', ...c));

const disc = (bg, color, r, cx = W / 2) =>
  svg(rect(0, 0, W, H, bg) + `<circle cx="${cx}" cy="${H / 2}" r="${r}" fill="${color}"/>`);

// Quelques drapeaux : recto en image seule, indices pour la paire facile à confondre.
const FLAGS = {
  France: vflag('#0055A4', '#FFFFFF', '#EF4135'),
  Irlande: vflag('#169B62', '#FFFFFF', '#FF883E'),
  "Côte d'Ivoire": vflag('#F77F00', '#FFFFFF', '#009E60'),
  Japon: disc('#FFFFFF', '#BC002D', H * 0.3),
  Suisse: svg(
    rect(0, 0, 200, 200, '#DA291C') + rect(80, 40, 40, 120, '#FFFFFF') + rect(40, 80, 120, 40, '#FFFFFF'),
    200,
    200,
  ),
};
const flag = (key, definition, example, hint = '', tag = 'drapeaux') => ({
  term: '',
  termImage: addSvg(FLAGS[key]),
  definition,
  hint,
  example,
  tags: [tag],
});

// Cartes « en situation » ajoutées à la visite guidée : drapeaux, langue, culture, expressions.
const EXTRAS_FR = [
  flag('France', 'France', 'Capitale : Paris'),
  flag('Irlande', 'Irlande', 'Capitale : Dublin', "Vert côté mât ; la Côte d'Ivoire commence par l'orange"),
  flag(
    "Côte d'Ivoire",
    "Côte d'Ivoire",
    'Capitale : Yamoussoukro (politique), Abidjan (économique)',
    "Orange côté mât, l'inverse de l'Irlande",
  ),
  flag('Japon', 'Japon', 'Capitale : Tokyo'),
  flag('Suisse', 'Suisse', 'Capitale : Berne', "L'un des deux seuls drapeaux nationaux carrés"),
  {
    term: 'Vorrei…',
    definition: 'Je voudrais… (italien)',
    hint: 'conditionnel de volere',
    example: 'Vorrei un caffè, per favore.',
    tags: ['langue'],
  },
  { term: 'il conto', definition: "l'addition (italien)", example: 'Il conto, per favore.', tags: ['langue'] },
  { term: 'Quanto costa?', definition: 'Combien ça coûte ? (italien)', tags: ['langue'] },
  { term: 'Buon appetito!', definition: 'Bon appétit ! (italien)', tags: ['langue'] },
  {
    term: "Quel pays a remporté l'Eurovision 2025, à Bâle ?",
    definition: "L'**Autriche**, avec JJ et « Wasted Love »",
    tags: ['culture'],
  },
  {
    term: 'Quelle console Nintendo est sortie le 5 juin 2025 ?',
    definition: 'La **Nintendo Switch 2**',
    tags: ['culture'],
  },
  { term: "Qui a remporté le Ballon d'or 2025 ?", definition: '**Ousmane Dembélé** (PSG)', tags: ['culture'] },
  {
    term: "Où se sont déroulés les Jeux olympiques d'hiver 2026 ?",
    definition: "À **Milan** et **Cortina d'Ampezzo** (Italie)",
    tags: ['culture'],
  },
  { type: 'cloze', term: 'Il pleut des {{c1::cordes}}.', definition: 'Il pleut très fort.', tags: ['expressions'] },
  {
    type: 'cloze',
    term: 'Coûter les {{c1::yeux}} de la {{c2::tête}}.',
    definition: 'Coûter très cher.',
    tags: ['expressions'],
  },
  {
    type: 'cloze',
    term: 'Avoir la {{c1::pêche::un fruit}}.',
    definition: 'Être en pleine forme.',
    tags: ['expressions'],
  },
  {
    type: 'cloze',
    term: 'Appeler un {{c1::chat}} un {{c1::chat}}.',
    definition: 'Dire les choses franchement.',
    tags: ['expressions'],
  },
];
const EXTRAS_EN = [
  flag('France', 'France', 'Capital: Paris', '', 'flags'),
  flag('Irlande', 'Ireland', 'Capital: Dublin', "Green at the hoist; Côte d'Ivoire starts with orange", 'flags'),
  flag(
    "Côte d'Ivoire",
    "Côte d'Ivoire",
    'Capital: Yamoussoukro (political), Abidjan (economic)',
    'Orange at the hoist, the reverse of Ireland',
    'flags',
  ),
  flag('Japon', 'Japan', 'Capital: Tokyo', '', 'flags'),
  flag('Suisse', 'Switzerland', 'Capital: Bern', 'One of only two square national flags', 'flags'),
  {
    term: 'Quisiera…',
    definition: 'I would like… (Spanish)',
    hint: 'polite form of querer',
    example: 'Quisiera un café con leche.',
    tags: ['language'],
  },
  { term: 'la cuenta', definition: 'the bill (Spanish)', example: 'La cuenta, por favor.', tags: ['language'] },
  { term: '¿Cuánto cuesta?', definition: 'How much is it? (Spanish)', tags: ['language'] },
  { term: '¡Buen provecho!', definition: 'Enjoy your meal! (Spanish)', tags: ['language'] },
  {
    term: 'Which country won Eurovision 2025, in Basel?',
    definition: '**Austria**, with JJ and “Wasted Love”',
    tags: ['culture'],
  },
  {
    term: 'Which Nintendo console was released on 5 June 2025?',
    definition: 'The **Nintendo Switch 2**',
    tags: ['culture'],
  },
  { term: "Who won the 2025 Ballon d'Or?", definition: '**Ousmane Dembélé** (PSG)', tags: ['culture'] },
  {
    term: 'Where were the 2026 Winter Olympics held?',
    definition: "In **Milan** and **Cortina d'Ampezzo** (Italy)",
    tags: ['culture'],
  },
  {
    type: 'cloze',
    term: "It's raining {{c1::cats}} and {{c2::dogs}}.",
    definition: "It's raining very heavily.",
    tags: ['idioms'],
  },
  { type: 'cloze', term: "It's a piece of {{c1::cake}}.", definition: "It's very easy.", tags: ['idioms'] },
  {
    type: 'cloze',
    term: 'Break a {{c1::leg}}!',
    definition: 'Good luck! (said before a performance)',
    tags: ['idioms'],
  },
  {
    type: 'cloze',
    term: 'Easy {{c1::come}}, easy {{c1::go}}.',
    definition: 'What is gained easily is lost easily.',
    tags: ['idioms'],
  },
];

// ------------------------------------------------------------------ visite guidée (prise en main)

const SUN = svg(
  `<rect width="${W}" height="${H}" fill="#e8f1ff"/><g stroke="#f59e0b" stroke-width="8" stroke-linecap="round">${Array.from(
    { length: 12 },
    (_, i) => {
      const a = (i * Math.PI) / 6;
      return `<line x1="${150 + 52 * Math.cos(a)}" y1="${100 + 52 * Math.sin(a)}" x2="${150 + 78 * Math.cos(a)}" y2="${100 + 78 * Math.sin(a)}"/>`;
    },
  ).join('')}</g><circle cx="150" cy="100" r="40" fill="#fbbf24"/>`,
);
const EARTH = svg(
  `<rect width="${W}" height="${H}" fill="#0b1d3a"/><circle cx="150" cy="100" r="72" fill="#2563eb"/><path d="M118 52c22-6 40 6 36 24s-28 14-34 34-22 8-26-8 2-44 24-50zM176 96c16-4 30 10 26 28s-18 30-34 22-8-46 8-50z" fill="#22c55e"/><circle cx="150" cy="100" r="72" fill="none" stroke="#93c5fd" stroke-width="3"/>`,
);
const PATTERN = addSvg(
  `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" fill="#f0fdf4"/><circle cx="10" cy="10" r="3.5" fill="#86efac"/><circle cx="30" cy="30" r="3.5" fill="#86efac"/><path d="M0 40L40 0" stroke="#bbf7d0" stroke-width="2"/></svg>`,
);

/** Planètes telluriques : noms masqués (« masquer tout, deviner un », réponses écrites). */
function planetsCard(names, term, definition) {
  const P = [
    [170, 10, '#a8a29e'],
    [280, 18, '#fcd34d'],
    [390, 20, '#3b82f6'],
    [500, 14, '#ef4444'],
  ];
  const body = P.map(
    ([x, r, c], i) =>
      `<circle cx="${x}" cy="130" r="${r}" fill="${c}"/><text x="${x}" y="200" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#f8fafc">${names[i]}</text>`,
  ).join('');
  const image = addSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 260" width="600" height="260"><rect width="600" height="260" fill="#0b1d3a"/><circle cx="0" cy="130" r="80" fill="#fbbf24"/>${body}</svg>`,
  );
  const masks = P.map(([x], i) => ({
    n: i + 1,
    shape: 'rect',
    x: (x - 46) / 600,
    y: 178 / 260,
    w: 92 / 600,
    h: 32 / 260,
    label: names[i],
  }));
  return { type: 'occlusion', image, term, definition, occlusion: 'all', masks, tags: ['image-masquee'] };
}

/** Cercle chromatique : primaires = un groupe chacune (nom caché, réponse écrite) ;
 *  secondaires = un seul groupe de trois ellipses, sans réponse écrite (« masquer un, deviner un »). */
function colorWheelCard(names, term, definition) {
  const C = [
    ['#dc2626', '#fff'],
    ['#f97316', '#111'],
    ['#facc15', '#111'],
    ['#16a34a', '#fff'],
    ['#2563eb', '#fff'],
    ['#7c3aed', '#fff'],
  ];
  const pos = C.map((_, i) => {
    const a = (i * Math.PI) / 3;
    return [300 + 115 * Math.sin(a), 175 - 115 * Math.cos(a)];
  });
  const body = C.map(
    ([bg, fg], i) =>
      `<circle cx="${pos[i][0]}" cy="${pos[i][1]}" r="40" fill="${bg}"/><text x="${pos[i][0]}" y="${pos[i][1] + 6}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="${fg}">${names[i]}</text>`,
  ).join('');
  const image = addSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 350" width="600" height="350"><rect width="600" height="350" fill="#ffffff"/>${body}</svg>`,
  );
  const masks = [];
  [0, 2, 4].forEach((i, g) =>
    masks.push({
      n: g + 1,
      shape: 'rect',
      x: (pos[i][0] - 34) / 600,
      y: (pos[i][1] - 13) / 350,
      w: 68 / 600,
      h: 26 / 350,
      label: names[i],
    }),
  );
  [1, 3, 5].forEach((i) =>
    masks.push({
      n: 4,
      shape: 'ellipse',
      x: (pos[i][0] - 43) / 600,
      y: (pos[i][1] - 43) / 350,
      w: 86 / 600,
      h: 86 / 350,
    }),
  );
  return { type: 'occlusion', image, term, definition, occlusion: 'one', masks, tags: ['image-masquee'] };
}

const SUN_IMG = addSvg(SUN);
const EARTH_IMG = addSvg(EARTH);

const TOUR_DATE = '2026-10-31T00:00:05.000Z';
const tour = makeSet(
  5,
  {
    updated: TOUR_DATE,
    title: 'Visite guidée : les types de cartes',
    description:
      "Quelques cartes qui montrent ce qu'une carte peut faire. Ouvrez « Modifier » pour voir comment chacune est faite. Suivent quelques cartes en situation : drapeaux, langue, culture, expressions. Filtrez par étiquette dans « Cartes ».",
    folder: 'Exemples',
    language: { term: 'fr', definition: 'fr' },
    tags: ['prise en main', 'exemple'],
    color: '#8a5cd6',
  },
  [
    {
      term: 'Carte simple',
      definition: "Un **terme** au recto, sa **définition** au verso.\n\nRetournez la fiche avec Espace, ou d'un clic.",
      tags: ['simple'],
    },
    {
      term: "Quelle est la capitale de l'Australie ?",
      definition: 'Canberra',
      hint: "Ce n'est pas Sydney.",
      example:
        "L'**indice** s'affiche avant la réponse, l'**exemple** avec elle : deux champs facultatifs, sous « Indice, exemple, images, audio ».",
      tags: ['simple'],
    },
    {
      term: 'Mise en forme',
      definition:
        'Le texte accepte le Markdown :\n\n- **gras** et *italique*\n- `code`\n- listes et [liens](https://fr.wikipedia.org/wiki/Markdown)',
      tags: ['simple'],
    },
    {
      term: 'Quel est cet astre ?',
      termImage: SUN_IMG,
      definition: 'Le Soleil',
      example:
        "Image ajoutée au recto avec « Image du terme ». Le recto peut même n'être qu'une image (voir le jeu des drapeaux).",
      tags: ['simple'],
    },
    {
      term: "Notre planète vue de l'espace",
      definition: 'La Terre',
      image: EARTH_IMG,
      example: 'Image ajoutée au verso avec « Image de la définition ».',
      tags: ['simple'],
    },
    {
      term: 'Apparence personnalisée',
      definition:
        "Fond jaune, police manuscrite, grande taille, texte centré : tout se règle dans « Apparence » de la carte. Les autres cartes suivent l'apparence du jeu.",
      style: { bg: '#fde68a', font: 'hand', size: 'lg', align: 'center' },
      tags: ['apparence'],
    },
    {
      term: 'Recto sombre, verso clair',
      definition:
        "« Couleur de fond du verso » colore la réponse autrement. La couleur du texte s'ajuste toute seule pour rester lisible.",
      style: { bg: '#1e3a5f', backBg: '#e0f2fe', font: 'mono', paper: 'grid' },
      tags: ['apparence'],
    },
    {
      term: 'Image de fond',
      definition: 'Un motif ou une photo peut servir de fond (« Image de fond »), ici sur papier uni.',
      style: { bgImage: PATTERN, paper: 'plain', align: 'center', font: 'sans' },
      tags: ['apparence'],
    },
    {
      type: 'cloze',
      term: 'Un texte à {{c1::trous}} cache un mot : retrouvez-le.',
      definition: "Dans l'éditeur, sélectionnez un mot puis « Créer un trou ».",
      tags: ['trous'],
    },
    {
      type: 'cloze',
      term: 'La Seine se jette dans la {{c1::Manche::une mer}}.',
      definition: 'Le texte après « :: » dans un trou est un **indice**, affiché à la place de […].',
      tags: ['trous'],
    },
    {
      type: 'cloze',
      term: "{{c1::Paris}} est la capitale de la France, {{c2::Rome}} celle de l'Italie.",
      definition: "Deux numéros (c1, c2) donnent **deux cartes d'étude** : chacune ne cache qu'un trou.",
      tags: ['trous'],
    },
    {
      type: 'cloze',
      term: "C'est {{c1::bonnet}} blanc et blanc {{c1::bonnet}}.",
      definition: 'Deux trous de même numéro (« Même trou que le précédent ») sont cachés et révélés **ensemble**.',
      tags: ['trous'],
    },
    planetsCard(
      ['Mercure', 'Vénus', 'Terre', 'Mars'],
      'Image masquée : les planètes telluriques',
      'Mode « Masquer tout, deviner un » : tous les noms sont cachés, un seul est demandé. Chaque masque a une réponse écrite, donc la carte sert aussi dans Apprendre, Écrire et Test.',
    ),
    colorWheelCard(
      ['rouge', 'orange', 'jaune', 'vert', 'bleu', 'violet'],
      'Image masquée : le cercle chromatique',
      "Mode « Masquer un, deviner un ». Les trois couleurs secondaires forment un seul groupe d'ellipses, révélées ensemble et sans réponse écrite (pour les fiches et la révision seulement).",
    ),
    ...EXTRAS_FR,
  ],
);

const tourEn = makeSet(
  15,
  {
    updated: TOUR_DATE,
    title: 'Guided tour: card types',
    description:
      'A few cards showing what a card can do. Open “Edit” to see how each one is made. Then come a few real-life cards: flags, language, culture, idioms. Filter by tag in “Cards”.',
    folder: 'Examples',
    language: { term: 'en', definition: 'en' },
    tags: ['getting started', 'example'],
    color: '#8a5cd6',
  },
  [
    {
      term: 'Basic card',
      definition:
        'A **term** on the front, its **definition** on the back.\n\nFlip the card with Space, or with a click.',
      tags: ['basic'],
    },
    {
      term: 'What is the capital of Australia?',
      definition: 'Canberra',
      hint: "It isn't Sydney.",
      example:
        'The **hint** shows before the answer, the **example** with it: two optional fields, under “Hint, example, images, audio”.',
      tags: ['basic'],
    },
    {
      term: 'Formatting',
      definition:
        'Text supports Markdown:\n\n- **bold** and *italic*\n- `code`\n- lists and [links](https://en.wikipedia.org/wiki/Markdown)',
      tags: ['basic'],
    },
    {
      term: 'Which star is this?',
      termImage: SUN_IMG,
      definition: 'The Sun',
      example: 'Image added to the front with “Term image”. The front can even be just an image (see the flags set).',
      tags: ['basic'],
    },
    {
      term: 'Our planet seen from space',
      definition: 'The Earth',
      image: EARTH_IMG,
      example: 'Image added to the back with “Definition image”.',
      tags: ['basic'],
    },
    {
      term: 'Custom appearance',
      definition:
        "Yellow background, handwriting font, large size, centred text: all set in the card's “Appearance”. Other cards follow the set's appearance.",
      style: { bg: '#fde68a', font: 'hand', size: 'lg', align: 'center' },
      tags: ['appearance'],
    },
    {
      term: 'Dark front, light back',
      definition:
        '“Back background colour” gives the answer a different colour. The text colour adjusts itself to stay readable.',
      style: { bg: '#1e3a5f', backBg: '#e0f2fe', font: 'mono', paper: 'grid' },
      tags: ['appearance'],
    },
    {
      term: 'Background image',
      definition: "A pattern or a photo can be the card's background (“Background image”), here on plain paper.",
      style: { bgImage: PATTERN, paper: 'plain', align: 'center', font: 'sans' },
      tags: ['appearance'],
    },
    {
      type: 'cloze',
      term: 'A fill-in-the-{{c1::blank}} card hides a word: find it.',
      definition: 'In the editor, select a word, then “Make a blank”.',
      tags: ['blanks'],
    },
    {
      type: 'cloze',
      term: 'The Thames flows into the {{c1::North Sea::a sea}}.',
      definition: 'The text after “::” in a blank is a **hint**, shown instead of […].',
      tags: ['blanks'],
    },
    {
      type: 'cloze',
      term: '{{c1::Paris}} is the capital of France, {{c2::Rome}} that of Italy.',
      definition: 'Two numbers (c1, c2) give **two study cards**: each hides a single blank.',
      tags: ['blanks'],
    },
    {
      type: 'cloze',
      term: 'Easy {{c1::come}}, easy {{c1::go}}.',
      definition:
        'Two blanks with the same number (“Same blank as the previous one”) are hidden and revealed **together**.',
      tags: ['blanks'],
    },
    {
      ...planetsCard(
        ['Mercury', 'Venus', 'Earth', 'Mars'],
        'Image occlusion: the rocky planets',
        '“Hide all, guess one” mode: every name is hidden, only one is asked. Each mask has a written answer, so the card also works in Learn, Write and Test.',
      ),
      tags: ['image-occlusion'],
    },
    {
      ...colorWheelCard(
        ['red', 'orange', 'yellow', 'green', 'blue', 'purple'],
        'Image occlusion: the colour wheel',
        '“Hide one, guess one” mode. The three secondary colours form a single group of ellipses, revealed together and with no written answer (flashcards and review only).',
      ),
      tags: ['image-occlusion'],
    },
    ...EXTRAS_EN,
  ],
);

// ------------------------------------------------------------------ écriture

async function write(lang, entries) {
  const dir = new URL(`../examples/${lang}/`, import.meta.url);
  await mkdir(dir, { recursive: true });
  const files = [];
  for (const [name, set] of entries) {
    const bytes = await exportBundle({ sets: [set], getMedia: async (p) => media.get(p) ?? null });
    files.push(`${name}.flashcard.zip`);
    await writeFile(new URL(files.at(-1), dir), bytes);
    console.log(
      `examples/${lang}/${files.at(-1)} : ${set.cards.length} cartes, ${(bytes.length / 1024).toFixed(0)} Ko`,
    );
  }
  await writeFile(new URL('index.json', dir), JSON.stringify(files, null, 2) + '\n');
}

await write('fr', [['visite-guidee', tour]]);
await write('en', [['guided-tour', tourEn]]);
