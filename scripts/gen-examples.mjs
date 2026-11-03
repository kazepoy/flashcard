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

const SUN_IMG = addSvg(SUN);
const EARTH_IMG = addSvg(EARTH);

const TOUR_DATE = '2026-11-02T00:00:05.000Z';

/**
 * Visite guidée en questions-réponses : chaque carte répond à une question qu'on se pose en découvrant
 * Flashcard, et montre la fonction sur elle-même (la carte sur l'indice a un indice, celle sur les trous est
 * un texte à trous…). Un exemple par type de carte, expliqué en détail ; une série « apparence » où chaque carte
 * porte le réglage qu'elle décrit. Étiquettes : bases, étude, contenu, trous, image-masquee, apparence,
 * organisation, données.
 */
function tourCards(L) {
  const F = L === 'fr';
  // français : espaces insécables avant ? ! : ; » et après «, pour qu'aucun signe ne commence une ligne
  const nbsp = (s) => s.replace(/ ([?!:;»])/g, '\u00a0$1').replace(/« /g, '«\u00a0');
  const t = (fr, en) => (F ? (typeof fr === 'string' ? nbsp(fr) : fr) : en);
  const c = (term, definition, tag, more = {}) => ({ term, definition, tags: [tag], ...more });
  const BASICS = t('bases', 'basics');
  const STUDY = t('étude', 'study');
  const CONTENT = t('contenu', 'content');
  const CLOZE = t('trous', 'cloze');
  const LOOK = t('apparence', 'appearance');
  const ORG = t('organisation', 'organisation');
  const DATA = t('données', 'data');
  return [
    // ---------------------------------------------------------------- bases et étude
    c(
      t('Comment utiliser une fiche ?', 'How do I use a card?'),
      t(
        'Lisez la **question** et cherchez la réponse **de tête**, puis **retournez** la fiche (clic ou Espace).\nEn mode Fiches, dites ensuite si vous saviez : **Je sais** (→) ou **À revoir** (←).\nC’est l’effort de mémoire, plus que la relecture, qui fait retenir.',
        'Read the **question** and try to recall the answer **in your head**, then **flip** the card (click or Space).\nIn Flashcards mode, then say whether you knew it: **I know** (→) or **Again** (←).\nThis effort of recall, more than re-reading, is what makes things stick.',
      ),
      BASICS,
    ),
    c(
      t('Fiches ou Révision espacée : lequel choisir ?', 'Flashcards or Spaced review: which one?'),
      t(
        '- **Fiches** : tout le jeu, dans l’ordre ou mélangé ; une carte « à revoir » revient plus loin dans la séance. Rien n’est planifié.\n- **Révision espacée** : seulement les cartes du jour. Votre note (À revoir, Difficile, Bien, Facile) fixe la date de leur prochain passage.',
        '- **Flashcards**: the whole set, in order or shuffled; a card marked “again” comes back later in the session. Nothing is scheduled.\n- **Spaced review**: only today’s cards. Your rating (Again, Hard, Good, Easy) sets the date they come back.',
      ),
      STUDY,
      {
        example: t(
          'Sous chaque bouton de note, le délai avant le prochain passage : « 10 min », « 3 j »…',
          'Under each rating button, the delay before the card comes back: “10 min”, “3 d”…',
        ),
      },
    ),
    c(
      t('Qu’est-ce que la révision espacée ?', 'What is spaced repetition?'),
      t(
        'Revoir une carte **juste avant de l’oublier**. Flashcard estime ce moment pour chaque carte (algorithme FSRS) : une carte réussie revient de plus en plus tard (quelques jours, puis des semaines, puis des mois), une carte oubliée revient vite. Quelques minutes par jour suffisent.',
        'Reviewing a card **just before you forget it**. Flashcard estimates that moment for each card (FSRS algorithm): a card you get right comes back later and later (a few days, then weeks, then months), a forgotten card comes back soon. A few minutes a day is enough.',
      ),
      STUDY,
      {
        example: t(
          'Le nombre de cartes du jour est sur la bibliothèque ; les limites (nouvelles cartes, révisions) se règlent dans Réglages › Étude.',
          'The number of cards due today is on the library; limits (new cards, reviews) are in Settings › Study.',
        ),
      },
    ),
    c(
      t('Quels autres modes d’étude existent ?', 'Which other study modes are there?'),
      t(
        '- **Apprendre** : manches de 7 cartes, choix multiple puis réponse à taper\n- **Écrire** : taper la réponse, sans choix proposé\n- **Épeler** : écouter le mot et l’écrire\n- **Test** : un contrôle noté (choix multiple, vrai ou faux, réponse écrite…)\n- **Association** et **Gravité** : des jeux contre la montre',
        '- **Learn**: rounds of 7 cards, multiple choice then typed answers\n- **Write**: type the answer, with no choices\n- **Spell**: hear the word and write it\n- **Test**: a graded quiz (multiple choice, true or false, typed answers…)\n- **Match** and **Gravity**: games against the clock',
      ),
      STUDY,
      {
        example: t(
          'Sur la page d’un jeu, l’icône ⓘ de chaque mode dit à quoi il sert ; un mode grisé n’a aucune carte qui s’y prête.',
          'On a set’s page, the ⓘ icon of each mode says what it is for; a greyed-out mode has no suitable card.',
        ),
      },
    ),
    // ---------------------------------------------------------------- contenu : un exemple par possibilité
    c(
      t('À quoi servent l’indice et l’exemple ?', 'What are the hint and the example for?'),
      t(
        'L’**indice** s’affiche en bas du recto, comme sur cette carte : un coup de pouce, sans donner la réponse. L’**exemple** s’affiche en bas du verso, sous la réponse : une phrase, un contexte.\nTous deux se saisissent dans « Indice, exemple, images, audio », sous la carte dans l’éditeur.',
        'The **hint** shows at the bottom of the front, as on this card: a nudge, without giving the answer away. The **example** shows at the bottom of the back, under the answer: a sentence, some context.\nBoth are entered under “Hint, example, images, audio”, below the card in the editor.',
      ),
      CONTENT,
      {
        hint: t('Un coup de pouce, sans donner la réponse.', 'A nudge, without giving the answer away.'),
        example: t(
          'Le voici : il complète la réponse sans l’encombrer.',
          'Here it is: it adds to the answer without cluttering it.',
        ),
      },
    ),
    c(
      t('Peut-on mettre en forme le texte ?', 'Can I format the text?'),
      t(
        'Oui, avec quelques signes (Markdown) :\n- **gras** : entre deux paires d’astérisques\n- *italique* : entre astérisques simples\n- `code` : entre accents graves\n- [liens](https://fr.wikipedia.org/wiki/Markdown) : le texte entre crochets, l’adresse entre parenthèses\nUn retour à la ligne dans l’éditeur passe à la ligne sur la fiche.',
        'Yes, with a few signs (Markdown):\n- **bold**: between double asterisks\n- *italics*: between single asterisks\n- `code`: between backticks\n- [links](https://en.wikipedia.org/wiki/Markdown): the text in square brackets, the address in parentheses\nA line break in the editor is a line break on the card.',
      ),
      CONTENT,
    ),
    c(
      t('Quel est cet astre ?', 'What is this star?'),
      t(
        'Le **Soleil**. Et voici la Terre, vue de l’espace.\nUne carte peut porter une image de chaque côté : « Image du terme » pour la question, « Image de la définition » pour la réponse. Une image seule, sans texte, suffit aussi.',
        'The **Sun**. And here is the Earth, seen from space.\nA card can carry an image on each side: “Term image” for the question, “Definition image” for the answer. An image alone, with no text, works too.',
      ),
      CONTENT,
      {
        termImage: SUN_IMG,
        image: EARTH_IMG,
      },
    ),
    c(
      t('Comment entendre la prononciation ?', 'How do I hear the pronunciation?'),
      t(
        'Le bouton **haut-parleur**, en haut à droite de la fiche, lit la face à voix haute dans la langue du jeu (« Modifier » › langue des termes, langue des définitions).\nPour une prononciation exacte, joignez votre propre enregistrement : « Audio (prononciation) ».',
        'The **speaker** button, at the top right of the card, reads the side aloud in the set’s language (“Edit” › term language, definition language).\nFor an exact pronunciation, attach your own recording: “Audio (pronunciation)”.',
      ),
      CONTENT,
    ),
    {
      type: 'cloze',
      term: t(
        'Un texte à {{c1::trous}} cache des mots à retrouver ; un trou peut aussi afficher un {{c2::indice::mot d’aide}} entre ses crochets.',
        'A {{c1::cloze}} text hides words to recall; a blank can also show a {{c2::hint::helper word}} between its brackets.',
      ),
      definition: t(
        'Dans l’éditeur : type « Texte à trous », sélectionnez un mot, puis « Créer un trou ». Chaque numéro (c1, c2…) devient sa propre carte, qui ne cache que son trou : celle-ci en donne deux. L’indice s’écrit après « :: » dans le trou.',
        'In the editor: “Cloze” type, select a word, then “Make a blank”. Each number (c1, c2…) becomes its own card, hiding only its blank: this one makes two. The hint goes after “::” inside the blank.',
      ),
      tags: [CLOZE],
    },
    {
      type: 'cloze',
      term: t(
        'Des trous de même numéro sont {{c1::cachés}} et {{c1::révélés}} ensemble.',
        'Blanks with the same number are {{c1::hidden}} and {{c1::revealed}} together.',
      ),
      definition: t(
        'Bouton « Même trou que le précédent ». Sur cette carte, les mots révélés sont en rouge : « Mots révélés » dans l’apparence.',
        '“Same blank as the previous one” button. On this card, revealed words are red: “Revealed words” in the appearance.',
      ),
      tags: [CLOZE],
      style: { cloze: '#C62828', paper: 'dots' },
    },
    planetsCard(
      t(['Mercure', 'Vénus', 'Terre', 'Mars'], ['Mercury', 'Venus', 'Earth', 'Mars']),
      t('Image masquée : quelles sont les planètes rocheuses ?', 'Image occlusion: which are the rocky planets?'),
      t(
        'Mode « Masquer tout, deviner un » : tous les noms sont cachés, un seul est demandé à la fois. L’autre mode, « Masquer un, deviner un », ne cache que le nom demandé.\nChaque masque a ici une réponse écrite : la carte sert aussi dans Apprendre, Écrire et Test.',
        '“Hide all, guess one” mode: every name is hidden, one is asked at a time. The other mode, “Hide one, guess one”, hides only the name being asked.\nEach mask here has a written answer, so the card also works in Learn, Write and Test.',
      ),
      t('image-masquee', 'image-occlusion'),
    ),
    // ---------------------------------------------------------------- apparence : chaque carte porte ce qu'elle décrit
    c(
      t('Comment l’apparence d’une carte est-elle choisie ?', 'How is a card’s appearance chosen?'),
      t(
        'Sur trois niveaux, chacun remplaçant le précédent :\n- **Réglages** › Apparence par défaut des cartes : toutes les cartes\n- **Jeu** : « Apparence des cartes de ce jeu », dans « Modifier »\n- **Carte** : « Apparence de cette carte », sous la carte\nCelle-ci a l’apparence par défaut ; les suivantes ont chacune la leur.',
        'On three levels, each overriding the previous one:\n- **Settings** › Default card appearance: every card\n- **Set**: “Appearance of this set’s cards”, in “Edit”\n- **Card**: “Appearance of this card”, below the card\nThis one has the default appearance; the next ones each have their own.',
      ),
      LOOK,
      {
        example: t(
          'Ouvrez « Modifier » sur ces cartes pour voir leurs réglages.',
          'Open “Edit” on these cards to see their settings.',
        ),
      },
    ),
    c(
      t('Quel papier pour mes fiches ?', 'Which paper for my cards?'),
      t(
        'Quatre papiers : **lignée** (par défaut, comme une fiche bristol), **quadrillée** (celle-ci), **pointillée** et **unie**.\nLe fond se choisit parmi huit couleurs, ou n’importe quelle autre (bouton +).',
        'Four papers: **ruled** (the default, like an index card), **grid** (this one), **dotted** and **plain**.\nThe background is one of eight colours, or any other (+ button).',
      ),
      LOOK,
      { style: { bg: '#FFF3A3', paper: 'grid', font: 'hand' } },
    ),
    c(
      t('Et sur un fond sombre ?', 'What about a dark background?'),
      t(
        'Le texte passe en blanc tout seul pour rester lisible. Le verso a ici son propre fond, clair (« Fond du verso ») : retournez la fiche.\nUne couleur de texte choisie mais illisible sur le fond est remplacée automatiquement.',
        'The text turns white on its own to stay readable. Here the back has its own light background (“Back background”): flip the card.\nA chosen text colour that would be unreadable on the background is replaced automatically.',
      ),
      LOOK,
      { style: { bg: '#1B2A41', backBg: '#CFF1DC', paper: 'plain', font: 'serif' } },
    ),
    c(
      t('Quelle police choisir ?', 'Which font should I choose?'),
      t(
        'Celle-ci est **OpenDyslexic**, pensée pour la dyslexie. Atkinson Hyperlegible, Lexend et Andika visent aussi la lisibilité ; il y a encore Serif, Sans-serif, Machine à écrire et Manuscrite.',
        'This one is **OpenDyslexic**, designed for dyslexia. Atkinson Hyperlegible, Lexend and Andika also aim at readability; there are also Serif, Sans-serif, Typewriter and Handwriting.',
      ),
      LOOK,
      {
        style: { font: 'opendyslexic', paper: 'dots', bg: '#E3DAFF' },
        example: t(
          'La police de lecture choisie dans Réglages › Apparence sert aussi de police par défaut aux cartes.',
          'The reading font chosen in Settings › Appearance is also the cards’ default font.',
        ),
      },
    ),
    c(
      t('Quelle taille de texte ?', 'What text size?'),
      t(
        '**Très grande**, ici : pour un mot, un nombre, un symbole.',
        '**Extra large**, here: for a word, a number, a symbol.',
      ),
      LOOK,
      {
        style: { size: 'xl', bg: '#FFE0C2', paper: 'plain' },
        example: t(
          'Par défaut, la taille est **Auto** : le texte remplit la fiche sans la dépasser, plus grand pour une réponse courte, plus petit pour une longue. Petite, Moyenne, Grande et Très grande fixent la taille.',
          'By default, the size is **Auto**: the text fills the card without overflowing, larger for a short answer, smaller for a long one. Small, Medium, Large and Extra large set a fixed size.',
        ),
      },
    ),
    c(
      t('Peut-on aligner le texte à gauche ?', 'Can I align the text to the left?'),
      t(
        'Oui, et en haut de la fiche plutôt qu’au milieu : pratique pour les listes et les textes longs.\n- Alignement horizontal : centré ou à gauche\n- Alignement vertical : centré ou en haut\nSur papier ligné, chaque ligne tombe alors sur la trame.',
        'Yes, and at the top of the card rather than in the middle: handy for lists and long texts.\n- Horizontal alignment: centred or left\n- Vertical alignment: centred or top\nOn ruled paper, each line then sits on a rule.',
      ),
      LOOK,
      { style: { align: 'left', valign: 'top' } },
    ),
    c(
      t('Et une image de fond ?', 'What about a background image?'),
      t(
        'Possible pour un jeu ou une carte (« Image de fond ») : un motif comme ici, une photo… Elle est voilée de la couleur du fond pour que le texte reste lisible.',
        'Possible for a set or a card (“Background image”): a pattern like this one, a photo… It is veiled with the background colour so the text stays readable.',
      ),
      LOOK,
      { style: { bgImage: PATTERN, paper: 'plain', font: 'sans' } },
    ),
    c(
      t('La question doit-elle être rappelée au verso ?', 'Should the question be repeated on the back?'),
      t(
        'Par défaut, elle est rappelée en petit au-dessus de la réponse. Sur cette carte, elle est masquée : « Question au verso » › Masquée, dans l’apparence (réglages, jeu ou carte).',
        'By default, it is repeated in small type above the answer. On this card it is hidden: “Question on the back” › Hidden, in the appearance (settings, set or card).',
      ),
      LOOK,
      { style: { recall: 'hide' } },
    ),
    // ---------------------------------------------------------------- organisation
    c(
      t('Comment retrouver une carte parmi tous mes jeux ?', 'How do I find a card across all my sets?'),
      t(
        'La page **Cartes** cherche dans tous vos jeux, avec des filtres :\n- `tag:trous` : une étiquette\n- `is:due` : à réviser aujourd’hui\n- `-set:anglais` : sauf un jeu\nCliquez une ligne : la carte se déplie dessous, avec sa planification et son historique.',
        'The **Cards** page searches all your sets, with filters:\n- `tag:cloze`: a tag\n- `is:due`: due today\n- `-set:spanish`: except one set\nClick a row: the card unfolds below it, with its schedule and history.',
      ),
      ORG,
      { example: t('Essayez Cartes › tag:apparence', 'Try Cards › tag:appearance') },
    ),
    c(
      t('À quoi servent l’étoile et la pause ?', 'What are the star and the pause for?'),
      t(
        'L’**étoile** marque une carte pour l’étudier à part (« Étoilées seulement », en mode Fiches).\nLa **pause** suspend une carte : elle ne revient plus en révision jusqu’à ce que vous la réactiviez. Pratique pour une carte mal faite, le temps de la corriger.',
        'The **star** marks a card to study it separately (“Starred only”, in Flashcards mode).\nThe **pause** suspends a card: it stops coming back in reviews until you reactivate it. Handy for a badly made card, until you fix it.',
      ),
      ORG,
    ),
    c(
      t('Comment voir une carte avant de l’étudier ?', 'How do I see a card before studying it?'),
      t(
        'Avec le bouton **Aperçu** (l’œil), dans l’éditeur, sur la page du jeu et dans Cartes : la fiche s’affiche telle qu’elle sera étudiée, recto et verso, avec son apparence.',
        'With the **Preview** button (the eye), in the editor, on the set page and in Cards: the card shows exactly as it will be studied, front and back, with its appearance.',
      ),
      ORG,
    ),
    // ---------------------------------------------------------------- données
    c(
      t('Comment créer des cartes rapidement ?', 'How do I create cards quickly?'),
      t(
        '- **Coller plusieurs cartes**, une par ligne, dans l’éditeur\n- **Importer** : Anki, CSV, Quizlet, Markdown\n- **Créer avec l’IA** depuis un sujet, vos notes ou un PDF : avec une clé d’API, ou gratuitement par copier-coller avec ChatGPT ou Claude',
        '- **Paste several cards**, one per line, in the editor\n- **Import**: Anki, CSV, Quizlet, Markdown\n- **Create with AI** from a topic, your notes or a PDF: with an API key, or for free by copy-paste with ChatGPT or Claude',
      ),
      DATA,
    ),
    c(
      t('Comment ne pas perdre mes cartes ?', 'How do I keep my cards safe?'),
      t(
        '- **Synchronisation Dropbox** (Réglages › Synchronisation) : une copie en ligne, et vos jeux sur tous vos appareils\n- **Export** de la bibliothèque (Réglages › Sauvegarde et restauration) : un fichier à garder\n- **Installer l’application** sur l’écran d’accueil : le navigateur n’effacera plus ses données',
        '- **Dropbox sync** (Settings › Sync): an online copy, and your sets on all your devices\n- **Export** the library (Settings › Backup and restore): a file to keep\n- **Install the app** on your home screen: the browser will no longer erase its data',
      ),
      DATA,
    ),
    c(
      t('Que faire d’un jeu que je n’étudie plus ?', 'What do I do with a set I no longer study?'),
      t(
        '**Archivez-le** (bouton Archiver de sa page) : il quitte la bibliothèque avec sa progression, et se restaure à tout moment depuis Réglages › Sauvegarde et restauration. Flashcard le propose de lui-même après 3 mois sans étude.',
        '**Archive it** (Archive button on its page): it leaves the library with its progress, and can be restored at any time from Settings › Backup and restore. Flashcard suggests it after 3 months without study.',
      ),
      DATA,
    ),
    c(
      t('Où trouver d’autres jeux pour essayer ?', 'Where can I find more sets to try?'),
      t(
        'Importer › **Jeux d’exemple** : drapeaux, langues, histoire, anatomie, formules… Chacun met en valeur d’autres possibilités : images masquées, apparence d’un jeu, lecture à voix haute.',
        'Import › **Example sets**: flags, languages, history, anatomy, formulas… Each one shows other possibilities: image occlusion, a set’s appearance, reading aloud.',
      ),
      BASICS,
    ),
    c(
      t('Et maintenant ?', 'What now?'),
      t(
        'Créez votre premier jeu avec **Nouveau jeu**. Cette visite peut être supprimée ou archivée quand vous n’en avez plus besoin.',
        'Create your first set with **New set**. This tour can be deleted or archived once you no longer need it.',
      ),
      BASICS,
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
