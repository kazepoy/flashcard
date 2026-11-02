// Jeux d'exemple : `node scripts/gen-examples.mjs` → examples/<langue>/*.flashcard.zip, index.json, catalog.json.
// Visite guidée importée à la première ouverture d'une bibliothèque vide (ui/first-run.js, index.json) ;
// catalogue (scripts/catalog.mjs, catalog.json) proposé dans Importer › Jeux d'exemple.
// Identifiants fixes : réimporter un exemple met le jeu à jour au lieu de le dupliquer.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { newCard, newSet } from '../src/core/format.js';
import { exportBundle } from '../src/io/bundle.js';
import { buildCatalog } from './catalog.mjs';

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

// ------------------------------------------------------------------ illustrations (SVG 300 × 200)

const W = 300;
const H = 200;
const svg = (body, w = W, h = H) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="none" stroke="#9aa6b5"/></svg>`;

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
function planetsCard(names, term, definition, tag) {
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
  return { type: 'occlusion', image, term, definition, occlusion: 'all', masks, tags: [tag] };
}

/** Cercle chromatique : primaires = un groupe chacune (nom caché, réponse écrite) ;
 *  secondaires = un seul groupe de trois ellipses, sans réponse écrite (« masquer un, deviner un »). */
function colorWheelCard(names, term, definition, tag) {
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
  return { type: 'occlusion', image, term, definition, occlusion: 'one', masks, tags: [tag] };
}

const SUN_IMG = addSvg(SUN);
const EARTH_IMG = addSvg(EARTH);

const TOUR_DATE = '2026-11-02T00:00:05.000Z';

/**
 * Visite guidée en questions-réponses : chaque carte répond à une question qu'on se pose en découvrant
 * Flashcard, et montre la fonction sur elle-même (la carte sur l'indice a un indice, celle sur les trous est
 * un texte à trous…). Étiquettes : bases, étude, contenu, apparence, trous, image-masquee, organisation, données.
 */
function tourCards(L) {
  const F = L === 'fr';
  const t = (fr, en) => (F ? fr : en);
  const c = (term, definition, tag, more = {}) => ({ term, definition, tags: [tag], ...more });
  return [
    c(
      t('Comment utiliser une fiche ?', 'How do I use a card?'),
      t(
        'Lisez la **question**, cherchez la réponse de tête, puis **retournez** la fiche (clic ou Espace). C’est cet effort de mémoire, plus que la relecture, qui fait retenir.',
        'Read the **question**, try to recall the answer, then **flip** the card (click or Space). This effort of recall, more than re-reading, is what makes things stick.',
      ),
      t('bases', 'basics'),
    ),
    c(
      t(
        'Que se passe-t-il quand je réponds « Je sais » ou « À revoir » ?',
        'What happens when I answer “I know” or “Again”?',
      ),
      t(
        'En mode **Fiches**, une carte « à revoir » revient plus loin dans la séance. En **Révision**, votre note (À revoir, Difficile, Correct, Facile) fixe la date de la prochaine révision.',
        'In **Flashcards** mode, a card marked “again” comes back later in the session. In **Review**, your rating (Again, Hard, Good, Easy) sets the date of the next review.',
      ),
      t('bases', 'basics'),
    ),
    c(
      t('Qu’est-ce que la révision espacée ?', 'What is spaced repetition?'),
      t(
        'Revoir une carte **juste avant de l’oublier**. Flashcard calcule ce moment pour chaque carte (algorithme FSRS) : un peu de révision chaque jour, et les cartes connues reviennent de plus en plus rarement.',
        'Reviewing a card **just before you forget it**. Flashcard works out that moment for each card (FSRS algorithm): a little review every day, and known cards come back less and less often.',
      ),
      t('étude', 'study'),
      {
        example: t(
          'Le nombre de cartes du jour est sur la bibliothèque ; les limites se règlent dans Réglages › Étude.',
          'The number of cards due today is on the library; limits are in Settings › Study.',
        ),
      },
    ),
    c(
      t('Quels autres modes d’étude existent ?', 'Which other study modes are there?'),
      t(
        '- **Apprendre** : choix multiple, puis réponse écrite\n- **Écrire** : taper la réponse\n- **Test** : un examen noté\n- **Association** et **Gravité** : des jeux contre la montre',
        '- **Learn**: multiple choice, then typed answers\n- **Write**: type the answer\n- **Test**: a graded exam\n- **Match** and **Gravity**: games against the clock',
      ),
      t('étude', 'study'),
    ),
    c(
      t('À quoi sert le bouton « Indice » ?', 'What is the “Hint” button for?'),
      t(
        'À afficher un **indice** facultatif avant la réponse, comme celui de cette carte. Il se saisit dans « Indice, exemple, images, audio », sous la carte dans l’éditeur.',
        'To show an optional **hint** before the answer, like the one on this card. You enter it under “Hint, example, images, audio”, below the card in the editor.',
      ),
      t('contenu', 'content'),
      {
        hint: t('Un coup de pouce, sans donner la réponse.', 'A nudge, without giving the answer away.'),
        example: t(
          'Ceci est un **exemple** : il s’affiche avec la réponse, en bas de la fiche.',
          'This is an **example**: it shows with the answer, at the bottom of the card.',
        ),
      },
    ),
    c(
      t('Peut-on mettre en forme le texte ?', 'Can I format the text?'),
      t(
        'Oui, en Markdown : **gras** (entre deux paires d’astérisques), *italique* (entre astérisques simples), `code`, listes et [liens](https://fr.wikipedia.org/wiki/Markdown).',
        'Yes, with Markdown: **bold** (between double asterisks), *italics* (between single asterisks), `code`, lists and [links](https://en.wikipedia.org/wiki/Markdown).',
      ),
      t('contenu', 'content'),
    ),
    c(t('Quel est cet astre ?', 'What is this star?'), t('Le Soleil.', 'The Sun.'), t('contenu', 'content'), {
      termImage: SUN_IMG,
      example: t(
        'Une image peut accompagner la question, ou la remplacer : « Image du terme » dans l’éditeur.',
        'An image can go with the question, or replace it: “Term image” in the editor.',
      ),
    }),
    c(
      t('Comment montrer une image avec la réponse ?', 'How do I show an image with the answer?'),
      t(
        'Avec « Image de la définition ». La voici : la Terre vue de l’espace.',
        'With “Definition image”. Here it is: the Earth seen from space.',
      ),
      t('contenu', 'content'),
      { image: EARTH_IMG },
    ),
    c(
      t('Comment entendre la prononciation ?', 'How do I hear the pronunciation?'),
      t(
        'Le bouton **haut-parleur** lit la face à voix haute, dans la langue choisie pour le jeu (dans « Modifier »). On peut aussi joindre son propre enregistrement : « Audio (prononciation) ».',
        'The **speaker** button reads the side aloud, in the language chosen for the set (in “Edit”). You can also attach your own recording: “Audio (pronunciation)”.',
      ),
      t('contenu', 'content'),
    ),
    c(
      t('Puis-je changer l’apparence d’une carte ?', 'Can I change how a card looks?'),
      t(
        'Oui : celle-ci a son propre fond, sa police et sa taille, réglés dans « Apparence de cette carte ».',
        'Yes: this one has its own background, font and size, set in “Appearance of this card”.',
      ),
      t('apparence', 'appearance'),
      { style: { bg: '#FDE68A', font: 'hand', size: 'lg', align: 'center' } },
    ),
    c(
      t('Comment l’apparence est-elle choisie ?', 'How is the appearance chosen?'),
      t(
        'Sur trois niveaux : les **réglages** (toutes les cartes), puis le **jeu**, puis la **carte**, chacun remplaçant le précédent. Ici, le verso a sa propre couleur, et le texte s’ajuste pour rester lisible.',
        'On three levels: **settings** (every card), then the **set**, then the **card**, each one overriding the previous. Here, the back has its own colour, and the text adapts to stay readable.',
      ),
      t('apparence', 'appearance'),
      { style: { bg: '#1E3A5F', backBg: '#E0F2FE', font: 'mono', paper: 'grid' } },
    ),
    c(
      t('Et une image de fond ?', 'What about a background image?'),
      t(
        'Possible aussi, pour un jeu ou une carte (« Image de fond »), ici sur papier uni.',
        'Possible too, for a set or a card (“Background image”), here on plain paper.',
      ),
      t('apparence', 'appearance'),
      { style: { bgImage: PATTERN, paper: 'plain', align: 'center', font: 'sans' } },
    ),
    {
      type: 'cloze',
      term: t(
        'Un texte à {{c1::trous}} cache un ou plusieurs mots à retrouver.',
        'A {{c1::cloze}} text hides one or more words to recall.',
      ),
      definition: t(
        'Dans l’éditeur : type « Texte à trous », sélectionnez un mot, puis « Créer un trou ».',
        'In the editor: “Cloze” type, select a word, then “Make a blank”.',
      ),
      tags: [t('trous', 'cloze')],
    },
    {
      type: 'cloze',
      term: t(
        'Un trou peut afficher un {{c1::indice::mot d’aide}} à la place de […].',
        'A blank can show a {{c1::hint::helper word}} instead of […].',
      ),
      definition: t('Écrivez l’indice après « :: » dans le trou.', 'Write the hint after “::” inside the blank.'),
      tags: [t('trous', 'cloze')],
    },
    {
      type: 'cloze',
      term: t(
        'Le trou {{c1::numéro 1}} et le trou {{c2::numéro 2}} donnent deux cartes d’étude.',
        'Blank {{c1::number 1}} and blank {{c2::number 2}} make two study cards.',
      ),
      definition: t(
        'Chaque numéro (c1, c2…) devient une carte qui ne cache que son trou.',
        'Each number (c1, c2…) becomes a card that hides only its own blank.',
      ),
      tags: [t('trous', 'cloze')],
    },
    {
      type: 'cloze',
      term: t(
        'Des trous de même numéro sont {{c1::cachés}} et {{c1::révélés}} ensemble.',
        'Blanks with the same number are {{c1::hidden}} and {{c1::revealed}} together.',
      ),
      definition: t('Bouton « Même trou que le précédent ».', '“Same blank as previous” button.'),
      tags: [t('trous', 'cloze')],
    },
    planetsCard(
      t(['Mercure', 'Vénus', 'Terre', 'Mars'], ['Mercury', 'Venus', 'Earth', 'Mars']),
      t('Image masquée : quelles sont les planètes rocheuses ?', 'Image occlusion: which are the rocky planets?'),
      t(
        'Mode « Masquer tout, deviner un » : tous les noms sont cachés, un seul est demandé à la fois. Chaque masque a une réponse écrite, donc la carte sert aussi dans Apprendre, Écrire et Test.',
        '“Hide all, guess one” mode: every name is hidden, one is asked at a time. Each mask has a written answer, so the card also works in Learn, Write and Test.',
      ),
      t('image-masquee', 'image-occlusion'),
    ),
    colorWheelCard(
      t(['rouge', 'orange', 'jaune', 'vert', 'bleu', 'violet'], ['red', 'orange', 'yellow', 'green', 'blue', 'purple']),
      t('Image masquée : le cercle chromatique', 'Image occlusion: the colour wheel'),
      t(
        'Mode « Masquer un, deviner un » : seul le groupe demandé est caché. Les trois couleurs secondaires forment un seul groupe, révélé d’un coup.',
        '“Hide one, guess one” mode: only the asked group is hidden. The three secondary colours form a single group, revealed at once.',
      ),
      t('image-masquee', 'image-occlusion'),
    ),
    c(
      t('Comment retrouver une carte parmi tous mes jeux ?', 'How do I find a card across all my sets?'),
      t(
        'La page **Cartes** cherche partout, avec des filtres : `tag:trous`, `is:due`, `-set:anglais`… Les étiquettes de cette visite (bases, trous, apparence…) servent à ça.',
        'The **Cards** page searches everywhere, with filters: `tag:cloze`, `is:due`, `-set:spanish`… The tags of this tour (basics, cloze, appearance…) are there for that.',
      ),
      t('organisation', 'organisation'),
      { example: t('Essayez : Cartes › tag:trous', 'Try: Cards › tag:cloze') },
    ),
    c(
      t('À quoi servent l’étoile et la pause ?', 'What are the star and the pause for?'),
      t(
        'L’**étoile** marque une carte pour l’étudier à part (« Étoilées seulement »). La **pause** suspend une carte : elle ne revient plus en révision jusqu’à ce que vous la réactiviez.',
        'The **star** marks a card to study it separately (“Starred only”). The **pause** suspends a card: it stops coming back in reviews until you reactivate it.',
      ),
      t('organisation', 'organisation'),
    ),
    c(
      t('Comment voir une carte avant de l’étudier ?', 'How do I see a card before studying it?'),
      t(
        'Avec le bouton **Aperçu** (l’œil), dans l’éditeur, sur la page du jeu et dans Cartes : la fiche s’affiche telle qu’elle sera étudiée.',
        'With the **Preview** button (the eye), in the editor, on the set page and in Cards: the card shows exactly as it will be studied.',
      ),
      t('organisation', 'organisation'),
    ),
    c(
      t('Comment créer des cartes rapidement ?', 'How do I create cards quickly?'),
      t(
        '- **Coller plusieurs cartes**, une par ligne\n- **Importer** : Anki, CSV, Quizlet, Markdown\n- **Créer avec l’IA** depuis vos notes ou un PDF, avec une clé d’API ou gratuitement par copier-coller avec ChatGPT ou Claude',
        '- **Paste several cards**, one per line\n- **Import**: Anki, CSV, Quizlet, Markdown\n- **Create with AI** from your notes or a PDF, with an API key or for free by copy-paste with ChatGPT or Claude',
      ),
      t('contenu', 'content'),
    ),
    c(
      t('Comment ne pas perdre mes cartes ?', 'How do I keep my cards safe?'),
      t(
        'Configurez la **synchronisation Dropbox** (Réglages › Synchronisation) ou **exportez** régulièrement la bibliothèque (Réglages › Sauvegarde et restauration). Installer l’application sur l’écran d’accueil aide aussi.',
        'Set up **Dropbox sync** (Settings › Sync) or **export** the library regularly (Settings › Backup and restore). Installing the app on your home screen helps too.',
      ),
      t('données', 'data'),
    ),
    c(
      t('Que faire d’un jeu que je n’étudie plus ?', 'What do I do with a set I no longer study?'),
      t(
        '**Archivez-le** (bouton Archiver de sa page) : il quitte la bibliothèque avec sa progression, et se restaure à tout moment. Flashcard le propose de lui-même après 3 mois sans étude.',
        '**Archive it** (Archive button on its page): it leaves the library with its progress, and can be restored at any time. Flashcard suggests it after 3 months without study.',
      ),
      t('données', 'data'),
    ),
    c(
      t('Où trouver d’autres jeux pour essayer ?', 'Where can I find more sets to try?'),
      t(
        'Importer › **Jeux d’exemple** : drapeaux, langues, histoire, anatomie, formules…',
        'Import › **Example sets**: flags, languages, history, anatomy, formulas…',
      ),
      t('bases', 'basics'),
    ),
    c(
      t('Et maintenant ?', 'What now?'),
      t(
        'Créez votre premier jeu avec **Nouveau jeu**. Cette visite peut être supprimée ou archivée quand vous n’en avez plus besoin.',
        'Create your first set with **New set**. This tour can be deleted or archived once you no longer need it.',
      ),
      t('bases', 'basics'),
    ),
  ];
}

const tour = makeSet(
  5,
  {
    updated: TOUR_DATE,
    title: 'Visite guidée : découvrir Flashcard',
    description:
      'Une visite en questions-réponses : chaque carte explique une fonction de Flashcard, et la montre. Étudiez-la en mode Fiches, puis ouvrez « Modifier » pour voir comment chaque carte est faite.',
    folder: 'Exemples',
    language: { term: 'fr', definition: 'fr' },
    tags: ['prise en main', 'exemple'],
    color: '#8a5cd6',
  },
  tourCards('fr'),
);

const tourEn = makeSet(
  15,
  {
    updated: TOUR_DATE,
    title: 'Guided tour: discover Flashcard',
    description:
      'A tour in questions and answers: each card explains a Flashcard feature, and shows it. Study it in Flashcards mode, then open “Edit” to see how each card is made.',
    folder: 'Examples',
    language: { term: 'en', definition: 'en' },
    tags: ['getting started', 'example'],
    color: '#8a5cd6',
  },
  tourCards('en'),
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

// Catalogue : jeux proposés à la demande (Importer › Jeux d'exemple), décrits par catalog.json.
async function writeCatalog(lang, entries) {
  const dir = new URL(`../examples/${lang}/`, import.meta.url);
  const list = [];
  for (const [name, set, meta] of entries) {
    const bytes = await exportBundle({ sets: [set], getMedia: async (p) => media.get(p) ?? null });
    const file = `${name}.flashcard.zip`;
    await writeFile(new URL(file, dir), bytes);
    list.push({ file, id: set.id, cards: set.cards.length, color: set.color, ...meta });
    console.log(`examples/${lang}/${file} : ${set.cards.length} cartes, ${(bytes.length / 1024).toFixed(0)} Ko`);
  }
  await writeFile(new URL('catalog.json', dir), JSON.stringify(list, null, 2) + '\n');
}
const catalog = buildCatalog({ makeSet, addSvg });
await writeCatalog('fr', catalog.fr);
await writeCatalog('en', catalog.en);
