import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCard, newProgress, newSet } from '../src/core/format.js';
import { ulid, ulidTime } from '../src/core/ids.js';
import { mergeProgress } from '../src/core/merge.js';
import {
  buildRows,
  cardHistory,
  parseQuery,
  rowSummary,
  search,
  setFlag,
  sortRows,
  tokenize,
} from '../src/core/search.js';
import { SrsState } from '../src/core/srs.js';

const NOW = new Date('2026-10-28T12:00:00Z');
const DAY = 86400000;

function fixture() {
  const es = newSet({ title: 'Espagnol — cuisine', folder: 'Langues/Espagnol', tags: ['espagnol'] });
  const mesa = newCard({ id: ulid(+NOW - 2 * DAY), term: 'la mesa', definition: 'la **table**', tags: ['meuble'] });
  const silla = newCard({
    id: ulid(+NOW - 40 * DAY),
    term: 'la silla',
    definition: 'la chaise',
    hint: "on s'assoit dessus",
  });
  const cafe = newCard({
    id: ulid(+NOW - 3 * DAY),
    term: 'el café',
    definition: 'le café',
    image: 'media/' + 'a'.repeat(64) + '.png',
  });
  es.cards.push(mesa, silla, cafe);
  const geo = newSet({ title: 'Capitales' });
  const cloze = newCard({
    id: ulid(+NOW - 5 * DAY),
    type: 'cloze',
    term: "La capitale de la France est {{c1::Paris}}, celle de l'Espagne {{c2::Madrid}}.",
  });
  const dupe = newCard({ id: ulid(+NOW - 6 * DAY), term: 'La Mesa', definition: 'ville de Californie' });
  geo.cards.push(cloze, dupe);

  const pe = newProgress(es.id);
  pe.items[mesa.id] = {
    srs: {
      due: new Date(+NOW - DAY).toISOString(),
      stability: 3,
      difficulty: 5,
      scheduled_days: 3,
      reps: 4,
      lapses: 2,
      state: SrsState.Review,
      last_review: new Date(+NOW - 4 * DAY).toISOString(),
    },
  };
  pe.items[silla.id] = {
    srs: {
      due: new Date(+NOW + 10 * DAY).toISOString(),
      stability: 30,
      difficulty: 3,
      scheduled_days: 25,
      reps: 6,
      lapses: 0,
      state: SrsState.Review,
      last_review: new Date(+NOW - 15 * DAY).toISOString(),
    },
  };
  pe.items[`${cafe.id}~r`] = {
    srs: {
      due: new Date(+NOW + 60000).toISOString(),
      stability: 0.5,
      difficulty: 6,
      scheduled_days: 0,
      reps: 1,
      lapses: 0,
      state: SrsState.Learning,
      last_review: NOW.toISOString(),
    },
  };
  pe.starred[silla.id] = true;
  setFlag(pe, mesa.id, 1, NOW);
  const pg = newProgress(geo.id);
  return {
    rows: buildRows([
      { set: es, progress: pe },
      { set: geo, progress: pg },
    ]),
    es,
    geo,
    mesa,
    silla,
    cafe,
    cloze,
    dupe,
  };
}

const terms = (rows) => rows.map((r) => r.card.term).sort();
const q = (rows, s) =>
  terms(search(rows, s, { now: NOW, retrievability: (srs) => (srs.stability >= 10 ? 0.95 : 0.6) }));

test("ulidTime relit l'horodatage", () => {
  assert.equal(ulidTime(ulid(1234567890123)), 1234567890123);
  assert.equal(ulidTime('pas un id'), null);
});

test('tokenize / parseQuery : guillemets, champs, négation, or', () => {
  assert.deepEqual(tokenize('term:"la mesa" -chien'), [
    { neg: false, field: 'term', value: 'la mesa', quoted: true },
    { neg: true, field: '', value: 'chien', quoted: false },
  ]);
  assert.equal(parseQuery('a b or c').length, 2);
  assert.equal(parseQuery('or or').length, 0);
});

test('recherche plein texte : casse, accents, markdown, cloze', () => {
  const { rows } = fixture();
  assert.deepEqual(q(rows, 'TABLE'), ['la mesa']);
  assert.deepEqual(q(rows, 'cafe'), ['el café']);
  assert.deepEqual(q(rows, 'paris'), [rows.find((r) => r.card.type === 'cloze').card.term]);
  assert.deepEqual(q(rows, '"la chaise"'), ['la silla']);
  assert.deepEqual(q(rows, 'ch*se'), ['la silla']);
  assert.deepEqual(q(rows, 'assoit'), ['la silla'], "l'indice est cherché");
  assert.equal(search(rows, '', {}).length, rows.length);
});

test('champs, jeu, étiquettes, négation, or', () => {
  const { rows } = fixture();
  assert.deepEqual(q(rows, 'term:mesa'), ['La Mesa', 'la mesa']);
  assert.deepEqual(q(rows, 'def:mesa'), []);
  assert.deepEqual(q(rows, 'set:capitales -is:cloze'), ['La Mesa']);
  assert.deepEqual(q(rows, 'deck:langues/esp* tag:meuble'), ['la mesa']);
  assert.equal(q(rows, 'tag:espagnol').length, 3, 'étiquette du jeu');
  assert.deepEqual(q(rows, 'silla or café'), ['el café', 'la silla']);
  assert.deepEqual(q(rows, 'inconnu:valeur'), [], 'champ inconnu = texte libre');
});

test('états, drapeaux, étoiles, doublons, médias', () => {
  const { rows, cloze } = fixture();
  assert.deepEqual(q(rows, 'is:new'), [cloze.term, 'La Mesa'].sort());
  assert.deepEqual(q(rows, 'is:learn'), ['el café']);
  assert.deepEqual(q(rows, 'is:review'), ['la mesa', 'la silla']);
  assert.deepEqual(q(rows, 'is:due'), ['la mesa']);
  assert.deepEqual(q(rows, 'is:starred'), ['la silla']);
  assert.deepEqual(q(rows, 'flag:1'), ['la mesa']);
  assert.equal(q(rows, 'flag:0').length, 4);
  assert.deepEqual(q(rows, 'is:dupe'), ['La Mesa', 'la mesa']);
  assert.deepEqual(q(rows, 'has:image'), ['el café']);
  assert.deepEqual(q(rows, 'has:hint'), ['la silla']);
});

test('dates et propriétés FSRS', () => {
  const { rows } = fixture();
  assert.equal(q(rows, 'added:7').length, 4, 'la silla a 40 jours');
  assert.deepEqual(q(rows, 'rated:5'), ['el café', 'la mesa']);
  assert.deepEqual(q(rows, 'prop:lapses>1'), ['la mesa']);
  assert.deepEqual(q(rows, 'prop:ivl>=20'), ['la silla']);
  assert.deepEqual(q(rows, 'prop:due<0'), ['la mesa']);
  assert.deepEqual(q(rows, 'prop:due=10'), ['la silla']);
  assert.deepEqual(q(rows, 'prop:r<80'), ['el café', 'la mesa']);
  assert.deepEqual(q(rows, 'prop:s>10 prop:d<4'), ['la silla']);
  assert.deepEqual(q(rows, 'prop:n_importe'), []);
});

test('résumé et tri', () => {
  const { rows, mesa } = fixture();
  const s = rowSummary(
    rows.find((r) => r.card.id === mesa.id),
    NOW,
  );
  assert.equal(s.state, 'review');
  assert.ok(s.isDue);
  assert.equal(s.lapses, 2);
  assert.deepEqual(
    sortRows(rows, 'due', false, NOW)
      .slice(0, 3)
      .map((r) => r.card.term),
    ['la mesa', 'el café', 'la silla'],
  );
  assert.equal(sortRows(rows, 'added', true)[0].card.term, 'la mesa');
  assert.equal(sortRows(rows, 'term')[0].card.term, 'el café');
});

test("historique d'une carte", () => {
  const { mesa } = fixture();
  const log = [
    { t: '2026-10-01T00:00:00Z', item: mesa.id, rating: 3 },
    { t: '2026-10-02T00:00:00Z', item: `${mesa.id}~r`, rating: 1 },
    { t: '2026-10-03T00:00:00Z', item: 'AUTRE', rating: 4 },
  ];
  assert.deepEqual(
    cardHistory(log, mesa.id).map((l) => l.rating),
    [1, 3],
  );
});

test('drapeaux : fusion commutative, le plus récent gagne', () => {
  const a = newProgress('X');
  const b = newProgress('X');
  setFlag(a, 'c1', 1, new Date('2026-10-01T00:00:00Z'));
  setFlag(b, 'c1', 0, new Date('2026-10-02T00:00:00Z'));
  setFlag(b, 'c2', 3, new Date('2026-10-01T00:00:00Z'));
  setFlag(a, 'c3', 2, new Date('2026-10-01T00:00:00Z'));
  setFlag(b, 'c3', 5, new Date('2026-10-01T00:00:00Z'));
  const ab = mergeProgress(a, b);
  assert.deepEqual(ab.flags, mergeProgress(b, a).flags);
  assert.equal(ab.flags.c1.f, 0);
  assert.equal(ab.flags.c2.f, 3);
  assert.equal(ab.flags.c3.f, 5);
  assert.deepEqual(mergeProgress(ab, ab).flags, ab.flags);
});

test("suspension : exclue de la file du jour et de l'étude, recherche is:suspended, fusion par date", async () => {
  const { setSuspended, isSuspended } = await import('../src/core/progress.js');
  const { activeItems, expandSet } = await import('../src/core/items.js');
  const { todayQueue } = await import('../src/core/daily.js');
  const cards = ['a', 'b', 'c'].map((term) => newCard({ term, definition: term }));
  const set = newSet({ cards });
  const p = newProgress(set.id);
  setSuspended(p, cards[1].id, true, new Date('2026-10-30T10:00:00Z'));
  const items = expandSet(set);
  assert.deepEqual(
    activeItems(items, p).map((i) => i.cardId),
    [cards[0].id, cards[2].id],
  );
  assert.equal(todayQueue(items, p, { newPerDay: 20, reviewsPerDay: 200 }).counts.new, 2);
  const rows = buildRows([{ set, progress: p }]);
  assert.deepEqual(
    search(rows, 'is:suspended').map((r) => r.card.term),
    ['b'],
  );
  // appareil 2 la réactive plus tard : la réactivation l'emporte, dans les deux sens de fusion
  const other = structuredClone(p);
  setSuspended(other, cards[1].id, false, new Date('2026-10-31T10:00:00Z'));
  for (const m of [mergeProgress(p, other), mergeProgress(other, p)]) assert.equal(isSuspended(m, cards[1].id), false);
});
