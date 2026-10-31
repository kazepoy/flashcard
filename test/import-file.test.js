import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { parseImportFile, parsePastedText } from '../src/io/import-file.js';
import { exportMarkdown } from '../src/io/markdown.js';
import { exportBundle } from '../src/io/bundle.js';
import { newSet, newCard } from '../src/core/format.js';

const enc = (s) => new TextEncoder().encode(s);

test('import : TSV / CSV / TXT (Quizlet) / Markdown / JSON', async () => {
  const a = await parseImportFile({ name: 'vocab.tsv', bytes: enc('chat\tcat\nchien\tdog\n') });
  assert.equal(a.sets[0].title, 'vocab');
  assert.equal(a.sets[0].cards.length, 2);
  const b = await parseImportFile({ name: 'x.csv', bytes: enc('﻿term;definition\na;b\nc;d') });
  assert.equal(b.sets[0].cards.length, 2);
  const c = await parseImportFile({ name: 'quizlet export.txt', bytes: enc('un\tone\ndeux\ttwo') });
  assert.equal(c.sets[0].title, 'quizlet export');
  const s = newSet({ title: 'MD', cards: [newCard({ term: 'q', definition: 'a' })] });
  const d = await parseImportFile({ name: 'a.md', bytes: enc(exportMarkdown(s)) });
  assert.equal(d.sets[0].title, 'MD');
  const e = await parseImportFile({ name: 'a.json', bytes: enc(JSON.stringify(s)) });
  assert.equal(e.sets[0].cards[0].term, 'q');
  await assert.rejects(parseImportFile({ name: 'a.json', bytes: enc('{"format":"x"}') }));
  await assert.rejects(parseImportFile({ name: 'vide.txt', bytes: enc('   ') }), /Aucune carte/);
  await assert.rejects(parseImportFile({ name: 'a.exe', bytes: enc('x') }), /Format non pris en charge/);
});

test('import : .apkg, archive Flashcard dans un .zip, zip inconnu', async () => {
  const apkg = readFileSync(new URL('./fixtures/anki-modern.apkg', import.meta.url));
  const r = await parseImportFile({ name: 'deck.apkg', bytes: new Uint8Array(apkg) });
  assert.equal(r.kind, 'anki');
  assert.equal(r.sets[0].cards.length, 3);
  const s = newSet({ title: 'Z', cards: [newCard({ term: 'a', definition: 'b' })] });
  const bundle = await exportBundle({ sets: [s] });
  const m = await parseImportFile({ name: 'z.flashcard.zip', bytes: bundle });
  assert.equal(m.kind, 'flashcard');
  assert.equal(m.sets[0].id, s.id);
  const bad = new JSZip();
  bad.file('x.txt', 'x');
  await assert.rejects(
    parseImportFile({ name: 'x.zip', bytes: await bad.generateAsync({ type: 'uint8array' }) }),
    /non reconnue/,
  );
});

test('texte collé : séparateurs personnalisés', () => {
  const r = parsePastedText('chat = cat ;; chien = dog', { delimiter: ' = ', rowDelimiter: ';;', title: 'T' });
  assert.equal(r.sets[0].cards.length, 2);
  assert.equal(parsePastedText('', {}).sets.length, 0);
});
