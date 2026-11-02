// Catalogue des jeux d'exemple proposés à la demande (Importer › Jeux d'exemple), en plus de la visite guidée
// importée à la première ouverture. Appelé par gen-examples.mjs, qui fournit les outils (makeSet, addSvg…).
// Contenu rédigé pour le projet ; illustrations dessinées en SVG ici même : aucune image soumise à des droits.

/** @returns {{fr: Array<[string, object, object]>, en: Array<[string, object, object]>}} [fichier, jeu, fiche du catalogue] */
export function buildCatalog({ makeSet, addSvg }) {
  const DATE = '2026-11-02T00:00:00.000Z';
  const fr = [];
  const en = [];
  // identifiants fixes : 100 + k (français), 200 + k (anglais)
  let k = 0;
  const add = (name, setFr, setEn, metaFr, metaEn) => {
    k++;
    const folder = { fr: 'Exemples', en: 'Examples' };
    const a = makeSet(100 + k, { created: DATE, updated: DATE, folder: folder.fr, ...setFr.fields }, setFr.cards);
    const b = makeSet(200 + k, { created: DATE, updated: DATE, folder: folder.en, ...setEn.fields }, setEn.cards);
    fr.push([name.fr, a, metaFr]);
    en.push([name.en, b, metaEn]);
  };

  // ---------------------------------------------------------------- drapeaux et capitales
  const W = 300;
  const H = 200;
  const frame = (body, w = W, h = H) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="none" stroke="#9aa6b5"/></svg>`;
  const rect = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
  const bands = (dir, list) => {
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
  const v = (...c) => frame(bands('v', c));
  const h = (...c) => frame(bands('h', c));
  const disc = (bg, color, r, cx = W / 2) =>
    frame(rect(0, 0, W, H, bg) + `<circle cx="${cx}" cy="${H / 2}" r="${r}" fill="${color}"/>`);
  /** Croix scandinave ; `inner` : croix intérieure (Norvège, Islande). */
  const nordic = (bg, cross, inner) => {
    const cx = W * 0.36;
    const t = H * 0.2;
    let body = rect(0, 0, W, H, bg) + rect(cx - t / 2, 0, t, H, cross) + rect(0, H / 2 - t / 2, W, t, cross);
    if (inner) body += rect(cx - t / 4, 0, t / 2, H, inner) + rect(0, H / 2 - t / 4, W, t / 2, inner);
    return frame(body);
  };
  // [français, anglais, capitale fr, capitale en, drapeau, indice fr, indice en]
  const COUNTRIES = [
    ['France', 'France', 'Paris', 'Paris', v('#0055A4', '#FFFFFF', '#EF4135')],
    ['Italie', 'Italy', 'Rome', 'Rome', v('#009246', '#FFFFFF', '#CE2B37')],
    ['Belgique', 'Belgium', 'Bruxelles', 'Brussels', v('#000000', '#FDDA24', '#EF3340')],
    [
      'Irlande',
      'Ireland',
      'Dublin',
      'Dublin',
      v('#169B62', '#FFFFFF', '#FF883E'),
      "Vert côté mât (la Côte d'Ivoire a l'orange côté mât)",
      "Green at the hoist (Côte d'Ivoire has orange at the hoist)",
    ],
    [
      "Côte d'Ivoire",
      "Côte d'Ivoire",
      'Yamoussoukro',
      'Yamoussoukro',
      v('#F77F00', '#FFFFFF', '#009E60'),
      "Orange côté mât (l'Irlande a le vert côté mât)",
      'Orange at the hoist (Ireland has green at the hoist)',
    ],
    [
      'Roumanie',
      'Romania',
      'Bucarest',
      'Bucharest',
      v('#002B7F', '#FCD116', '#CE1126'),
      'Presque identique au drapeau du Tchad (bleu un peu plus clair)',
      "Almost identical to Chad's flag (slightly lighter blue)",
    ],
    [
      'Tchad',
      'Chad',
      "N'Djaména",
      "N'Djamena",
      v('#002664', '#FECB00', '#C60C30'),
      'Presque identique au drapeau de la Roumanie (bleu plus foncé)',
      "Almost identical to Romania's flag (darker blue)",
    ],
    ['Mali', 'Mali', 'Bamako', 'Bamako', v('#14B53A', '#FCD116', '#CE1126')],
    ['Guinée', 'Guinea', 'Conakry', 'Conakry', v('#CE1126', '#FCD116', '#009460')],
    ['Nigeria', 'Nigeria', 'Abuja', 'Abuja', v('#008751', '#FFFFFF', '#008751')],
    ['Pérou', 'Peru', 'Lima', 'Lima', v('#D91023', '#FFFFFF', '#D91023')],
    ['Allemagne', 'Germany', 'Berlin', 'Berlin', h('#000000', '#DD0000', '#FFCE00')],
    ['Pays-Bas', 'Netherlands', 'Amsterdam', 'Amsterdam', h('#AE1C28', '#FFFFFF', '#21468B')],
    [
      'Luxembourg',
      'Luxembourg',
      'Luxembourg',
      'Luxembourg',
      h('#EA141D', '#FFFFFF', '#51ADDA'),
      'Comme les Pays-Bas, mais bleu ciel',
      'Like the Netherlands, but sky blue',
    ],
    ['Autriche', 'Austria', 'Vienne', 'Vienna', h('#C8102E', '#FFFFFF', '#C8102E')],
    ['Hongrie', 'Hungary', 'Budapest', 'Budapest', h('#CE2939', '#FFFFFF', '#477050')],
    ['Bulgarie', 'Bulgaria', 'Sofia', 'Sofia', h('#FFFFFF', '#00966E', '#D62612')],
    ['Lituanie', 'Lithuania', 'Vilnius', 'Vilnius', h('#FDB913', '#006A44', '#C1272D')],
    ['Estonie', 'Estonia', 'Tallinn', 'Tallinn', h('#0072CE', '#000000', '#FFFFFF')],
    ['Ukraine', 'Ukraine', 'Kyiv', 'Kyiv', h('#0057B7', '#FFD700')],
    ['Pologne', 'Poland', 'Varsovie', 'Warsaw', h('#FFFFFF', '#DC143C')],
    [
      'Indonésie',
      'Indonesia',
      'Jakarta',
      'Jakarta',
      h('#CE1126', '#FFFFFF'),
      'Même dessin que Monaco ; seules les proportions diffèrent',
      'Same design as Monaco; only the proportions differ',
    ],
    ['Yémen', 'Yemen', 'Sanaa', "Sana'a", h('#CE1126', '#FFFFFF', '#000000')],
    ['Colombie', 'Colombia', 'Bogota', 'Bogotá', h(['#FCD116', 2], '#003893', '#CE1126')],
    ['Gabon', 'Gabon', 'Libreville', 'Libreville', h('#009E60', '#FCD116', '#3A75C4')],
    ['Sierra Leone', 'Sierra Leone', 'Freetown', 'Freetown', h('#1EB53A', '#FFFFFF', '#0072C6')],
    ['Japon', 'Japan', 'Tokyo', 'Tokyo', disc('#FFFFFF', '#BC002D', H * 0.3)],
    [
      'Bangladesh',
      'Bangladesh',
      'Dacca',
      'Dhaka',
      disc('#006A4E', '#F42A41', W * 0.2, W * 0.45),
      'Disque rouge légèrement décalé vers le mât',
      'Red disc slightly shifted towards the hoist',
    ],
    ['Suède', 'Sweden', 'Stockholm', 'Stockholm', nordic('#006AA7', '#FECC00')],
    ['Danemark', 'Denmark', 'Copenhague', 'Copenhagen', nordic('#C8102E', '#FFFFFF')],
    ['Finlande', 'Finland', 'Helsinki', 'Helsinki', nordic('#FFFFFF', '#002F6C')],
    ['Norvège', 'Norway', 'Oslo', 'Oslo', nordic('#BA0C2F', '#FFFFFF', '#00205B')],
    ['Islande', 'Iceland', 'Reykjavik', 'Reykjavík', nordic('#02529C', '#FFFFFF', '#DC1E35')],
    [
      'Suisse',
      'Switzerland',
      'Berne',
      'Bern',
      frame(
        rect(0, 0, 200, 200, '#DA291C') + rect(80, 40, 40, 120, '#FFFFFF') + rect(40, 80, 120, 40, '#FFFFFF'),
        200,
        200,
      ),
      'Drapeau carré',
      'Square flag',
    ],
  ];
  const flagCards = (lang) =>
    COUNTRIES.flatMap(([cfr, cen, kfr, ken, svg, hfr = '', hen = '']) => {
      const [country, capital, hint] = lang === 'fr' ? [cfr, kfr, hfr] : [cen, ken, hen];
      const img = addSvg(svg);
      return [
        {
          term: '',
          termImage: img,
          definition: country,
          hint,
          example: (lang === 'fr' ? 'Capitale : ' : 'Capital: ') + capital,
          tags: [lang === 'fr' ? 'drapeaux' : 'flags'],
        },
        {
          term: lang === 'fr' ? `Capitale : ${country}` : `Capital of ${country}`,
          definition: capital,
          tags: [lang === 'fr' ? 'capitales' : 'capitals'],
        },
      ];
    });
  add(
    { fr: 'drapeaux-et-capitales', en: 'flags-and-capitals' },
    {
      fields: {
        title: 'Drapeaux et capitales du monde',
        description:
          'Reconnaître un drapeau, puis trouver la capitale du pays. Les paires faciles à confondre ont un indice.',
        tags: ['géographie'],
        color: '#2563EB',
        language: { term: 'fr', definition: 'fr' },
      },
      cards: flagCards('fr'),
    },
    {
      fields: {
        title: 'Flags and capitals of the world',
        description: 'Recognise a flag, then name the capital. Look-alike pairs come with a hint.',
        tags: ['geography'],
        color: '#2563EB',
        language: { term: 'en', definition: 'en' },
      },
      cards: flagCards('en'),
    },
    {
      title: 'Drapeaux et capitales du monde',
      description: 'Drapeaux dessinés, capitales, indices pour les paires trompeuses.',
      features: ['Images au recto', 'Association', 'Gravité'],
    },
    {
      title: 'Flags and capitals of the world',
      description: 'Drawn flags, capitals, hints for look-alike pairs.',
      features: ['Images on the front', 'Match', 'Gravity'],
    },
  );

  // ---------------------------------------------------------------- outils des planches (images masquées)
  const FONT = 'font-family="Helvetica, Arial, sans-serif"';
  const CHAR = 8.4; // largeur moyenne d’un caractère à 17 px (Helvetica)
  /**
   * Étiquettes reliées à leur cible, chacune couverte par un masque (un groupe par étiquette).
   * `labels` : [texte, x, y (ligne de base), ancrage 'start' | 'end' | 'middle', cible x, cible y].
   */
  function plate(width, height, drawing, labels, bg = '#ffffff', ink = '#0f172a') {
    let body = '';
    const masks = [];
    labels.forEach(([text, x, y, anchor, tx, ty], i) => {
      const w = text.length * CHAR + 12;
      const left = anchor === 'start' ? x - 6 : anchor === 'end' ? x - w + 6 : x - w / 2;
      const ex = anchor === 'start' ? left + w : anchor === 'end' ? left : x;
      const ey = anchor === 'middle' ? (ty > y ? y + 6 : y - 22) : y - 6;
      body += `<line x1="${ex}" y1="${ey}" x2="${tx}" y2="${ty}" stroke="${ink}" stroke-opacity="0.75" stroke-width="1.5"/><circle cx="${tx}" cy="${ty}" r="3" fill="${ink}"/>`;
      body += `<text x="${x}" y="${y}" text-anchor="${anchor}" ${FONT} font-size="17" fill="${ink}">${text}</text>`;
      masks.push({
        n: i + 1,
        shape: 'rect',
        x: left / width,
        y: (y - 20) / height,
        w: w / width,
        h: 27 / height,
        label: text,
      });
    });
    const image = addSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${bg}"/>${drawing}${body}</svg>`,
    );
    return { image, masks };
  }
  const occ = ({ image, masks }, term, definition, tags, mode = 'all') => ({
    type: 'occlusion',
    image,
    term,
    definition,
    occlusion: mode,
    masks,
    tags,
  });

  // ---------------------------------------------------------------- système solaire
  const PLANETS = [
    // [fr, en, rayon dessiné, couleur, anneau]
    ['Mercure', 'Mercury', 9, '#a8a29e'],
    ['Vénus', 'Venus', 15, '#fcd34d'],
    ['Terre', 'Earth', 16, '#3b82f6'],
    ['Mars', 'Mars', 12, '#ef4444'],
    ['Jupiter', 'Jupiter', 40, '#d6a36b'],
    ['Saturne', 'Saturn', 33, '#e9c97d', true],
    ['Uranus', 'Uranus', 24, '#7dd3fc'],
    ['Neptune', 'Neptune', 23, '#3b5bdb'],
  ];
  const solarPlate = (lang) => {
    const xs = [150, 215, 285, 355, 450, 580, 700, 800];
    let drawing = `<circle cx="-40" cy="150" r="130" fill="#fbbf24"/>`;
    PLANETS.forEach(([, , r, c, ring], i) => {
      if (ring)
        drawing += `<ellipse cx="${xs[i]}" cy="150" rx="${r * 1.9}" ry="${r * 0.55}" fill="none" stroke="#f5deb3" stroke-width="5"/>`;
      drawing += `<circle cx="${xs[i]}" cy="150" r="${r}" fill="${c}"/>`;
    });
    const labels = PLANETS.map(([f, e, r], i) => [
      lang === 'fr' ? f : e,
      xs[i],
      i % 2 ? 60 : 255,
      'middle',
      xs[i],
      i % 2 ? 150 - r : 150 + r,
    ]);
    return plate(880, 300, drawing, labels, '#0b1d3a', '#f8fafc'); // étiquettes claires sur fond nuit
  };
  const solar = (lang) => {
    const F = lang === 'fr';
    const t = (a, b) => (F ? a : b);
    return [
      occ(
        solarPlate(lang),
        t('Les planètes du système solaire, dans l’ordre', 'The planets of the solar system, in order'),
        t(
          'Moyen mnémotechnique : « Me Voici Toute Mignonne, Je Suis Une Nébuleuse ».',
          'Mnemonic: “My Very Educated Mother Just Served Us Noodles”.',
        ),
        [t('planètes', 'planets')],
      ),
      ...[
        ['Planète la plus proche du Soleil', 'Planet closest to the Sun', 'Mercure', 'Mercury'],
        ['Plus grosse planète du système solaire', 'Largest planet in the solar system', 'Jupiter', 'Jupiter'],
        [
          'Planète la plus chaude (effet de serre)',
          'Hottest planet (greenhouse effect)',
          'Vénus',
          'Venus',
          'Ce n’est pas la plus proche du Soleil',
          'It is not the closest to the Sun',
        ],
        ['Surnommée « la planète rouge »', 'Nicknamed “the red planet”', 'Mars', 'Mars'],
        ['Planète aux anneaux les plus visibles', 'Planet with the most visible rings', 'Saturne', 'Saturn'],
        [
          'Planète qui tourne « couchée » sur le côté',
          'Planet that spins lying on its side',
          'Uranus',
          'Uranus',
          'Axe incliné d’environ 98°',
          'Axis tilted by about 98°',
        ],
        ['Nombre de planètes du système solaire', 'Number of planets in the solar system', '8', '8'],
        ['Statut de Pluton depuis 2006', 'Status of Pluto since 2006', 'Planète naine', 'Dwarf planet'],
        [
          'Distance moyenne Terre–Soleil',
          'Average Earth–Sun distance',
          'Environ 150 millions de km (1 unité astronomique)',
          'About 150 million km (1 astronomical unit)',
        ],
        [
          'Temps mis par la lumière du Soleil pour atteindre la Terre',
          'Time for sunlight to reach the Earth',
          'Environ 8 minutes 20 secondes',
          'About 8 minutes 20 seconds',
        ],
        [
          'Plus grand volcan connu du système solaire',
          'Largest known volcano in the solar system',
          'Olympus Mons, sur Mars',
          'Olympus Mons, on Mars',
        ],
        [
          'Les quatre lunes galiléennes de Jupiter',
          'The four Galilean moons of Jupiter',
          'Io, Europe, Ganymède, Callisto',
          'Io, Europa, Ganymede, Callisto',
        ],
      ].map(([qf, qe, af, ae, hf = '', he = '']) => ({
        term: t(qf, qe),
        definition: t(af, ae),
        hint: t(hf, he),
        tags: [t('astronomie', 'astronomy')],
      })),
    ];
  };
  add(
    { fr: 'systeme-solaire', en: 'solar-system' },
    {
      fields: {
        title: 'Le système solaire',
        description: 'Les huit planètes sur une planche à compléter, et quelques questions pour briller.',
        tags: ['astronomie'],
        color: '#1E3A8A',
        language: { term: 'fr', definition: 'fr' },
      },
      cards: solar('fr'),
    },
    {
      fields: {
        title: 'The solar system',
        description: 'The eight planets on a diagram to fill in, plus a few questions to impress.',
        tags: ['astronomy'],
        color: '#1E3A8A',
        language: { term: 'en', definition: 'en' },
      },
      cards: solar('en'),
    },
    {
      title: 'Le système solaire',
      description: 'Planche des planètes à compléter et questions d’astronomie.',
      features: ['Image masquée', 'Indices'],
    },
    {
      title: 'The solar system',
      description: 'A planets diagram to fill in and astronomy questions.',
      features: ['Image occlusion', 'Hints'],
    },
  );

  // ---------------------------------------------------------------- vocabulaire
  const vocab = (rows, cols, tags) =>
    rows.map((r) => ({
      term: r[cols[0]],
      definition: r[cols[1]],
      example: cols[2] !== undefined ? r[cols[2]] || '' : '',
      hint: cols[3] !== undefined ? r[cols[3]] || '' : '',
      tags,
    }));
  // [espagnol, français, anglais, exemple en espagnol]
  const SPANISH = [
    ['hola', 'bonjour, salut', 'hello', '¡Hola! ¿Qué tal?'],
    ['buenos días', 'bonjour (le matin)', 'good morning'],
    ['buenas noches', 'bonsoir, bonne nuit', 'good evening, good night'],
    ['por favor', 's’il vous plaît', 'please'],
    ['gracias', 'merci', 'thank you', 'Muchas gracias.'],
    ['de nada', 'de rien', 'you’re welcome'],
    ['perdón', 'pardon', 'sorry, excuse me'],
    ['¿Cuánto cuesta?', 'Combien ça coûte ?', 'How much is it?'],
    ['la cuenta, por favor', 'l’addition, s’il vous plaît', 'the bill, please'],
    ['¿Dónde está…?', 'Où est… ?', 'Where is…?', '¿Dónde está la estación?'],
    ['el baño', 'les toilettes', 'the toilet'],
    ['la estación', 'la gare', 'the station'],
    ['el aeropuerto', 'l’aéroport', 'the airport'],
    ['el billete', 'le billet', 'the ticket', 'Un billete de ida y vuelta.'],
    ['el tren', 'le train', 'the train'],
    ['la playa', 'la plage', 'the beach'],
    ['la habitación', 'la chambre', 'the room'],
    ['la llave', 'la clé', 'the key'],
    ['el desayuno', 'le petit-déjeuner', 'breakfast'],
    ['el agua', 'l’eau', 'water', 'Un agua sin gas, por favor.'],
    ['la cerveza', 'la bière', 'beer'],
    ['el vino tinto', 'le vin rouge', 'red wine'],
    ['la carne', 'la viande', 'meat'],
    ['el pescado', 'le poisson (à manger)', 'fish (food)'],
    ['la farmacia', 'la pharmacie', 'the pharmacy'],
    ['el médico', 'le médecin', 'the doctor'],
    ['la calle', 'la rue', 'the street'],
    ['a la derecha', 'à droite', 'on the right'],
    ['a la izquierda', 'à gauche', 'on the left'],
    ['todo recto', 'tout droit', 'straight ahead'],
    ['cerca', 'près', 'near'],
    ['lejos', 'loin', 'far'],
    ['hoy', 'aujourd’hui', 'today'],
    ['mañana', 'demain', 'tomorrow'],
    ['ayer', 'hier', 'yesterday'],
    ['abierto', 'ouvert', 'open'],
    ['cerrado', 'fermé', 'closed'],
    ['No entiendo.', 'Je ne comprends pas.', 'I don’t understand.'],
    ['¿Puede repetir, por favor?', 'Pouvez-vous répéter, s’il vous plaît ?', 'Could you repeat, please?'],
    ['Me llamo…', 'Je m’appelle…', 'My name is…', 'Me llamo Ana.'],
    ['una mesa para dos', 'une table pour deux', 'a table for two'],
    ['¿A qué hora…?', 'À quelle heure… ?', 'What time…?', '¿A qué hora sale el tren?'],
    ['¡Socorro!', 'Au secours !', 'Help!'],
  ];
  // [allemand, français, anglais, indice (genre)]
  const GERMAN = [
    ['Hallo', 'bonjour, salut', 'hello'],
    ['Guten Tag', 'bonjour', 'good day, hello'],
    ['Danke', 'merci', 'thank you'],
    ['Bitte', 's’il te plaît / je t’en prie', 'please / you’re welcome'],
    ['Entschuldigung', 'pardon, excusez-moi', 'sorry, excuse me'],
    ['Tschüss', 'salut (au revoir)', 'bye'],
    ['ja', 'oui', 'yes'],
    ['nein', 'non', 'no'],
    ['das Haus', 'la maison', 'the house', 'neutre (das)'],
    ['die Katze', 'le chat', 'the cat', 'féminin (die)'],
    ['der Hund', 'le chien', 'the dog', 'masculin (der)'],
    ['das Wasser', 'l’eau', 'water', 'neutre (das)'],
    ['das Brot', 'le pain', 'bread', 'neutre (das)'],
    ['der Apfel', 'la pomme', 'the apple', 'masculin (der)'],
    ['die Schule', 'l’école', 'the school', 'féminin (die)'],
    ['das Buch', 'le livre', 'the book', 'neutre (das)'],
    ['der Freund', 'l’ami', 'the friend (male)', 'masculin (der)'],
    ['die Freundin', 'l’amie', 'the friend (female)', 'féminin (die)'],
    ['die Familie', 'la famille', 'the family', 'féminin (die)'],
    ['die Mutter', 'la mère', 'the mother', 'féminin (die)'],
    ['der Vater', 'le père', 'the father', 'masculin (der)'],
    ['das Mädchen', 'la fille', 'the girl', 'neutre (das), malgré le sens'],
    ['essen', 'manger', 'to eat'],
    ['trinken', 'boire', 'to drink'],
    ['schlafen', 'dormir', 'to sleep'],
    ['gehen', 'aller (à pied)', 'to go, to walk'],
    ['sprechen', 'parler', 'to speak'],
    ['lesen', 'lire', 'to read'],
    ['groß', 'grand', 'big, tall'],
    ['klein', 'petit', 'small'],
    ['gut', 'bon, bien', 'good, well'],
    ['schön', 'beau', 'beautiful'],
    ['heute', 'aujourd’hui', 'today'],
    ['morgen', 'demain', 'tomorrow'],
  ];
  const GENDER_EN = {
    'neutre (das)': 'neuter (das)',
    'féminin (die)': 'feminine (die)',
    'masculin (der)': 'masculine (der)',
  };
  // [anglais, français, exemple, indice] : vocabulaire courant et faux amis
  const ENGLISH = [
    [
      'actually',
      'en fait, en réalité',
      'Actually, I’ve changed my mind.',
      'Faux ami : pas « actuellement » (currently)',
    ],
    ['eventually', 'finalement, à la longue', 'She eventually agreed.', 'Faux ami : pas « éventuellement » (possibly)'],
    ['library', 'la bibliothèque', 'I borrowed it from the library.', 'Faux ami : une librairie se dit « bookshop »'],
    ['bookshop', 'la librairie', 'There’s a nice bookshop downtown.'],
    ['sensible', 'raisonnable, sensé', 'That’s a sensible decision.', 'Faux ami : « sensible » se dit « sensitive »'],
    ['sensitive', 'sensible', 'My teeth are sensitive to cold.'],
    ['to attend', 'assister à', 'Did you attend the meeting?', 'Faux ami : « attendre » se dit « to wait »'],
    ['to borrow', 'emprunter', 'Can I borrow your pen?'],
    ['to lend', 'prêter', 'Could you lend me ten euros?'],
    ['to achieve', 'atteindre, réussir', 'He achieved his goal.'],
    ['to remind', 'rappeler (à quelqu’un)', 'Remind me to call her.'],
    ['to realise', 'se rendre compte', 'I didn’t realise it was so late.'],
    ['to wonder', 'se demander', 'I wonder why he left.'],
    ['to expect', 's’attendre à', 'I didn’t expect that.'],
    ['to look forward to', 'avoir hâte de', 'I look forward to seeing you.'],
    ['to earn', 'gagner (de l’argent)', 'She earns a good salary.', '« gagner » un match : to win'],
    ['to improve', 'améliorer', 'Practice will improve your accent.'],
    ['to avoid', 'éviter', 'Avoid the rush hour.'],
    ['to share', 'partager', 'Let’s share the bill.'],
    ['to hire', 'embaucher ; louer', 'We hired a car for the week.'],
    ['to fail', 'échouer', 'He failed his driving test.'],
    ['although', 'bien que', 'Although it was raining, we went out.'],
    ['however', 'cependant', 'However, there is a problem.'],
    ['whereas', 'alors que (opposition)', 'He likes tea, whereas I prefer coffee.'],
    ['nowadays', 'de nos jours', 'Nowadays everyone has a phone.'],
    ['enough', 'assez', 'Is there enough bread?'],
    ['likely', 'probable', 'It’s likely to rain.'],
    ['the weather', 'le temps (météo)', 'The weather is lovely today.'],
    ['a bargain', 'une bonne affaire', 'This jacket was a bargain.'],
    ['a receipt', 'un reçu, un ticket de caisse', 'Keep the receipt.'],
    ['a fee', 'des frais, un tarif', 'There’s a small booking fee.'],
    ['a deadline', 'une date limite', 'The deadline is Friday.'],
    ['a meeting', 'une réunion', 'The meeting starts at nine.'],
    ['a skill', 'une compétence', 'Languages are a useful skill.'],
    ['a purpose', 'un but', 'What’s the purpose of this visit?'],
    ['to be in charge of', 'être responsable de', 'Who is in charge of the project?'],
  ];
  // [français, anglais, exemple en français]
  const FRENCH = [
    ['bonjour', 'hello, good morning', 'Bonjour, madame !'],
    ['bonsoir', 'good evening'],
    ['s’il vous plaît', 'please'],
    ['merci', 'thank you', 'Merci beaucoup.'],
    ['de rien', 'you’re welcome'],
    ['excusez-moi', 'excuse me'],
    ['Combien ça coûte ?', 'How much is it?'],
    ['l’addition, s’il vous plaît', 'the bill, please'],
    ['Où est… ?', 'Where is…?', 'Où est la gare ?'],
    ['les toilettes', 'the toilet'],
    ['la gare', 'the (train) station'],
    ['l’aéroport', 'the airport'],
    ['le billet', 'the ticket', 'Un billet aller-retour, s’il vous plaît.'],
    ['la boulangerie', 'the bakery', 'Une baguette, s’il vous plaît.'],
    ['le pain', 'bread'],
    ['une carafe d’eau', 'a jug of tap water', 'Une carafe d’eau, s’il vous plaît.'],
    ['le petit-déjeuner', 'breakfast'],
    ['la chambre', 'the (bed)room'],
    ['la clé', 'the key'],
    ['la plage', 'the beach'],
    ['la pharmacie', 'the pharmacy'],
    ['le médecin', 'the doctor'],
    ['la rue', 'the street'],
    ['à droite', 'on the right'],
    ['à gauche', 'on the left'],
    ['tout droit', 'straight ahead'],
    ['près', 'near'],
    ['loin', 'far'],
    ['aujourd’hui', 'today'],
    ['demain', 'tomorrow'],
    ['hier', 'yesterday'],
    ['ouvert', 'open'],
    ['fermé', 'closed'],
    ['Je ne comprends pas.', 'I don’t understand.'],
    ['Pouvez-vous répéter ?', 'Could you repeat?'],
    ['Je m’appelle…', 'My name is…', 'Je m’appelle Paul.'],
    ['une table pour deux', 'a table for two'],
    ['À quelle heure… ?', 'What time…?', 'À quelle heure part le train ?'],
    ['Au secours !', 'Help!'],
  ];
  add(
    { fr: 'espagnol-de-voyage', en: 'spanish-for-travellers' },
    {
      fields: {
        title: 'Espagnol de voyage',
        description: 'Les mots et phrases utiles pour voyager : saluer, commander, demander son chemin.',
        tags: ['langues', 'espagnol'],
        color: '#DC2626',
        language: { term: 'es', definition: 'fr' },
      },
      cards: vocab(SPANISH, [0, 1, 3], ['espagnol']),
    },
    {
      fields: {
        title: 'Spanish for travellers',
        description: 'Useful words and phrases for a trip: greeting, ordering, asking the way.',
        tags: ['languages', 'spanish'],
        color: '#DC2626',
        language: { term: 'es', definition: 'en' },
      },
      cards: vocab(SPANISH, [0, 2, 3], ['spanish']),
    },
    {
      title: 'Espagnol de voyage',
      description: 'Mots et phrases utiles, avec exemples.',
      features: ['Lecture à voix haute', 'Exemples', 'Écrire'],
    },
    {
      title: 'Spanish for travellers',
      description: 'Useful words and phrases, with examples.',
      features: ['Read aloud', 'Examples', 'Write'],
    },
  );
  add(
    { fr: 'anglais-faux-amis', en: 'french-for-travellers' },
    {
      fields: {
        title: 'Anglais : vocabulaire courant et faux amis',
        description: 'Des mots du quotidien, et les faux amis qui piègent les francophones (actually, eventually…).',
        tags: ['langues', 'anglais'],
        color: '#0EA5E9',
        language: { term: 'en', definition: 'fr' },
      },
      cards: vocab(ENGLISH, [0, 1, 2, 3], ['anglais']),
    },
    {
      fields: {
        title: 'French for travellers',
        description: 'Useful words and phrases for a trip to France: greeting, ordering, asking the way.',
        tags: ['languages', 'french'],
        color: '#0EA5E9',
        language: { term: 'fr', definition: 'en' },
      },
      cards: vocab(FRENCH, [0, 1, 2], ['french']),
    },
    {
      title: 'Anglais : vocabulaire courant et faux amis',
      description: 'Mots du quotidien, exemples en contexte, faux amis signalés.',
      features: ['Indices', 'Exemples', 'Lecture à voix haute'],
    },
    {
      title: 'French for travellers',
      description: 'Useful words and phrases, with examples.',
      features: ['Read aloud', 'Examples', 'Write'],
    },
  );
  add(
    { fr: 'allemand-premiers-mots', en: 'german-first-words' },
    {
      fields: {
        title: 'Allemand : premiers mots',
        description: 'Les premiers mots à connaître, avec le genre des noms en indice (der, die, das).',
        tags: ['langues', 'allemand'],
        color: '#CA8A04',
        language: { term: 'de', definition: 'fr' },
      },
      cards: vocab(GERMAN, [0, 1, undefined, 3], ['allemand']),
    },
    {
      fields: {
        title: 'German first words',
        description: 'The first words to know, with the gender of nouns as a hint (der, die, das).',
        tags: ['languages', 'german'],
        color: '#CA8A04',
        language: { term: 'de', definition: 'en' },
      },
      cards: vocab(
        GERMAN.map((r) => [r[0], r[1], r[2], r[3] && (GENDER_EN[r[3]] || 'neuter (das), despite the meaning')]),
        [0, 2, undefined, 3],
        ['german'],
      ),
    },
    {
      title: 'Allemand : premiers mots',
      description: 'Premiers mots, genre des noms en indice.',
      features: ['Indices', 'Lecture à voix haute', 'Apprendre'],
    },
    {
      title: 'German first words',
      description: 'First words, noun gender as a hint.',
      features: ['Hints', 'Read aloud', 'Learn'],
    },
  );

  // ---------------------------------------------------------------- grandes dates (textes à trous)
  const HISTORY = [
    [
      'En {{c1::52 av. J.-C.}}, Vercingétorix se rend à Jules César après le siège d’{{c2::Alésia}}.',
      'In {{c1::52 BC}}, Vercingetorix surrendered to Julius Caesar after the siege of {{c2::Alesia}}.',
    ],
    [
      '{{c1::Charlemagne}} est couronné empereur à Rome en {{c2::800}}.',
      '{{c1::Charlemagne}} was crowned emperor in Rome in {{c2::800}}.',
    ],
    [
      'La bataille d’{{c1::Hastings}}, en {{c2::1066}}, ouvre la conquête normande de l’Angleterre.',
      'The Battle of {{c1::Hastings}}, in {{c2::1066}}, began the Norman conquest of England.',
    ],
    [
      '{{c1::Jeanne d’Arc}} fait lever le siège d’Orléans en {{c2::1429}}.',
      '{{c1::Joan of Arc}} lifted the siege of Orléans in {{c2::1429}}.',
    ],
    [
      'Vers {{c1::1450}}, {{c2::Gutenberg}} met au point l’imprimerie à caractères mobiles.',
      'Around {{c1::1450}}, {{c2::Gutenberg}} developed printing with movable type.',
    ],
    [
      '{{c1::Christophe Colomb}} atteint l’Amérique en {{c2::1492}}.',
      '{{c1::Christopher Columbus}} reached the Americas in {{c2::1492}}.',
    ],
    [
      'En {{c1::1517}}, {{c2::Luther}} publie ses 95 thèses : c’est le début de la Réforme.',
      'In {{c1::1517}}, {{c2::Luther}} published his 95 Theses, starting the Reformation.',
    ],
    [
      'L’édit de {{c1::Nantes}}, en {{c2::1598}}, accorde la liberté de culte aux protestants.',
      'The Edict of {{c1::Nantes}}, in {{c2::1598}}, granted freedom of worship to Protestants in France.',
    ],
    [
      'La Déclaration d’indépendance des États-Unis est adoptée en {{c1::1776}}.',
      'The United States Declaration of Independence was adopted in {{c1::1776}}.',
    ],
    [
      'La prise de la Bastille a lieu le {{c1::14 juillet 1789}}.',
      'The storming of the Bastille took place on {{c1::14 July 1789}}.',
    ],
    [
      'Napoléon Bonaparte est sacré empereur en {{c1::1804}}.',
      'Napoleon Bonaparte was crowned emperor in {{c1::1804}}.',
    ],
    [
      'La bataille de {{c1::Waterloo}}, en {{c2::1815}}, met fin au règne de Napoléon.',
      'The Battle of {{c1::Waterloo}}, in {{c2::1815}}, ended Napoleon’s rule.',
    ],
    [
      'L’esclavage est définitivement aboli dans les colonies françaises en {{c1::1848}}.',
      'Slavery was definitively abolished in the French colonies in {{c1::1848}}.',
    ],
    [
      'La Première Guerre mondiale dure de {{c1::1914}} à {{c2::1918}}.',
      'The First World War lasted from {{c1::1914}} to {{c2::1918}}.',
    ],
    [
      'L’armistice de la Première Guerre mondiale est signé le {{c1::11 novembre 1918}}.',
      'The armistice ending the First World War was signed on {{c1::11 November 1918}}.',
    ],
    [
      'La révolution d’{{c1::Octobre}} porte les bolcheviks au pouvoir en Russie en {{c2::1917}}.',
      'The {{c1::October}} Revolution brought the Bolsheviks to power in Russia in {{c2::1917}}.',
    ],
    [
      'La Seconde Guerre mondiale dure de {{c1::1939}} à {{c2::1945}}.',
      'The Second World War lasted from {{c1::1939}} to {{c2::1945}}.',
    ],
    [
      'Le débarquement de Normandie a lieu le {{c1::6 juin 1944}}.',
      'The Normandy landings took place on {{c1::6 June 1944}}.',
    ],
    [
      'Les Françaises votent pour la première fois en {{c1::1945}}.',
      'Women in France voted for the first time in {{c1::1945}}.',
    ],
    [
      'Le traité de {{c1::Rome}}, en {{c2::1957}}, fonde la Communauté économique européenne.',
      'The Treaty of {{c1::Rome}}, in {{c2::1957}}, founded the European Economic Community.',
    ],
    [
      'En {{c1::1969}}, {{c2::Neil Armstrong}} est le premier homme à marcher sur la Lune.',
      'In {{c1::1969}}, {{c2::Neil Armstrong}} became the first person to walk on the Moon.',
    ],
    ['Le mur de Berlin tombe le {{c1::9 novembre 1989}}.', 'The Berlin Wall fell on {{c1::9 November 1989}}.'],
    [
      'Les pièces et billets en euros sont mis en circulation le {{c1::1er janvier 2002}}.',
      'Euro coins and banknotes went into circulation on {{c1::1 January 2002}}.',
    ],
  ];
  const history = (i, tag) => HISTORY.map((r) => ({ type: 'cloze', term: r[i], definition: '', tags: [tag] }));
  add(
    { fr: 'grandes-dates', en: 'key-dates' },
    {
      fields: {
        title: 'Grandes dates de l’histoire',
        description: 'Des événements clés, à compléter : chaque trou devient une carte d’étude.',
        tags: ['histoire'],
        color: '#7C3AED',
        language: { term: 'fr', definition: 'fr' },
      },
      cards: history(0, 'histoire'),
    },
    {
      fields: {
        title: 'Key dates in history',
        description: 'Key events to complete: each blank becomes a study card.',
        tags: ['history'],
        color: '#7C3AED',
        language: { term: 'en', definition: 'en' },
      },
      cards: history(1, 'history'),
    },
    {
      title: 'Grandes dates de l’histoire',
      description: 'Phrases à trous, de l’Antiquité à l’euro.',
      features: ['Textes à trous', 'Plusieurs trous par carte'],
    },
    {
      title: 'Key dates in history',
      description: 'Sentences with blanks, from antiquity to the euro.',
      features: ['Cloze', 'Several blanks per card'],
    },
  );

  // ---------------------------------------------------------------- tables de multiplication
  const TIMES = [];
  for (let a = 2; a <= 9; a++) for (let b = a; b <= 9; b++) TIMES.push([a, b]);
  const times = (tag) => TIMES.map(([a, b]) => ({ term: `${a} × ${b}`, definition: String(a * b), tags: [tag] }));
  const TIMES_STYLE = { bg: '#FFF3A3', backBg: '#CFF1DC', font: 'sans', size: 'xl', align: 'center', paper: 'grid' };
  add(
    { fr: 'tables-de-multiplication', en: 'times-tables' },
    {
      fields: {
        title: 'Tables de multiplication (2 à 9)',
        description: 'Toutes les tables de 2 à 9, sur des fiches colorées. À réviser en mode Écrire !',
        tags: ['maths', 'enfants'],
        color: '#F59E0B',
        style: TIMES_STYLE,
      },
      cards: times('tables'),
    },
    {
      fields: {
        title: 'Times tables (2 to 9)',
        description: 'All the tables from 2 to 9, on colourful cards. Try them in Write mode!',
        tags: ['maths', 'kids'],
        color: '#F59E0B',
        style: TIMES_STYLE,
      },
      cards: times('times-tables'),
    },
    {
      title: 'Tables de multiplication (2 à 9)',
      description: 'Toutes les tables sur des fiches colorées, pour les enfants.',
      features: ['Apparence du jeu', 'Écrire', 'Gravité'],
    },
    {
      title: 'Times tables (2 to 9)',
      description: 'All the tables on colourful cards, for kids.',
      features: ['Set appearance', 'Write', 'Gravity'],
    },
  );

  // ---------------------------------------------------------------- éléments chimiques
  // [Z, symbole, français, anglais, origine du symbole fr, en]
  const ELEMENTS = [
    [1, 'H', 'Hydrogène', 'Hydrogen'],
    [2, 'He', 'Hélium', 'Helium'],
    [3, 'Li', 'Lithium', 'Lithium'],
    [4, 'Be', 'Béryllium', 'Beryllium'],
    [5, 'B', 'Bore', 'Boron'],
    [6, 'C', 'Carbone', 'Carbon'],
    [7, 'N', 'Azote', 'Nitrogen', 'N comme « nitrogène », ancien nom de l’azote', 'N for nitrogen'],
    [8, 'O', 'Oxygène', 'Oxygen'],
    [9, 'F', 'Fluor', 'Fluorine'],
    [10, 'Ne', 'Néon', 'Neon'],
    [11, 'Na', 'Sodium', 'Sodium', 'Na, du latin natrium', 'Na, from the Latin natrium'],
    [12, 'Mg', 'Magnésium', 'Magnesium'],
    [13, 'Al', 'Aluminium', 'Aluminium'],
    [14, 'Si', 'Silicium', 'Silicon'],
    [15, 'P', 'Phosphore', 'Phosphorus'],
    [16, 'S', 'Soufre', 'Sulfur'],
    [17, 'Cl', 'Chlore', 'Chlorine'],
    [18, 'Ar', 'Argon', 'Argon'],
    [19, 'K', 'Potassium', 'Potassium', 'K, du latin kalium', 'K, from the Latin kalium'],
    [20, 'Ca', 'Calcium', 'Calcium'],
    [21, 'Sc', 'Scandium', 'Scandium'],
    [22, 'Ti', 'Titane', 'Titanium'],
    [23, 'V', 'Vanadium', 'Vanadium'],
    [24, 'Cr', 'Chrome', 'Chromium'],
    [25, 'Mn', 'Manganèse', 'Manganese'],
    [26, 'Fe', 'Fer', 'Iron', 'Fe, du latin ferrum', 'Fe, from the Latin ferrum'],
    [27, 'Co', 'Cobalt', 'Cobalt'],
    [28, 'Ni', 'Nickel', 'Nickel'],
    [29, 'Cu', 'Cuivre', 'Copper', 'Cu, du latin cuprum', 'Cu, from the Latin cuprum'],
    [30, 'Zn', 'Zinc', 'Zinc'],
  ];
  const elements = (lang) =>
    ELEMENTS.map(([z, sym, f, e, of = '', oe = '']) => ({
      term: sym,
      definition: lang === 'fr' ? f : e,
      hint: lang === 'fr' ? `Numéro atomique ${z}` : `Atomic number ${z}`,
      example: lang === 'fr' ? of : oe,
      tags: [lang === 'fr' ? 'chimie' : 'chemistry'],
    }));
  add(
    { fr: 'elements-chimiques', en: 'chemical-elements' },
    {
      fields: {
        title: 'Éléments chimiques (1 à 30)',
        description: 'Le symbole et le nom des 30 premiers éléments du tableau périodique.',
        tags: ['sciences', 'chimie'],
        color: '#059669',
        language: { term: 'fr', definition: 'fr' },
      },
      cards: elements('fr'),
    },
    {
      fields: {
        title: 'Chemical elements (1 to 30)',
        description: 'Symbol and name of the first 30 elements of the periodic table.',
        tags: ['science', 'chemistry'],
        color: '#059669',
        language: { term: 'en', definition: 'en' },
      },
      cards: elements('en'),
    },
    {
      title: 'Éléments chimiques (1 à 30)',
      description: 'Symbole ↔ nom, numéro atomique en indice.',
      features: ['Apprendre', 'Test', 'Sens inverse'],
    },
    {
      title: 'Chemical elements (1 to 30)',
      description: 'Symbol ↔ name, atomic number as a hint.',
      features: ['Learn', 'Test', 'Reverse direction'],
    },
  );

  // ---------------------------------------------------------------- formules de maths et de physique
  // [nom fr, nom en, formule, indice fr, indice en] ; formules en caractères Unicode (×, ², √, π, Δ…)
  const FORMULAS = [
    ['Théorème de Pythagore (hypoténuse c)', 'Pythagorean theorem (hypotenuse c)', 'a² + b² = c²'],
    ['Aire d’un disque de rayon r', 'Area of a disc of radius r', 'A = π r²'],
    ['Périmètre d’un cercle de rayon r', 'Circumference of a circle of radius r', 'P = 2 π r'],
    ['Volume d’une boule de rayon r', 'Volume of a ball of radius r', 'V = 4/3 π r³'],
    ['Identité remarquable (a + b)²', 'Square of a sum (a + b)²', 'a² + 2ab + b²'],
    ['Identité remarquable (a − b)²', 'Square of a difference (a − b)²', 'a² − 2ab + b²'],
    ['Identité remarquable (a + b)(a − b)', 'Difference of squares (a + b)(a − b)', 'a² − b²'],
    ['Discriminant de ax² + bx + c', 'Discriminant of ax² + bx + c', 'Δ = b² − 4ac'],
    ['Solutions de ax² + bx + c = 0 quand Δ > 0', 'Solutions of ax² + bx + c = 0 when Δ > 0', 'x = (−b ± √Δ) / 2a'],
    ['Dérivée de xⁿ', 'Derivative of xⁿ', 'n xⁿ⁻¹'],
    ['Dérivée de eˣ', 'Derivative of eˣ', 'eˣ'],
    ['Dérivée de ln x', 'Derivative of ln x', '1/x'],
    ['Dérivée de sin x', 'Derivative of sin x', 'cos x'],
    ['Dérivée de cos x', 'Derivative of cos x', '−sin x'],
    ['Primitive de xⁿ (n ≠ −1)', 'Antiderivative of xⁿ (n ≠ −1)', 'xⁿ⁺¹ / (n + 1) + C'],
    ['ln(ab)', 'ln(ab)', 'ln a + ln b'],
    ['cos² x + sin² x', 'cos² x + sin² x', '1'],
    ['Identité d’Euler', 'Euler’s identity', 'e^(iπ) + 1 = 0'],
    ['Somme 1 + 2 + … + n', 'Sum 1 + 2 + … + n', 'n (n + 1) / 2'],
    [
      'Deuxième loi de Newton',
      'Newton’s second law',
      'ΣF = m a',
      'F en newtons (N), a en m/s²',
      'F in newtons (N), a in m/s²',
    ],
    ['Poids d’un objet', 'Weight of an object', 'P = m g', 'g ≈ 9,81 N/kg sur Terre', 'g ≈ 9.81 N/kg on Earth'],
    ['Énergie cinétique', 'Kinetic energy', 'Ec = ½ m v²', 'en joules (J)', 'in joules (J)'],
    ['Énergie potentielle de pesanteur', 'Gravitational potential energy', 'Ep = m g h'],
    ['Équivalence masse-énergie', 'Mass–energy equivalence', 'E = m c²'],
    ['Loi d’Ohm', 'Ohm’s law', 'U = R I', 'U en volts, R en ohms, I en ampères', 'U in volts, R in ohms, I in amperes'],
    ['Puissance électrique', 'Electric power', 'P = U I'],
    ['Vitesse moyenne', 'Average speed', 'v = d / t'],
    ['Loi des gaz parfaits', 'Ideal gas law', 'P V = n R T', 'R ≈ 8,314 J/(mol·K)', 'R ≈ 8.314 J/(mol·K)'],
    ['Longueur d’onde', 'Wavelength', 'λ = v / f'],
    ['Réfraction (Snell-Descartes)', 'Refraction (Snell’s law)', 'n₁ sin i₁ = n₂ sin i₂'],
    ['Gravitation universelle', 'Universal gravitation', 'F = G m₁ m₂ / d²'],
    ['Énergie d’un photon', 'Energy of a photon', 'E = h ν', 'h : constante de Planck', 'h: Planck constant'],
    ['Masse volumique', 'Density', 'ρ = m / V'],
    ['Pression', 'Pressure', 'p = F / S'],
    ['Vitesse de la lumière dans le vide', 'Speed of light in vacuum', 'c ≈ 3,00 × 10⁸ m/s'],
  ];
  const formulas = (lang) =>
    FORMULAS.map(([f, e, formula, hf = '', he = ''], i) => ({
      term: lang === 'fr' ? f : e,
      definition: lang === 'fr' ? formula : formula.replace('3,00', '3.00'),
      hint: lang === 'fr' ? hf : he,
      tags: [i < 19 ? (lang === 'fr' ? 'maths' : 'maths') : lang === 'fr' ? 'physique' : 'physics'],
    }));
  const FORMULA_STYLE = { font: 'serif', paper: 'grid' };
  add(
    { fr: 'formules-maths-physique', en: 'maths-physics-formulas' },
    {
      fields: {
        title: 'Formules de maths et de physique',
        description: 'Les formules incontournables du lycée : géométrie, algèbre, dérivées, mécanique, électricité.',
        tags: ['sciences', 'maths', 'physique'],
        color: '#4F46E5',
        style: FORMULA_STYLE,
        language: { term: 'fr', definition: 'fr' },
      },
      cards: formulas('fr'),
    },
    {
      fields: {
        title: 'Maths and physics formulas',
        description: 'The essential high-school formulas: geometry, algebra, derivatives, mechanics, electricity.',
        tags: ['science', 'maths', 'physics'],
        color: '#4F46E5',
        style: FORMULA_STYLE,
        language: { term: 'en', definition: 'en' },
      },
      cards: formulas('en'),
    },
    {
      title: 'Formules de maths et de physique',
      description: 'Formules incontournables, unités en indice.',
      features: ['Indices', 'Police du jeu', 'Test'],
    },
    {
      title: 'Maths and physics formulas',
      description: 'Essential formulas, units as hints.',
      features: ['Hints', 'Set font', 'Test'],
    },
  );

  // ---------------------------------------------------------------- anatomie (planches)
  const anatomy = anatomyCards({ plate, occ });
  add(
    { fr: 'anatomie', en: 'anatomy' },
    {
      fields: {
        title: 'Anatomie : premières planches',
        description:
          'Trois planches simples à légender (cœur, squelette, œil) et des questions de base. Schémas simplifiés, pas à l’échelle.',
        tags: ['médecine', 'anatomie'],
        color: '#E11D48',
        language: { term: 'fr', definition: 'fr' },
      },
      cards: anatomy('fr'),
    },
    {
      fields: {
        title: 'Anatomy: first diagrams',
        description:
          'Three simple diagrams to label (heart, skeleton, eye) and basic questions. Simplified, not to scale.',
        tags: ['medicine', 'anatomy'],
        color: '#E11D48',
        language: { term: 'en', definition: 'en' },
      },
      cards: anatomy('en'),
    },
    {
      title: 'Anatomie : premières planches',
      description: 'Cœur, squelette et œil à légender, pour les études de santé.',
      features: ['Image masquée', 'Planches', 'Indices'],
    },
    {
      title: 'Anatomy: first diagrams',
      description: 'Heart, skeleton and eye to label, for health students.',
      features: ['Image occlusion', 'Diagrams', 'Hints'],
    },
  );

  return { fr, en };
}

// ------------------------------------------------------------------ planches d'anatomie (schémas simplifiés)

function anatomyCards({ plate, occ }) {
  // Cœur, vue de face : la droite du patient est à gauche de l'image. Sang pauvre en oxygène en bleu.
  const heart = (L) => {
    const drawing = [
      // veines caves (bleu), tronc pulmonaire, aorte
      `<rect x="196" y="40" width="30" height="150" rx="10" fill="#60a5fa"/>`,
      `<rect x="150" y="250" width="30" height="170" rx="10" fill="#60a5fa"/>`,
      `<path d="M285 300 L300 120 L250 95" fill="none" stroke="#2563eb" stroke-width="26" stroke-linejoin="round"/>`,
      `<path d="M335 290 L335 110 Q335 60 385 60 Q435 60 440 110 L445 180" fill="none" stroke="#dc2626" stroke-width="30"/>`,
      // veines pulmonaires (sang oxygéné)
      `<path d="M430 185 L515 170 M430 225 L515 238" stroke="#f87171" stroke-width="15" stroke-linecap="round"/>`,
      // oreillettes et ventricules
      `<ellipse cx="225" cy="215" rx="72" ry="62" fill="#93c5fd" stroke="#1e3a8a" stroke-width="2"/>`,
      `<ellipse cx="375" cy="205" rx="68" ry="56" fill="#fca5a5" stroke="#7f1d1d" stroke-width="2"/>`,
      `<path d="M170 275 Q175 400 300 470 L305 275 Z" fill="#3b82f6" stroke="#1e3a8a" stroke-width="2"/>`,
      `<path d="M305 275 L300 470 Q430 430 440 260 Z" fill="#ef4444" stroke="#7f1d1d" stroke-width="2"/>`,
      // valves
      `<path d="M200 275 L250 275" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>`,
      `<path d="M350 262 L400 262" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>`,
    ].join('');
    const N = {
      fr: [
        'Veine cave supérieure',
        'Tronc pulmonaire',
        'Oreillette droite',
        'Valve tricuspide',
        'Ventricule droit',
        'Veine cave inférieure',
        'Aorte',
        'Veines pulmonaires',
        'Oreillette gauche',
        'Valve mitrale',
        'Ventricule gauche',
      ],
      en: [
        'Superior vena cava',
        'Pulmonary trunk',
        'Right atrium',
        'Tricuspid valve',
        'Right ventricle',
        'Inferior vena cava',
        'Aorta',
        'Pulmonary veins',
        'Left atrium',
        'Mitral valve',
        'Left ventricle',
      ],
    }[L];
    return plate(640, 520, drawing, [
      [N[0], 15, 50, 'start', 205, 60],
      [N[1], 15, 125, 'start', 262, 102],
      [N[2], 15, 205, 'start', 178, 215],
      [N[3], 15, 290, 'start', 220, 276],
      [N[4], 15, 380, 'start', 235, 385],
      [N[5], 15, 470, 'start', 165, 410],
      [N[6], 625, 50, 'end', 412, 62],
      [N[7], 625, 140, 'end', 505, 172],
      [N[8], 625, 225, 'end', 410, 210],
      [N[9], 625, 310, 'end', 380, 263],
      [N[10], 625, 400, 'end', 380, 380],
    ]);
  };

  // Squelette, vue de face, en position anatomique (paumes vers l'avant).
  const skeleton = (L) => {
    const bone = (x1, y1, x2, y2, w) =>
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#e7e1d3" stroke-width="${w}" stroke-linecap="round"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#78716c" stroke-width="${w}" stroke-linecap="round" opacity="0.15"/>`;
    let ribs = '';
    for (let i = 0; i < 7; i++) {
      const y = 185 + i * 17;
      ribs += `<path d="M300 ${y} Q ${232 - i * 2} ${y - 6} ${238 - i} ${y + 34}" fill="none" stroke="#d6cfc0" stroke-width="5"/>`;
      ribs += `<path d="M300 ${y} Q ${368 + i * 2} ${y - 6} ${362 + i} ${y + 34}" fill="none" stroke="#d6cfc0" stroke-width="5"/>`;
    }
    let spine = '';
    for (let y = 150; y < 420; y += 13)
      spine += `<rect x="292" y="${y}" width="16" height="10" rx="3" fill="#d6cfc0"/>`;
    const drawing = [
      `<ellipse cx="300" cy="75" rx="44" ry="52" fill="#e7e1d3" stroke="#a8a29e" stroke-width="2"/>`,
      `<path d="M268 118 Q300 150 332 118" fill="none" stroke="#d6cfc0" stroke-width="9" stroke-linecap="round"/>`,
      spine,
      ribs,
      `<rect x="292" y="178" width="16" height="92" rx="6" fill="#e7e1d3" stroke="#a8a29e" stroke-width="1.5"/>`,
      bone(296, 168, 215, 160, 9),
      bone(304, 168, 385, 160, 9),
      // bras droit du patient (à gauche) : radius latéral (côté pouce), ulna médial
      bone(210, 168, 190, 320, 15),
      bone(186, 330, 166, 465, 8),
      bone(198, 330, 190, 467, 8),
      `<ellipse cx="178" cy="495" rx="16" ry="24" fill="#e7e1d3"/>`,
      // bras gauche (à droite)
      bone(390, 168, 410, 320, 15),
      bone(414, 330, 434, 465, 8),
      bone(402, 330, 410, 467, 8),
      `<ellipse cx="422" cy="495" rx="16" ry="24" fill="#e7e1d3"/>`,
      `<path d="M228 420 Q300 380 372 420 Q365 470 300 478 Q235 470 228 420 Z" fill="#e7e1d3" stroke="#a8a29e" stroke-width="2"/>`,
      // jambes : fémur, rotule, tibia (médial), fibula (latérale)
      bone(262, 470, 252, 640, 17),
      bone(338, 470, 348, 640, 17),
      `<circle cx="252" cy="652" r="11" fill="#e7e1d3" stroke="#a8a29e"/><circle cx="348" cy="652" r="11" fill="#e7e1d3" stroke="#a8a29e"/>`,
      bone(258, 670, 260, 820, 12),
      bone(238, 675, 240, 815, 6),
      bone(342, 670, 340, 820, 12),
      bone(362, 675, 360, 815, 6),
      `<ellipse cx="252" cy="842" rx="24" ry="12" fill="#e7e1d3"/><ellipse cx="348" cy="842" rx="24" ry="12" fill="#e7e1d3"/>`,
    ].join('');
    const N = {
      fr: [
        'Crâne',
        'Clavicule',
        'Humérus',
        'Radius',
        'Fémur',
        'Fibula',
        'Mandibule',
        'Sternum',
        'Côtes',
        'Colonne vertébrale',
        'Ulna',
        'Bassin',
        'Rotule (patella)',
        'Tibia',
      ],
      en: [
        'Skull',
        'Clavicle',
        'Humerus',
        'Radius',
        'Femur',
        'Fibula',
        'Mandible',
        'Sternum',
        'Ribs',
        'Vertebral column',
        'Ulna',
        'Pelvis',
        'Patella (kneecap)',
        'Tibia',
      ],
    }[L];
    return plate(600, 870, drawing, [
      [N[0], 15, 60, 'start', 258, 60],
      [N[1], 15, 150, 'start', 240, 163],
      [N[2], 15, 255, 'start', 199, 250],
      [N[3], 15, 400, 'start', 175, 400],
      [N[4], 15, 560, 'start', 257, 560],
      [N[5], 15, 740, 'start', 239, 740],
      [N[6], 585, 50, 'end', 325, 128],
      [N[7], 585, 120, 'end', 304, 210],
      [N[8], 585, 190, 'end', 362, 240],
      [N[9], 585, 330, 'end', 307, 330],
      [N[10], 585, 400, 'end', 406, 400],
      [N[11], 585, 470, 'end', 360, 440],
      [N[12], 585, 620, 'end', 358, 652],
      [N[13], 585, 790, 'end', 341, 760],
    ]);
  };

  // Œil, coupe horizontale : cornée à gauche, nerf optique à droite.
  const eye = (L) => {
    const cx = 330;
    const cy = 230;
    const arc = (r, a0, a1) => {
      const p = (a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
      const [x0, y0] = p(a0);
      const [x1, y1] = p(a1);
      return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 1 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    };
    const drawing = [
      `<rect x="455" y="205" width="110" height="50" rx="8" fill="#fcd34d" stroke="#b45309" stroke-width="2"/>`,
      `<circle cx="${cx}" cy="${cy}" r="150" fill="#eef6ff"/>`,
      `<path d="${arc(150, -140, 140)}" fill="none" stroke="#94a3b8" stroke-width="9"/>`,
      `<path d="${arc(140, -135, 135)}" fill="none" stroke="#b45309" stroke-width="6"/>`,
      `<path d="${arc(132, -128, 128)}" fill="none" stroke="#f97316" stroke-width="5"/>`,
      `<path d="M215 134 Q130 230 215 326" fill="#e0f2fe" fill-opacity="0.6" stroke="#38bdf8" stroke-width="6"/>`,
      `<path d="M222 150 L222 205 M222 255 L222 310" stroke="#7c3aed" stroke-width="9" stroke-linecap="round"/>`,
      `<ellipse cx="248" cy="230" rx="20" ry="52" fill="#fde68a" stroke="#ca8a04" stroke-width="2"/>`,
    ].join('');
    const N = {
      fr: ['Cornée', 'Pupille', 'Iris', 'Cristallin', 'Sclère', 'Choroïde', 'Rétine', 'Nerf optique', 'Corps vitré'],
      en: ['Cornea', 'Pupil', 'Iris', 'Lens', 'Sclera', 'Choroid', 'Retina', 'Optic nerve', 'Vitreous body'],
    }[L];
    return plate(640, 470, drawing, [
      [N[0], 15, 120, 'start', 168, 190],
      [N[1], 15, 236, 'start', 222, 230],
      [N[2], 15, 350, 'start', 222, 290],
      [N[3], 250, 40, 'middle', 248, 180],
      [N[4], 625, 60, 'end', 425, 115],
      [N[5], 625, 120, 'end', 440, 140],
      [N[6], 625, 180, 'end', 455, 185],
      [N[7], 625, 300, 'end', 520, 255],
      [N[8], 330, 440, 'middle', 330, 290],
    ]);
  };

  const Q = [
    ['Os le plus long du corps humain', 'Longest bone in the human body', 'Le fémur', 'The femur'],
    ['Nombre d’os chez l’adulte', 'Number of bones in an adult', '206', '206'],
    [
      'Plus petit os du corps humain',
      'Smallest bone in the human body',
      'L’étrier (oreille moyenne)',
      'The stapes (middle ear)',
    ],
    [
      'Valve entre l’oreillette gauche et le ventricule gauche',
      'Valve between the left atrium and the left ventricle',
      'La valve mitrale',
      'The mitral valve',
    ],
    [
      'Valve entre l’oreillette droite et le ventricule droit',
      'Valve between the right atrium and the right ventricle',
      'La valve tricuspide',
      'The tricuspid valve',
    ],
    [
      'Cavité du cœur qui éjecte le sang dans l’aorte',
      'Heart chamber that pumps blood into the aorta',
      'Le ventricule gauche',
      'The left ventricle',
    ],
    [
      'Vaisseaux qui ramènent le sang oxygéné des poumons au cœur',
      'Vessels that bring oxygenated blood from the lungs to the heart',
      'Les veines pulmonaires',
      'The pulmonary veins',
      'Des veines… qui transportent du sang riche en oxygène',
      'Veins… that carry oxygen-rich blood',
    ],
    [
      'Couche de l’œil qui contient les photorécepteurs',
      'Layer of the eye that contains the photoreceptors',
      'La rétine',
      'The retina',
    ],
    [
      'Photorécepteurs de la vision des couleurs',
      'Photoreceptors for colour vision',
      'Les cônes',
      'The cones',
      'Les bâtonnets servent à la vision de nuit',
      'Rods are used for night vision',
    ],
    ['Nombre de paires de nerfs crâniens', 'Number of pairs of cranial nerves', '12', '12'],
    [
      'Vertèbres non soudées de la colonne',
      'Unfused vertebrae of the spine',
      '24 : 7 cervicales, 12 thoraciques, 5 lombaires',
      '24: 7 cervical, 12 thoracic, 5 lumbar',
    ],
    ['Principal muscle de la respiration', 'Main muscle of breathing', 'Le diaphragme', 'The diaphragm'],
    [
      'Os de l’avant-bras du côté du pouce',
      'Forearm bone on the thumb side',
      'Le radius',
      'The radius',
      'L’autre est l’ulna (ancien nom : cubitus)',
      'The other one is the ulna',
    ],
    [
      'Os externe de la jambe, le plus fin',
      'Thinner bone on the outer side of the lower leg',
      'La fibula',
      'The fibula',
      'Ancien nom : péroné',
      'The thicker one is the tibia',
    ],
  ];

  return (L) => {
    const F = L === 'fr';
    const t = (a, b) => (F ? a : b);
    const tag = t('anatomie', 'anatomy');
    return [
      occ(
        heart(L),
        t('Le cœur (vue de face)', 'The heart (front view)'),
        t(
          'La droite du patient est à gauche de l’image. En bleu, le sang pauvre en oxygène ; en rouge, le sang oxygéné.',
          'The patient’s right is on the left of the image. Blue: oxygen-poor blood; red: oxygenated blood.',
        ),
        [tag, t('cœur', 'heart')],
      ),
      occ(
        skeleton(L),
        t('Le squelette (vue de face)', 'The skeleton (front view)'),
        t(
          'Position anatomique : paumes vers l’avant. Le radius est du côté du pouce, la fibula du côté externe de la jambe.',
          'Anatomical position: palms facing forward. The radius is on the thumb side, the fibula on the outer side of the leg.',
        ),
        [tag, t('squelette', 'skeleton')],
      ),
      occ(
        eye(L),
        t('L’œil (coupe horizontale)', 'The eye (horizontal section)'),
        t(
          'De l’avant vers l’arrière : cornée, iris et pupille, cristallin, corps vitré, puis rétine, choroïde et sclère.',
          'From front to back: cornea, iris and pupil, lens, vitreous body, then retina, choroid and sclera.',
        ),
        [tag, t('œil', 'eye')],
      ),
      ...Q.map(([qf, qe, af, ae, hf = '', he = '']) => ({
        term: t(qf, qe),
        definition: t(af, ae),
        hint: t(hf, he),
        tags: [tag],
      })),
    ];
  };
}
