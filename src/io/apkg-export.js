// Export Anki .apkg (schéma historique « collection.anki2 », importable par toutes les versions d'Anki).
import JSZip from 'jszip';
import { loadSql } from './sql.js';
import { groupAnswer, groupsOf, masksToAnki } from '../core/occlusion.js';

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
import { mdToHtml, parseCloze, stripMarkdown } from '../core/text.js';

const DDL = `
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, type integer not null, oid integer not null);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_revlog_cid on revlog (cid);
CREATE INDEX ix_notes_csum on notes (csum);
`;

const CSS =
  '.card{font-family:arial;font-size:20px;text-align:center;color:black;background-color:white}.cloze{font-weight:bold;color:blue}';
export const BASIC_MID = 1700000000001;
export const CLOZE_MID = 1700000000002;
export const OCCLUSION_MID = 1700000000003;

// Gabarits du type de note « Image Occlusion » d'Anki (rslib/src/image_occlusion/notetype.rs) ;
// le dessin des masques est assuré par le lecteur d'Anki (anki.imageOcclusion.setup).
const IO_QFMT = `{{#Header}}<div>{{Header}}</div>{{/Header}}
<div style="display: none">{{cloze:Occlusion}}</div>
<div id="err"></div>
<div id="image-occlusion-container">
    {{Image}}
    <canvas id="image-occlusion-canvas"></canvas>
</div>
<script>
try {
    anki.imageOcclusion.setup();
} catch (exc) {
    document.getElementById("err").innerHTML = \`Erreur de chargement de l'image masquée<br><br>\${exc}\`;
}
</script>
`;
const IO_AFMT = `${IO_QFMT}
<div><button id="toggle">Afficher / cacher les masques</button></div>
{{#Back Extra}}<div>{{Back Extra}}</div>{{/Back Extra}}
`;
const IO_CSS =
  '#image-occlusion-canvas{--inactive-shape-color:#ffeba2;--active-shape-color:#ff8e8e;--inactive-shape-border:1px #212121 solid;--active-shape-border:1px #212121 solid;--highlight-shape-color:#ff8e8e00;--highlight-shape-border:1px #ff8e8e solid}.card{font-family:arial;font-size:20px;text-align:center;color:black;background-color:white}';

const fld = (name, ord, extra = {}) => ({
  name,
  ord,
  sticky: false,
  rtl: false,
  font: 'Arial',
  size: 20,
  media: [],
  ...extra,
});

function models(now) {
  const base = {
    css: CSS,
    latexPre: '',
    latexPost: '',
    latexsvg: false,
    mod: Math.floor(now / 1000),
    usn: -1,
    sortf: 0,
    did: 1,
    tags: [],
    vers: [],
  };
  return {
    [BASIC_MID]: {
      ...base,
      id: BASIC_MID,
      name: 'Flashcard Basic',
      type: 0,
      flds: [fld('Front', 0), fld('Back', 1), fld('Hint', 2), fld('Example', 3)],
      tmpls: [
        {
          name: 'Card 1',
          ord: 0,
          qfmt: '{{Front}}{{#Hint}}<br><small>{{Hint}}</small>{{/Hint}}',
          afmt: '{{FrontSide}}<hr id=answer>{{Back}}{{#Example}}<br><small>{{Example}}</small>{{/Example}}',
          bqfmt: '',
          bafmt: '',
          did: null,
          bfont: '',
          bsize: 0,
        },
      ],
      req: [[0, 'any', [0]]],
    },
    [CLOZE_MID]: {
      ...base,
      id: CLOZE_MID,
      name: 'Flashcard Cloze',
      type: 1,
      flds: [fld('Text', 0), fld('Back Extra', 1)],
      tmpls: [
        {
          name: 'Cloze',
          ord: 0,
          qfmt: '{{cloze:Text}}',
          afmt: '{{cloze:Text}}<br>{{Back Extra}}',
          bqfmt: '',
          bafmt: '',
          did: null,
          bfont: '',
          bsize: 0,
        },
      ],
      req: [[0, 'all', [0]]],
    },
    [OCCLUSION_MID]: {
      ...base,
      css: IO_CSS,
      id: OCCLUSION_MID,
      name: 'Image Occlusion (Flashcard)',
      type: 1,
      originalStockKind: 6, // ORIGINAL_STOCK_KIND_IMAGE_OCCLUSION : éditable dans l'éditeur d'Anki
      flds: [
        fld('Occlusion', 0, { tag: 0, preventDeletion: true }),
        fld('Image', 1, { tag: 1, preventDeletion: true }),
        fld('Header', 2, { tag: 2, preventDeletion: true }),
        fld('Back Extra', 3, { tag: 3, preventDeletion: true }),
        fld('Comments', 4, { tag: 4 }),
      ],
      tmpls: [
        {
          name: 'Image Occlusion',
          ord: 0,
          qfmt: IO_QFMT,
          afmt: IO_AFMT,
          bqfmt: '',
          bafmt: '',
          did: null,
          bfont: '',
          bsize: 0,
        },
      ],
      req: [[0, 'all', [0]]],
    },
  };
}

function deckObj(id, name, now) {
  return {
    id,
    mod: Math.floor(now / 1000),
    name,
    usn: -1,
    lrnToday: [0, 0],
    revToday: [0, 0],
    newToday: [0, 0],
    timeToday: [0, 0],
    collapsed: false,
    browserCollapsed: false,
    desc: '',
    dyn: 0,
    conf: 1,
    extendNew: 0,
    extendRev: 0,
  };
}

const DCONF = {
  1: {
    id: 1,
    mod: 0,
    name: 'Default',
    usn: 0,
    maxTaken: 60,
    autoplay: true,
    timer: 0,
    replayq: true,
    dyn: false,
    new: { bury: false, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 7], order: 1, perDay: 20 },
    rev: { bury: false, ease4: 1.3, ivlFct: 1, maxIvl: 36500, perDay: 200, hardFactor: 1.2 },
    lapse: { delays: [10], leechAction: 1, leechFails: 8, minInt: 1, mult: 0 },
  },
};

async function sha1First32(s) {
  const buf = await globalThis.crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  const hex = [...new Uint8Array(buf)]
    .slice(0, 4)
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
  return parseInt(hex, 16);
}

/**
 * @param {Array} sets jeux Flashcard
 * @param {{getMedia:(path:string)=>Promise<Uint8Array|null>}} o
 * @returns {Promise<Uint8Array>}
 */
export async function exportApkg(sets, { getMedia = async () => null, suspended = new Set() } = {}) {
  const SQL = await loadSql();
  const db = new SQL.Database();
  db.run(DDL);
  const now = Date.now();
  let seq = now;
  const nextId = () => ++seq;

  const media = new Map(); // chemin Flashcard → nom de fichier Anki
  const mediaName = (p) => {
    if (!media.has(p)) media.set(p, p.replace(/^media\//, ''));
    return media.get(p);
  };
  const toHtml = (md) => mdToHtml(md || '', (p) => (p.startsWith('media/') ? mediaName(p) : p));

  const decks = { 1: deckObj(1, 'Default', now) };
  const insNote = db.prepare('INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const insCard = db.prepare('INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  let due = 1;

  for (const set of sets) {
    const did = nextId();
    const safeTitle = (set.title || 'Sans titre').replaceAll('::', ' - ');
    const path = set.folder ? set.folder.split('/').filter(Boolean).concat(safeTitle).join('::') : safeTitle;
    decks[did] = deckObj(did, path, now);
    for (const c of set.cards) {
      const nid = nextId();
      const tags = c.tags.length ? ' ' + c.tags.map((t) => t.replace(/\s+/g, '_')).join(' ') + ' ' : '';
      let fields;
      let mid;
      let ords;
      if (c.type === 'occlusion') {
        if (!c.image || !c.masks?.length) continue;
        mid = OCCLUSION_MID;
        // Anki n'a pas de réponse écrite par masque : les étiquettes vont dans « Comments »
        const labels = groupsOf(c.masks)
          .map((n) => [n, groupAnswer(c.masks, n)])
          .filter(([, l]) => l);
        fields = [
          masksToAnki(c.masks, c.occlusion || 'all'),
          `<img src="${mediaName(c.image)}">`,
          toHtml(c.term),
          toHtml(c.definition),
          labels.map(([n, l]) => `${n} : ${escHtml(l)}`).join('<br>'),
        ];
        ords = groupsOf(c.masks).map((n) => n - 1);
      } else if (c.type === 'cloze') {
        mid = CLOZE_MID;
        const extra = toHtml(c.definition) + (c.image ? `<br><img src="${mediaName(c.image)}">` : '');
        fields = [toHtml(c.term), extra];
        ords = parseCloze(c.term).map((x) => x.n - 1);
        if (!ords.length) continue;
      } else if (c.type === 'basic') {
        mid = BASIC_MID;
        const front =
          toHtml(c.term) +
          (c.termImage ? `<br><img src="${mediaName(c.termImage)}">` : '') +
          (c.audio ? `[sound:${mediaName(c.audio)}]` : '');
        const back = toHtml(c.definition) + (c.image ? `<br><img src="${mediaName(c.image)}">` : '');
        fields = [front, back, toHtml(c.hint), toHtml(c.example)];
        ords = [0];
      } else continue; // type inconnu
      const sfld = stripMarkdown(fields[0].replace(/<[^>]+>/g, ' '));
      insNote.run([
        nid,
        c.id,
        mid,
        Math.floor(now / 1000),
        -1,
        tags,
        fields.join('\x1f'),
        sfld,
        await sha1First32(sfld),
        0,
        '',
      ]);
      for (const ord of ords) {
        // file -1 : carte suspendue
        const queue = suspended.has(c.id) ? -1 : 0;
        insCard.run([nextId(), nid, did, ord, Math.floor(now / 1000), -1, 0, queue, due++, 0, 0, 0, 0, 0, 0, 0, 0, '']);
      }
    }
  }
  insNote.free();
  insCard.free();

  const conf = {
    nextPos: due,
    estTimers: true,
    activeDecks: [1],
    sortType: 'noteFld',
    timeLim: 0,
    sortBackwards: false,
    addToCur: true,
    curDeck: 1,
    newBury: true,
    newSpread: 0,
    dueCounts: true,
    curModel: String(BASIC_MID),
    collapseTime: 1200,
  };
  db.run('INSERT INTO col VALUES (1,?,?,?,11,0,0,0,?,?,?,?,?)', [
    Math.floor(now / 1000 / 86400) * 86400,
    now,
    now,
    JSON.stringify(conf),
    JSON.stringify(models(now)),
    JSON.stringify(decks),
    JSON.stringify(DCONF),
    '{}',
  ]);
  const dbBytes = db.export();
  db.close();

  const zip = new JSZip();
  zip.file('collection.anki2', dbBytes);
  const mediaJson = {};
  let i = 0;
  for (const [path, name] of media) {
    const bytes = await getMedia(path);
    if (!bytes) continue;
    zip.file(String(i), bytes);
    mediaJson[i] = name;
    i++;
  }
  zip.file('media', JSON.stringify(mediaJson));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
