// Import Anki .apkg / .colpkg : schéma historique (anki2, anki21) et moderne (anki21b, zstd).
import JSZip from 'jszip';
import { decompress as zstdDecompress } from 'fzstd';
import { loadSql } from './sql.js';
import { htmlToMd } from './html.js';
import { newCard, newProgress, newSet } from '../core/format.js';
import { setSuspended } from '../core/progress.js';
import { hasCloze } from '../core/text.js';
import { imageSize, masksFromAnki } from '../core/occlusion.js';
import { isId, sha256Hex, ulid } from '../core/ids.js';
import { AppError, warning } from '../core/errors.js';

const isZstd = (b) => b.length > 4 && b[0] === 0x28 && b[1] === 0xb5 && b[2] === 0x2f && b[3] === 0xfd;
const maybeDecompress = (b) => (isZstd(b) ? zstdDecompress(b) : b);

/**
 * Les bases Anki récentes déclarent la collation personnalisée « unicase », inconnue de sql.js
 * (« no such collation sequence »). On la remplace dans le schéma par « nocase » (même longueur
 * d'octets, donc la structure du fichier est inchangée). La base n'est lue qu'en lecture seule,
 * par clé primaire ou balayage complet : l'ordre des index secondaires n'a pas d'importance.
 */
export function patchUnicase(bytes) {
  const from = new TextEncoder().encode('COLLATE unicase');
  const to = new TextEncoder().encode('COLLATE nocase ');
  const out = bytes.slice();
  for (let i = 0; i <= out.length - from.length; i++) {
    if (out[i] !== 0x43) continue; // 'C'
    let ok = true;
    for (let j = 1; j < from.length; j++) {
      if (out[i + j] !== from[j]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      out.set(to, i);
      i += from.length - 1;
    }
  }
  return out;
}

function readVarint(buf, i) {
  let r = 0;
  let shift = 0;
  while (i < buf.length) {
    const b = buf[i++];
    r += (b & 0x7f) * 2 ** shift;
    if (!(b & 0x80)) break;
    shift += 7;
  }
  return [r, i];
}

/** Table des médias moderne (protobuf MediaEntries) → noms de fichiers dans l'ordre. */
export function parseMediaEntries(buf) {
  const names = [];
  let i = 0;
  while (i < buf.length) {
    let tag;
    [tag, i] = readVarint(buf, i);
    const wt = tag & 7;
    if (wt === 2) {
      let len;
      [len, i] = readVarint(buf, i);
      const sub = buf.subarray(i, i + len);
      i += len;
      if (tag >>> 3 === 1) names.push(entryName(sub));
    } else if (wt === 0) [, i] = readVarint(buf, i);
    else if (wt === 1) i += 8;
    else if (wt === 5) i += 4;
    else break;
  }
  return names;
}

function entryName(buf) {
  let i = 0;
  while (i < buf.length) {
    let tag;
    [tag, i] = readVarint(buf, i);
    const wt = tag & 7;
    if (wt === 2) {
      let len;
      [len, i] = readVarint(buf, i);
      const sub = buf.subarray(i, i + len);
      i += len;
      if (tag >>> 3 === 1) return new TextDecoder().decode(sub);
    } else if (wt === 0) [, i] = readVarint(buf, i);
    else if (wt === 1) i += 8;
    else if (wt === 5) i += 4;
    else break;
  }
  return '';
}

function all(db, sql, params = []) {
  const st = db.prepare(sql);
  st.bind(params);
  const rows = [];
  while (st.step()) rows.push(st.getAsObject());
  st.free();
  return rows;
}

const hasTable = (db, name) =>
  all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name=?", [name]).length > 0;

const MIME_EXT = /\.([a-z0-9]{2,5})$/i;

/**
 * @param {Uint8Array|ArrayBuffer} data
 * @returns {Promise<{sets:Array, media:Map<string,Uint8Array>, warnings:string[]}>}
 */
export async function importApkg(data) {
  const zip = await JSZip.loadAsync(data);
  const SQL = await loadSql();
  const warnings = [];

  let dbFile = zip.file('collection.anki21b');
  if (!dbFile) {
    dbFile = zip.file('collection.anki21') || zip.file('collection.anki2');
  }
  if (!dbFile) throw new AppError('ankiNoCollection', 'Fichier Anki invalide : aucune collection trouvée');
  const db = new SQL.Database(patchUnicase(maybeDecompress(await dbFile.async('uint8array'))));

  // --- types de notes, paquets
  const noteTypes = new Map(); // mid → {name, fields:[names]}
  const deckNames = new Map(); // did → nom
  if (hasTable(db, 'notetypes')) {
    for (const nt of all(db, 'SELECT id, name FROM notetypes')) noteTypes.set(nt.id, { name: nt.name, fields: [] });
    // Requête par clé primaire (ntid, ord) : sql.js ne connaît pas la collation « unicase »
    // des index secondaires d'Anki, un balayage global échouerait avec « no query solution ».
    for (const [id, nt] of noteTypes) {
      for (let ord = 0; ord < 64; ord++) {
        const r = all(db, 'SELECT name FROM fields WHERE ntid = ? AND ord = ?', [id, ord])[0];
        if (!r) break;
        nt.fields.push(r.name);
      }
    }
    for (const d of all(db, 'SELECT id, name FROM decks')) deckNames.set(d.id, String(d.name).replaceAll('\x1f', '::'));
  } else {
    const col = all(db, 'SELECT models, decks FROM col')[0];
    for (const [mid, m] of Object.entries(JSON.parse(col.models))) {
      noteTypes.set(Number(mid), { name: m.name, fields: m.flds.sort((a, b) => a.ord - b.ord).map((f) => f.name) });
    }
    for (const [did, d] of Object.entries(JSON.parse(col.decks))) deckNames.set(Number(did), d.name);
  }

  // --- médias
  const mediaIndex = new Map(); // nom de fichier → numéro dans le zip
  const mediaFile = zip.file('media');
  if (mediaFile) {
    const raw = maybeDecompress(await mediaFile.async('uint8array'));
    if (raw[0] === 0x7b) {
      for (const [k, v] of Object.entries(JSON.parse(new TextDecoder().decode(raw)))) mediaIndex.set(v, k);
    } else parseMediaEntries(raw).forEach((name, i) => mediaIndex.set(name, String(i)));
  }
  const media = new Map();
  const mediaCache = new Map(); // nom original → chemin Flashcard | null
  async function resolveMedia(name) {
    if (mediaCache.has(name)) return mediaCache.get(name);
    let out = null;
    const idx = mediaIndex.get(name);
    const f = idx !== undefined ? zip.file(idx) : null;
    if (f) {
      const bytes = maybeDecompress(await f.async('uint8array'));
      const ext = (name.match(MIME_EXT)?.[1] || 'bin').toLowerCase();
      out = `media/${await sha256Hex(bytes)}.${ext}`;
      media.set(out, bytes);
    } else if (!/^https?:/.test(name))
      warnings.push(warning('ankiMediaMissing', `Média introuvable : ${name}`, { name }));
    mediaCache.set(name, out);
    return out;
  }

  // --- notes → cartes, groupées par paquet
  const noteDeck = new Map();
  const noteActive = new Set(); // notes dont au moins une carte n'est pas suspendue (file -1)
  for (const c of all(db, 'SELECT nid, did, queue FROM cards ORDER BY id')) {
    if (!noteDeck.has(c.nid)) noteDeck.set(c.nid, c.did);
    if (c.queue !== -1) noteActive.add(c.nid);
  }
  const progress = {}; // setId → progression (cartes suspendues dans Anki)
  const bySet = new Map(); // did → set
  const lower = (a) => a.map((x) => String(x).toLowerCase().trim());
  const pick = (names, wanted) => names.findIndex((n) => wanted.includes(n));

  for (const n of all(db, 'SELECT id, guid, mid, tags, flds FROM notes ORDER BY id')) {
    const did = noteDeck.get(n.id);
    if (did === undefined) continue;
    const nt = noteTypes.get(n.mid) || { name: '', fields: [] };
    const values = String(n.flds).split('\x1f');
    const names = lower(nt.fields);
    const isCloze = /cloze|trou/i.test(nt.name) || hasCloze(values[0] || '');

    // conversion + extraction des médias de chaque champ
    const conv = [];
    for (const v of values) {
      const { text, images, sounds } = htmlToMd(v);
      let t = text;
      const imgs = [];
      for (const im of images) {
        const p = await resolveMedia(im);
        if (p) {
          t = t.replaceAll(`![](${im})`, `![](${p})`);
          imgs.push({ orig: im, path: p });
        } else t = t.replaceAll(`![](${im})`, '');
      }
      const snd = [];
      for (const s of sounds) {
        const p = await resolveMedia(s);
        if (p) snd.push(p);
      }
      conv.push({ text: t.trim(), imgs, snd });
    }

    let card;
    const occIdx = values.findIndex((v) => v.includes('image-occlusion:'));
    if (occIdx >= 0) {
      // Image Occlusion (Anki ≥ 23.10) : Occlusion, Image, En-tête, Verso supplémentaire, Commentaires
      const oi = Math.max(occIdx, pick(names, ['occlusion', 'occlusions']));
      let ii = pick(names, ['image']);
      if (ii < 0 || !conv[ii]?.imgs.length) ii = conv.findIndex((c, i) => i !== oi && c.imgs.length);
      const hi = pick(names, ['header', 'en-tête', 'en-tete', 'entête', 'titre']);
      const bi = pick(names, ['back extra', 'extra', 'verso supplémentaire', 'complément']);
      const image = ii >= 0 ? conv[ii].imgs[0].path : null;
      if (!image) {
        warnings.push(warning('ankiOcclusionNoImage', 'Image masquée sans image : note ignorée.'));
        continue;
      }
      const { masks, mode, skipped } = masksFromAnki(values[oi], imageSize(media.get(image)));
      if (skipped)
        warnings.push(
          warning(
            'ankiOcclusionShapes',
            `Image masquée : ${skipped} forme(s) non reprise(s) (texte ou format inconnu).`,
            { n: skipped },
          ),
        );
      card = newCard({
        type: 'occlusion',
        image,
        masks,
        occlusion: mode,
        term: hi >= 0 ? conv[hi]?.text || '' : '',
        definition: bi >= 0 ? conv[bi]?.text || '' : '',
      });
    } else if (isCloze) {
      const ti = Math.max(0, pick(names, ['text', 'texte']));
      const ei = pick(names, ['back extra', 'extra', 'complément', 'complement']);
      card = newCard({
        type: 'cloze',
        term: conv[ti]?.text || '',
        definition: ei >= 0 ? conv[ei]?.text || '' : conv[1]?.text || '',
      });
    } else {
      let ti = pick(names, ['front', 'recto', 'question', 'term', 'terme']);
      let di = pick(names, ['back', 'verso', 'answer', 'réponse', 'reponse', 'definition', 'définition']);
      if (ti < 0) ti = 0;
      if (di < 0 || di === ti) di = ti === 0 ? 1 : 0;
      const hi = pick(names, ['hint', 'indice']);
      const xi = pick(names, ['example', 'exemple']);
      card = newCard({
        term: conv[ti]?.text || '',
        definition: conv[di]?.text || '',
        hint: hi >= 0 ? conv[hi]?.text || '' : '',
        example: xi >= 0 ? conv[xi]?.text || '' : '',
      });
      // première image du verso → image de la carte ; premier son → audio
      const back = conv[di];
      if (back?.imgs.length) {
        card.image = back.imgs[0].path;
        card.definition = card.definition.replaceAll(`![](${back.imgs[0].path})`, '').trim();
      }
      const snd = conv.flatMap((c) => c.snd)[0];
      if (snd) card.audio = snd;
    }
    if (!card.term && !card.definition && card.type !== 'occlusion') continue;
    card.tags = String(n.tags || '')
      .split(/\s+/)
      .filter((t) => t && !['leech', 'marked'].includes(t.toLowerCase()));
    if (isId(n.guid)) card.id = n.guid;

    let set = bySet.get(did);
    if (!set) {
      const full = deckNames.get(did) || "Importé d'Anki";
      const parts = full.split('::');
      set = newSet({ title: parts.pop() || full, folder: parts.join('/'), cards: [] });
      bySet.set(did, set);
    }
    if (set.cards.some((c) => c.id === card.id)) card.id = ulid();
    set.cards.push(card);
    if (!noteActive.has(n.id)) {
      progress[set.id] ||= newProgress(set.id);
      setSuspended(progress[set.id], card.id, true);
    }
  }
  db.close();

  const sets = [...bySet.values()].filter((s) => s.cards.length);
  if (!sets.length) warnings.push(warning('ankiNoCards', 'Aucune carte trouvée dans ce fichier.'));
  return { sets, media, warnings, progress };
}
