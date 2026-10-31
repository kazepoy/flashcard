import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { parseDelimited, rowsToCards, exportDelimited, exportQuizletText, detectDelimiter } from '../src/io/csv.js';
import { parseMarkdown, markdownToSet, exportMarkdown } from '../src/io/markdown.js';
import { exportApkg } from '../src/io/apkg-export.js';
import { importApkg, parseMediaEntries } from '../src/io/apkg-import.js';
import { exportBundle, importBundle } from '../src/io/bundle.js';
import { htmlToMd } from '../src/io/html.js';
import { newSet, newCard, newProgress } from '../src/core/format.js';
import { sha256Hex } from '../src/core/ids.js';

const sample = () =>
  newSet({
    title: 'Espagnol',
    folder: 'Langues',
    description: 'Unité 3',
    language: { term: 'es', definition: 'fr' },
    tags: ['espagnol', 'A2'],
    cards: [
      newCard({
        term: 'la mesa',
        definition: 'la table',
        hint: 'meuble',
        example: 'La mesa es grande.',
        tags: ['noms'],
      }),
      newCard({ term: 'comer', definition: 'manger\nboire "un verre"', tags: [] }),
      newCard({
        type: 'cloze',
        term: "La capitale de la France est {{c1::Paris::ville}} et de l'Italie {{c2::Rome}}.",
        definition: 'Europe',
      }),
    ],
  });

test('détection du séparateur et analyse CSV (guillemets, multi-lignes)', () => {
  assert.equal(detectDelimiter('a\tb\nc\td'), '\t');
  assert.equal(detectDelimiter('a;b\nc;d'), ';');
  assert.equal(detectDelimiter('a,b\nc,d'), ',');
  const rows = parseDelimited('term,definition\n"un, deux","trois ""quatre"""\n"ligne1\nligne2",x\n');
  assert.deepEqual(rows, [
    ['term', 'definition'],
    ['un, deux', 'trois "quatre"'],
    ['ligne1\nligne2', 'x'],
  ]);
});

test('texte Quizlet : tab + saut de ligne, séparateurs personnalisés', () => {
  const rows = parseDelimited('chat\tcat\nchien\tdog\n');
  assert.deepEqual(rows, [
    ['chat', 'cat'],
    ['chien', 'dog'],
  ]);
  const rows2 = parseDelimited('chat - cat;;chien - dog', { delimiter: ' - ', rowDelimiter: ';;' });
  assert.deepEqual(rows2, [
    ['chat', 'cat'],
    ['chien', 'dog'],
  ]);
  const cards = rowsToCards(rows);
  assert.equal(cards.length, 2);
  assert.equal(cards[1].definition, 'dog');
});

test('CSV : en-tête reconnu, aller-retour sans perte', () => {
  const s = sample();
  const csv = exportDelimited(s);
  const back = rowsToCards(parseDelimited(csv));
  assert.equal(back.length, 3);
  assert.equal(back[0].hint, 'meuble');
  assert.equal(back[0].example, 'La mesa es grande.');
  assert.deepEqual(back[0].tags, ['noms']);
  assert.equal(back[1].definition, 'manger\nboire "un verre"');
  assert.equal(back[2].type, 'cloze');
  assert.equal(back[2].term, s.cards[2].term);
  // en-tête français
  const fr = rowsToCards(parseDelimited('Terme;Définition\nchat;cat'));
  assert.equal(fr[0].term, 'chat');
});

test('export texte Quizlet : cloze développé, une ligne par carte', () => {
  const t = exportQuizletText(sample());
  const lines = t.split('\n');
  assert.equal(lines.length, 4); // 2 basic + 2 trous
  assert.equal(lines[0], 'la mesa\tla table');
  assert.match(lines[2], /^La capitale de la France est \[ville\] et de l'Italie Rome\.\tParis$/);
  assert.ok(!lines[1].includes('\n'));
});

test('Markdown : aller-retour', () => {
  const s = sample();
  const md = exportMarkdown(s);
  assert.match(md, /^---\ntitle: Espagnol/);
  const back = markdownToSet(md);
  assert.equal(back.title, 'Espagnol');
  assert.equal(back.folder, 'Langues');
  assert.deepEqual(back.tags, ['espagnol', 'A2']);
  assert.equal(back.language.term, 'es');
  assert.equal(back.cards.length, 3);
  assert.equal(back.cards[0].term, 'la mesa');
  assert.equal(back.cards[0].definition, 'la table');
  assert.equal(back.cards[0].hint, 'meuble');
  assert.equal(back.cards[2].type, 'cloze');
  assert.equal(back.cards[2].definition, 'Europe');
  assert.equal(back.cards[1].definition, 'manger\nboire "un verre"');
});

test('Markdown : formats tolérés (liste ::, titres, cloze brut)', () => {
  const { cards } = parseMarkdown(
    'chat :: cat\nchien :: dog\n\n---\n\n# Bonjour\nHello\nIndice: salut\n\n---\n\nLa Terre tourne autour du {{c1::Soleil}}.',
  );
  assert.equal(cards.length, 4);
  assert.equal(cards[2].hint, 'salut');
  assert.equal(cards[3].type, 'cloze');
  // « --- » seul au début n'est pas un front-matter si le contenu n'a pas la forme clé: valeur
  const r = parseMarkdown('---\n# Un\nDeux\n---\n# Trois\nQuatre');
  assert.equal(r.cards.length, 2);
});

test('html → markdown', () => {
  const r = htmlToMd('<div>Un <b>mot</b><br>et&nbsp;un <i>autre</i></div><img src="a.png">[sound:s.mp3]');
  assert.equal(r.text, 'Un **mot**\net un *autre*\n![](a.png)');
  assert.deepEqual(r.images, ['a.png']);
  assert.deepEqual(r.sounds, ['s.mp3']);
});

test('protobuf des médias (format moderne)', () => {
  const enc = (s) => new TextEncoder().encode(s);
  const entry = (name) => {
    const n = enc(name);
    return Uint8Array.from([0x0a, n.length, ...n, 0x10, 3, 0x1a, 2, 1, 2]);
  };
  const e1 = entry('a.png');
  const e2 = entry('b.mp3');
  const buf = Uint8Array.from([0x0a, e1.length, ...e1, 0x0a, e2.length, ...e2]);
  assert.deepEqual(parseMediaEntries(buf), ['a.png', 'b.mp3']);
});

test('Anki .apkg : export puis import (contenu, cloze, médias, dossiers)', async () => {
  const s = sample();
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  const mp3 = Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0, 1, 2, 3]);
  const ip = `media/${await sha256Hex(png)}.png`;
  const ap = `media/${await sha256Hex(mp3)}.mp3`;
  s.cards[0].image = ip;
  s.cards[0].audio = ap;
  s.cards[1].definition = `manger ![schéma](${ip})`;
  const files = { [ip]: png, [ap]: mp3 };
  const bytes = await exportApkg([s], { getMedia: async (p) => files[p] || null });
  const zip = await JSZip.loadAsync(bytes);
  assert.ok(zip.file('collection.anki2') && zip.file('media'));
  const mediaMap = JSON.parse(await zip.file('media').async('string'));
  assert.deepEqual(Object.values(mediaMap).sort(), [ip, ap].map((p) => p.replace('media/', '')).sort());

  const back = await importApkg(bytes);
  assert.equal(back.sets.length, 1);
  const b = back.sets[0];
  assert.equal(b.title, 'Espagnol');
  assert.equal(b.folder, 'Langues');
  assert.equal(b.cards.length, 3);
  const [c0, c1, c2] = b.cards;
  assert.equal(c0.id, s.cards[0].id); // l'identifiant survit (guid)
  assert.equal(c0.term, 'la mesa');
  assert.equal(c0.definition, 'la table');
  assert.equal(c0.hint, 'meuble');
  assert.equal(c0.example, 'La mesa es grande.');
  assert.deepEqual(c0.tags, ['noms']);
  assert.equal(c0.image, ip); // même hash → même chemin
  assert.equal(c0.audio, ap);
  assert.ok(back.media.has(ip) && back.media.has(ap));
  assert.deepEqual([...back.media.get(ip)], [...png]);
  // image du verso : promue en image de carte, retirée du texte
  assert.equal(c1.definition, 'manger');
  assert.equal(c1.image, ip);
  assert.equal(c2.type, 'cloze');
  assert.equal(c2.term, s.cards[2].term);
  assert.equal(c2.definition, 'Europe');
});

test('Archive .flashcard.zip : aller-retour avec progression, journal et médias', async () => {
  const s = sample();
  const png = Uint8Array.from([137, 80, 78, 71, 1, 2, 3, 4]);
  const ip = `media/${await sha256Hex(png)}.png`;
  s.cards[0].image = ip;
  const prog = newProgress(s.id);
  prog.starred[s.cards[0].id] = true;
  const bytes = await exportBundle({
    sets: [s],
    progress: { [s.id]: prog },
    logs: { [s.id]: '{"t":"x"}\n' },
    getMedia: async (p) => (p === ip ? png : null),
  });
  const back = await importBundle(bytes);
  assert.equal(back.sets.length, 1);
  assert.equal(back.sets[0].cards.length, 3);
  assert.equal(back.progress[s.id].starred[s.cards[0].id], true);
  assert.equal(back.logs[s.id], '{"t":"x"}\n');
  assert.deepEqual([...back.media.get(ip)], [...png]);
});

test('Archive : fichiers hors format ignorés, version future refusée', async () => {
  const zip = new JSZip();
  zip.file('flashcard.json', JSON.stringify({ format: 'flashcard', version: 1 }));
  zip.file('../evil.json', '{}');
  zip.file('sets/../../x.json', '{}');
  zip.file('media/not-a-hash.png', 'x');
  const back = await importBundle(await zip.generateAsync({ type: 'uint8array' }));
  assert.equal(back.sets.length, 0);
  assert.equal(back.media.size, 0);
  const z2 = new JSZip();
  z2.file('flashcard.json', JSON.stringify({ format: 'flashcard', version: 9 }));
  await assert.rejects(importBundle(await z2.generateAsync({ type: 'uint8array' })));
  await assert.rejects(importBundle(await new JSZip().generateAsync({ type: 'uint8array' })));
});

test('Anki .apkg moderne (anki21b zstd + médias protobuf), généré par Anki 26.9', async () => {
  const { readFileSync } = await import('node:fs');
  const back = await importApkg(readFileSync(new URL('./fixtures/anki-modern.apkg', import.meta.url)));
  assert.equal(back.sets.length, 1);
  const s = back.sets[0];
  assert.equal(s.title, 'Europe');
  assert.equal(s.folder, 'Géo');
  assert.equal(s.cards.length, 3);
  const byTerm = Object.fromEntries(s.cards.map((c) => [c.term.slice(0, 6), c]));
  assert.equal(byTerm['France'].term, 'France **gras**');
  assert.equal(byTerm['France'].definition, 'Paris');
  assert.match(byTerm['France'].image, /^media\/[0-9a-f]{64}\.png$/);
  assert.deepEqual(byTerm['France'].tags, ['villes']);
  assert.equal(byTerm['La cap'].type, 'cloze');
  assert.equal(byTerm['La cap'].definition, 'extra');
  assert.match(byTerm['son'].audio, /\.mp3$/);
  assert.equal(byTerm['son'].definition, 'audio x');
  assert.equal(back.media.size, 2);
  assert.deepEqual(back.warnings, []);
});

test("Anki .apkg : image masquée (export au format Image Occlusion d'Anki, puis import)", async () => {
  const png = new Uint8Array(40);
  png.set([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x01, 0x90, 0, 0, 0x01,
    0x2c,
  ]);
  const ip = `media/${await sha256Hex(png)}.png`;
  const s = newSet({ title: 'Anatomie' });
  s.cards.push(
    newCard({
      type: 'occlusion',
      image: ip,
      term: 'Le **crâne**',
      definition: 'vue de face',
      occlusion: 'one',
      masks: [
        { n: 1, shape: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.1, label: 'frontal' },
        { n: 2, shape: 'ellipse', x: 0.5, y: 0.5, w: 0.2, h: 0.2 },
        { n: 2, shape: 'rect', x: 0.6, y: 0.1, w: 0.1, h: 0.1 },
      ],
    }),
  );
  const bytes = await exportApkg([s], { getMedia: async (p) => (p === ip ? png : null) });
  const SQL = await (await import('../src/io/sql.js')).loadSql();
  const zip = await JSZip.loadAsync(bytes);
  const db = new SQL.Database(await zip.file('collection.anki2').async('uint8array'));
  const models = JSON.parse(db.exec('SELECT models FROM col')[0].values[0][0]);
  const io = Object.values(models).find((m) => m.originalStockKind === 6);
  assert.ok(io, 'type de note Image Occlusion');
  assert.deepEqual(
    io.flds.map((f) => f.tag),
    [0, 1, 2, 3, 4],
  );
  const [flds] = db.exec('SELECT flds FROM notes')[0].values[0];
  const f = flds.split('\x1f');
  assert.match(f[0], /^\{\{c1::image-occlusion:rect:left=\.1:top=\.2:width=\.3:height=\.1\}\}/);
  assert.match(f[1], /^<img src="[0-9a-f]{64}\.png">$/);
  assert.equal(f[4], '1 : frontal');
  assert.deepEqual(db.exec('SELECT ord FROM cards ORDER BY ord')[0].values.flat(), [0, 1]);
  db.close();

  const back = await importApkg(bytes);
  const c = back.sets[0].cards[0];
  assert.equal(c.type, 'occlusion');
  assert.equal(c.image, ip);
  assert.equal(c.occlusion, 'one');
  assert.equal(c.term, 'Le **crâne**');
  assert.equal(c.definition, 'vue de face');
  assert.deepEqual(
    c.masks.map(({ label: _l, ...m }) => m),
    s.cards[0].masks.map(({ label: _l, ...m }) => m),
  );
});

test('Anki .apkg : cartes suspendues exportées (file -1) puis réimportées comme suspendues', async () => {
  const keep = newCard({ term: 'actif', definition: 'a' });
  const off = newCard({ term: 'suspendu', definition: 'b' });
  const s = newSet({ title: 'Suspensions', cards: [keep, off] });
  const back = await importApkg(await exportApkg([s], { suspended: new Set([off.id]) }));
  const set = back.sets[0];
  const p = back.progress[set.id];
  const byTerm = Object.fromEntries(set.cards.map((c) => [c.term, c.id]));
  assert.equal(p.suspended[byTerm.suspendu].s, true);
  assert.equal(p.suspended[byTerm.actif], undefined);
});
