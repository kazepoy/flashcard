import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newProgress } from '../src/core/format.js';
import {
  answerButtons,
  dailyActivity,
  difficultyHistogram,
  futureDue,
  histogram,
  hourly,
  intervalHistogram,
  itemCounts,
  retrievabilityHistogram,
  reviewKind,
  reviewsPerDay,
  streak,
  trueRetention,
} from '../src/core/analytics.js';
import { SrsState } from '../src/core/srs.js';

const NOW = new Date(2026, 9, 28, 15, 0); // 28 oct. 2026, 15 h (heure locale)
const at = (daysAgo, hour = 10) => new Date(2026, 9, 28 - daysAgo, hour).toISOString();
const rev = (daysAgo, rating, state, scheduled_days = 0, hour = 10) => ({
  t: at(daysAgo, hour),
  item: 'X',
  mode: 'srs',
  rating,
  state,
  scheduled_days,
  ms: 1000,
});

const LOG = [
  rev(0, 3, SrsState.New),
  rev(0, 1, SrsState.Review, 30),
  rev(0, 3, SrsState.Review, 5, 8),
  rev(1, 2, SrsState.Review, 25),
  rev(1, 3, SrsState.Relearning),
  rev(10, 1, SrsState.Review, 3),
  { t: at(0), item: 'X', mode: 'learn', rating: 3 }, // hors FSRS : ignoré
];

const srs = (state, due, scheduled_days, difficulty = 5, stability = 10) => ({
  state,
  due,
  scheduled_days,
  difficulty,
  stability,
  last_review: at(1),
  reps: 1,
  lapses: 0,
});

function progresses() {
  const a = newProgress('A');
  a.items.i1 = { srs: srs(SrsState.Review, at(2), 40, 3) };
  a.items.i2 = { srs: srs(SrsState.Review, at(-3), 5, 7) };
  a.items.i3 = { srs: srs(SrsState.Learning, at(0, 16), 0, 9) };
  a.daily[NOW.toISOString().slice(0, 10)] = { answers: 4, ms: 60000 };
  const b = newProgress('B');
  b.items.j1 = { srs: srs(SrsState.Relearning, at(-1), 0, 6) };
  b.items.j2 = { mastery: 2 }; // pas de FSRS
  return [a, b];
}

test('catégorie de révision', () => {
  assert.equal(reviewKind({ state: SrsState.New }), 'learn');
  assert.equal(reviewKind({ state: SrsState.Review, scheduled_days: 21 }), 'mature');
  assert.equal(reviewKind({ state: SrsState.Review, scheduled_days: 20 }), 'young');
  assert.equal(reviewKind({ state: SrsState.Relearning }), 'relearn');
});

test('révisions par jour, empilées', () => {
  const r = reviewsPerDay(LOG, 7, NOW);
  assert.equal(r.length, 7);
  const today = r[6];
  assert.deepEqual([today.learn, today.young, today.mature, today.relearn, today.total], [1, 1, 1, 0, 3]);
  assert.deepEqual([r[5].mature, r[5].relearn], [1, 1]);
  assert.equal(
    r.reduce((n, d) => n + d.total, 0),
    5,
    "la révision d'il y a 10 jours est hors fenêtre",
  );
});

test('activité quotidienne et série', () => {
  const ps = progresses();
  const key = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  ps[0].daily = { [key(new Date(2026, 9, 27))]: { answers: 2 }, [key(new Date(2026, 9, 26))]: { answers: 1 } };
  ps[1].daily = { [key(new Date(2026, 9, 27))]: { answers: 3, ms: 5 } };
  const a = dailyActivity(ps, 5, NOW);
  assert.deepEqual(
    a.map((x) => x.n),
    [0, 0, 1, 5, 0],
  );
  assert.equal(streak(a), 2, "aujourd'hui (0) ne casse pas la série");
  assert.equal(streak([{ n: 1 }, { n: 0 }, { n: 0 }]), 0);
});

test('répartition des items et échéances', () => {
  const ps = progresses();
  assert.deepEqual(itemCounts(ps, 10), { new: 6, learn: 2, young: 1, mature: 1 });
  const f = futureDue(ps, 7, NOW);
  assert.equal(f.overdue, 1);
  assert.deepEqual(f.perDay, [1, 1, 0, 1, 0, 0, 0]);
});

test('histogrammes', () => {
  assert.deepEqual(
    histogram([0, 0.5, 1, 7, 100, -1], [0, 1, 5]).map((b) => b.n),
    [2, 1, 2],
  );
  const ps = progresses();
  const iv = intervalHistogram(ps);
  assert.equal(
    iv.reduce((n, b) => n + b.n, 0),
    2,
    'seulement les items en révision',
  );
  assert.equal(iv.find((b) => b.lo === 30).n, 1);
  assert.deepEqual(
    difficultyHistogram(ps).map((b) => b.n),
    [0, 0, 1, 0, 0, 1, 1, 0, 1],
  );
  const r = retrievabilityHistogram(ps, (s) => (s.difficulty > 5 ? 1 : 0.42), NOW);
  assert.equal(r[9].n, 3, '100 % tombe dans la dernière case');
  assert.equal(r[4].n, 1);
});

test('rétention réelle par période', () => {
  const r = Object.fromEntries(trueRetention(LOG, NOW).map((x) => [x.id, x]));
  assert.deepEqual([r.today.young.rate, r.today.mature.rate, r.today.total.n], [1, 0, 2]);
  assert.equal(r.yesterday.mature.rate, 1, 'Difficile compte comme réussi');
  assert.equal(r.week.total.n, 3);
  assert.equal(r.month.total.n, 4);
  assert.equal(r.all.young.rate, 0.5);
  assert.equal(trueRetention([], NOW)[0].total.rate, null);
});

test('par heure et boutons', () => {
  const h = hourly(LOG, 30, NOW);
  assert.equal(h[10].n, 5);
  assert.equal(h[8].n, 1);
  assert.equal(h[10].rate, 3 / 5);
  assert.equal(h[3].rate, null);
  const b = answerButtons(LOG, Infinity, NOW);
  assert.deepEqual([b.young[1], b.young[3], b.young.n], [1, 1, 2]);
  assert.equal(b.mature[2], 1);
  assert.equal(b.relearn.n, 1);
});
