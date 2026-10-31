import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ulid, isId, seeded, sha256Hex } from '../src/core/ids.js';
import {
  checkAnswer,
  parseCloze,
  renderCloze,
  normalizeAnswer,
  mdToHtml,
  splitAlternatives,
  stripMarkdown,
} from '../src/core/text.js';
import { newSet, newCard, normalizeSet, newProgress } from '../src/core/format.js';
import { expandSet } from '../src/core/items.js';
import { Scheduler, SrsSession, buildQueue, SrsState, Grade, emptySrs } from '../src/core/srs.js';
import { LearnSession, buildChoices } from '../src/core/learn.js';
import { buildTest, gradeTest } from '../src/core/test.js';
import { buildMatchBoard, isMatch, GravityGame } from '../src/core/games.js';
import { applySrsResult, recordAnswer } from '../src/core/progress.js';
import { computeStats, examPlan } from '../src/core/stats.js';

const mkSet = (n = 10) => {
  const s = newSet({ title: 'Test' });
  for (let i = 0; i < n; i++) s.cards.push(newCard({ term: `terme ${i}`, definition: `définition ${i}` }));
  return s;
};

test('ulid : format, tri, unicité', () => {
  const a = ulid(1000);
  const b = ulid(2000);
  assert.ok(isId(a) && isId(b));
  assert.ok(a < b);
  assert.notEqual(ulid(1000), ulid(1000));
});

test('sha256Hex', async () => {
  assert.equal(
    await sha256Hex(new TextEncoder().encode('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});

test('checkAnswer : casse, accents, alternatives, parenthèses, fautes de frappe', () => {
  assert.equal(checkAnswer('La Table', 'la table').correct, true);
  assert.equal(checkAnswer('élève', 'eleve').correct, true);
  assert.equal(checkAnswer('to eat (food)', 'to eat').correct, true);
  assert.equal(checkAnswer('big; large', 'large').correct, true);
  assert.equal(checkAnswer('a / b', 'b').correct, true);
  assert.equal(checkAnswer('mesa', '').correct, false);
  const typo = checkAnswer('restaurant', 'restaurent');
  assert.deepEqual(typo, { correct: false, close: true });
  assert.deepEqual(checkAnswer('restaurant', 'restaurent', { typoTolerance: false }), { correct: false, close: false });
  assert.equal(checkAnswer('chat', 'chien').close, false);
});

test('normalisation et alternatives', () => {
  assert.equal(normalizeAnswer('  **Été**, déjà! '), 'ete deja');
  assert.deepEqual(splitAlternatives('a; b | c / d'), ['a', 'b', 'c', 'd']);
  assert.equal(stripMarkdown('![x](a.png) **gras** [lien](http://x)'), 'gras lien');
});

test('cloze : analyse et rendu', () => {
  const t = 'Paris est la capitale de {{c1::la France::pays}} et {{c2::Londres}} celle du Royaume-Uni. {{c1::Bis}}';
  const c = parseCloze(t);
  assert.equal(c.length, 2);
  assert.equal(c[0].answer, 'la France / Bis');
  assert.equal(renderCloze(t, 1, 'blank'), 'Paris est la capitale de [pays] et Londres celle du Royaume-Uni. […]');
  const revealed = renderCloze(t, 2, 'reveal');
  assert.equal(revealed, 'Paris est la capitale de la France et \uE000Londres\uE001 celle du Royaume-Uni. Bis');
  // mot révélé mis en valeur par une balise dédiée ; marqueurs retirés du texte brut (lecture à voix haute)
  assert.match(mdToHtml(revealed), /et <mark class="cloze">Londres<\/mark> celle/);
  assert.equal(stripMarkdown(revealed), 'Paris est la capitale de la France et Londres celle du Royaume-Uni. Bis');
});

test('style : couleur des mots révélés, remplacée si illisible sur le fond', async () => {
  const { cardAppearance, sanitizeStyle } = await import('../src/core/style.js');
  assert.equal(sanitizeStyle({ cloze: '#c62828' }).cloze, '#C62828');
  assert.equal(sanitizeStyle({ cloze: 'red;}' }).cloze, undefined);
  assert.equal(cardAppearance({}).vars['--card-cloze'], undefined, 'accent du thème par défaut');
  assert.equal(cardAppearance({ cloze: '#C62828' }).vars['--card-cloze'], '#C62828');
  assert.equal(cardAppearance({ bg: '#FFFFFF', cloze: '#C62828' }).vars['--card-cloze'], '#C62828');
  // rouge foncé sur fond marine : illisible → couleur du texte
  assert.equal(cardAppearance({ bg: '#1B2A41', cloze: '#C62828' }).vars['--card-cloze'], '#FFFFFF');
  assert.equal(cardAppearance({ bg: '#1B2A41' }).vars['--card-cloze'], '#7EA4FF');
});

test('mdToHtml échappe le HTML', () => {
  assert.equal(mdToHtml('<script>x</script>'), '&lt;script&gt;x&lt;/script&gt;');
  assert.match(mdToHtml('**a** *b* `c`'), /<strong>a<\/strong> <em>b<\/em> <code>c<\/code>/);
  assert.match(
    mdToHtml('![alt](media/x.png)', (p) => 'blob:' + p),
    /src="blob:media\/x.png"/,
  );
});

test('format : normalizeSet valide et nettoie', () => {
  const s = mkSet(3);
  const n = normalizeSet(JSON.parse(JSON.stringify(s)));
  assert.equal(n.cards.length, 3);
  assert.throws(() => normalizeSet({ format: 'autre' }));
  assert.throws(() => normalizeSet({ format: 'flashcard.set', version: 99 }));
  const dup = JSON.parse(JSON.stringify(s));
  dup.cards[1].id = dup.cards[0].id;
  const d = normalizeSet(dup);
  assert.notEqual(d.cards[0].id, d.cards[1].id);
});

test('items : sens terme/définition/les deux, cloze', () => {
  const s = mkSet(2);
  assert.equal(expandSet(s, 'term').length, 2);
  assert.equal(expandSet(s, 'both').length, 4);
  const rev = expandSet(s, 'def')[0];
  assert.equal(rev.prompt, 'définition 0');
  assert.equal(rev.answer, 'terme 0');
  s.cards.push(newCard({ type: 'cloze', term: 'A {{c1::x}} B {{c2::y}}', definition: 'extra' }));
  const items = expandSet(s, 'term');
  assert.equal(items.length, 4);
  assert.equal(items[2].prompt, 'A […] B y');
  assert.equal(items[3].answer, 'y');
  assert.match(items[2].id, /#c1$/);
  // carte incomplète ignorée
  s.cards.push(newCard({ term: 'seul', definition: '' }));
  assert.equal(expandSet(s, 'term').length, 4);
});

test('FSRS : planification, aperçu, rétrievabilité', () => {
  const sch = new Scheduler({ fuzz: false });
  const t0 = new Date('2026-10-28T10:00:00Z');
  let r = sch.review(null, Grade.Good, t0);
  assert.equal(r.srs.state, SrsState.Learning);
  assert.equal(r.log.state, SrsState.New);
  // enchaîner jusqu'à la révision
  let t = new Date(r.srs.due);
  r = sch.review(r.srs, Grade.Good, t);
  assert.equal(r.srs.state, SrsState.Review);
  assert.ok(new Date(r.srs.due) > t);
  const p = sch.preview(r.srs, new Date(r.srs.due));
  assert.ok(p[4] > p[3] && p[3] > p[2] && p[2] >= p[1]);
  const R0 = sch.retrievability(r.srs, new Date(r.srs.last_review));
  const R5 = sch.retrievability(r.srs, new Date(new Date(r.srs.last_review).getTime() + 5 * 86400000));
  assert.ok(R0 > 0.99 && R5 < R0);
  assert.equal(sch.retrievability(emptySrs()), 0);
  // un « À revoir » sur une carte en révision → ré-apprentissage
  const lapse = sch.review(r.srs, Grade.Again, new Date(r.srs.due));
  assert.equal(lapse.srs.state, SrsState.Relearning);
  assert.equal(lapse.srs.lapses, 1);
});

test('file SRS : limites quotidiennes, ré-apprentissage à court terme', () => {
  const set = mkSet(8);
  const items = expandSet(set);
  const byId = new Map(items.map((i) => [i.id, i]));
  const progress = newProgress(set.id);
  const sch = new Scheduler({ fuzz: false });
  const now = new Date('2026-10-28T09:00:00');
  let q = buildQueue(items, progress, { now, newPerDay: 3 });
  assert.equal(q.counts.new, 3);
  const session = new SrsSession(q, progress, sch, byId);
  const first = session.current(now);
  let res = session.answer(first.id, Grade.Again, now);
  applySrsResult(progress, res, now);
  assert.equal(res.wasNew, true);
  // l'item revient (apprentissage 1 min) après les autres
  assert.equal(session.remaining().learning, 1);
  // il ne reste plus que 2 nouveaux : le quota du jour est décompté
  q = buildQueue(items, progress, { now, newPerDay: 3 });
  assert.equal(q.counts.new, 2);
  // aucune limite si ignoreLimits
  q = buildQueue(items, progress, { now, newPerDay: 3, ignoreLimits: true });
  assert.equal(q.counts.new, 7);
  // jour suivant : la carte en réapprentissage est due, le quota est remis à zéro
  const tomorrow = new Date('2026-10-29T09:00:00');
  q = buildQueue(items, progress, { now: tomorrow, newPerDay: 3 });
  assert.equal(q.counts.learning + q.counts.review, 1);
  assert.equal(q.counts.new, 3);
});

test('Apprendre : un jeu est maîtrisé en ≤ N rounds et la maîtrise est persistable', () => {
  const items = expandSet(mkSet(10));
  const rng = seeded(7);
  const s = new LearnSession(items, { rng });
  let guard = 0;
  while (!s.finished && guard++ < 1000) {
    const q = s.next();
    if (q.roundEnd) {
      s.continueRound();
      continue;
    }
    assert.ok(q.kind === 'choice' || q.kind === 'write');
    if (q.kind === 'choice') assert.equal(q.options[q.correctIndex], q.item.answer);
    s.answer(true);
  }
  assert.ok(s.finished);
  assert.equal(s.progress().mastered, 10);
  const snap = s.snapshot();
  assert.ok(Object.values(snap).every((v) => v === 2));
  // reprise : tout est déjà maîtrisé
  const s2 = new LearnSession(items, { mastery: snap, rng });
  assert.ok(s2.finished);
});

test("Apprendre : une erreur remet l'item en circulation", () => {
  const items = expandSet(mkSet(5));
  const s = new LearnSession(items, { rng: seeded(3) });
  const q = s.next();
  const id = q.item.id;
  const r = s.answer(false);
  assert.equal(r.level, 0);
  assert.ok(s.queue.includes(id));
});

test("Apprendre : sans choix multiple, uniquement écrit ; peu d'items → écrit", () => {
  const items = expandSet(mkSet(1));
  const s = new LearnSession(items, { rng: seeded(1) });
  assert.equal(s.next().kind, 'write'); // pas de distracteur possible
  const s2 = new LearnSession(expandSet(mkSet(6)), { multipleChoice: false, rng: seeded(1) });
  assert.equal(s2.next().kind, 'write');
  const s3 = new LearnSession(expandSet(mkSet(6)), { written: false, rng: seeded(1) });
  assert.equal(s3.next().kind, 'choice');
});

test('buildChoices : pas de doublons de réponse', () => {
  const s = mkSet(4);
  s.cards[1].definition = s.cards[0].definition;
  const items = expandSet(s);
  const ch = buildChoices(items[0], items, seeded(2));
  const set = new Set(ch.options);
  assert.equal(set.size, ch.options.length);
});

test('Test : génération, correction, association', () => {
  const items = expandSet(mkSet(12));
  const qs = buildTest(items, { count: 12 }, seeded(5));
  const types = new Set(qs.map((q) => q.type));
  assert.ok(types.has('matching') && types.has('choice') && types.has('truefalse') && types.has('written'));
  const answers = {};
  for (const q of qs) {
    if (q.type === 'choice') answers[q.id] = q.correctIndex;
    else if (q.type === 'truefalse') answers[q.id] = q.isTrue;
    else if (q.type === 'written') answers[q.id] = q.item.answer;
    else answers[q.id] = Object.fromEntries(q.pairs.map((p) => [p.itemId, p.answer]));
  }
  const g = gradeTest(qs, answers);
  assert.equal(g.score, g.total);
  const zero = gradeTest(qs, {});
  assert.equal(zero.score, 0);
});

test('Association : plateau et correspondances', () => {
  const items = expandSet(mkSet(10));
  const board = buildMatchBoard(items, 6, seeded(2));
  assert.equal(board.length, 12);
  const a = board.find((t) => t.side === 'prompt');
  const b = board.find((t) => t.pairId === a.pairId && t.side === 'answer');
  const c = board.find((t) => t.pairId !== a.pairId && t.side === 'answer');
  assert.ok(isMatch(a, b));
  assert.ok(!isMatch(a, c));
  assert.ok(!isMatch(a, a));
});

test('Gravité : chute, destruction, vies, niveaux', () => {
  const items = expandSet(mkSet(10));
  const g = new GravityGame(items, { rng: seeded(4), lives: 2 });
  g.tick(100);
  assert.equal(g.asteroids.length, 1);
  const a = g.asteroids[0];
  assert.equal(g.submit('faux').ok, false);
  assert.equal(g.submit(a.answer).ok, true);
  assert.equal(g.destroyed, 1);
  assert.ok(g.score > 100);
  // laisser tomber jusqu'à perdre
  let guard = 0;
  while (!g.over && guard++ < 10000) g.tick(500);
  assert.ok(g.over);
  assert.equal(g.lives, 0);
});

test("stats : série, prévisions, score mémoire, plan d'examen", () => {
  const set = mkSet(4);
  const items = expandSet(set);
  const byId = new Map(items.map((i) => [i.id, i]));
  const progress = newProgress(set.id);
  const sch = new Scheduler({ fuzz: false });
  const now = new Date('2026-10-28T10:00:00');
  const session = new SrsSession(buildQueue(items, progress, { now }), progress, sch, byId);
  for (const it of items) {
    const r = session.answer(it.id, Grade.Good, now);
    applySrsResult(progress, r, now);
  }
  recordAnswer(progress, items[0].id, true, { now: new Date('2026-10-27T10:00:00') });
  const st = computeStats(items, progress, sch, now);
  assert.equal(st.seen, 4);
  assert.ok(st.memoryScore > 0.9);
  assert.equal(st.streak, 2);
  assert.equal(st.heat.length, 126);
  // un jour révisé seulement sur un autre appareil (journal fusionné) prolonge la série
  const other = computeStats(items, progress, sch, now, [{ t: '2026-10-26T09:00:00', item: 'x', mode: 'srs' }]);
  assert.equal(other.streak, 3);
  assert.equal(other.heat.at(-3).n, 1);
  assert.ok(st.forecast.reduce((a, b) => a + b, 0) >= 4);
  const plan = examPlan(items, newProgress(set.id), '2026-11-07', now);
  assert.equal(plan.daysLeft, 10);
  assert.equal(plan.unlearned, 4);
  assert.equal(plan.perDay, 1);
  assert.equal(examPlan(items, progress, '2026-10-01', now).passed, true);
});

import { sanitizeStyle, mergeStyle, autoFg, contrast, cardAppearance, isHex } from '../src/core/style.js';
import { collectMedia } from '../src/core/format.js';

test("style : validation stricte (pas d'injection CSS)", () => {
  const s = sanitizeStyle({
    bg: '#fff3a3',
    backBg: 'red',
    fg: 'url(javascript:alert(1))',
    font: 'comic',
    size: 'xl',
    align: 'center',
    paper: 'grid',
    bgImage: '../../etc/passwd',
    extra: 1,
  });
  assert.deepEqual(s, { bg: '#FFF3A3', size: 'xl', align: 'center', paper: 'grid' });
  assert.deepEqual(sanitizeStyle(null), {});
  assert.equal(isHex('#12345'), false);
  assert.equal(
    sanitizeStyle({ bgImage: 'media/' + 'a'.repeat(64) + '.png' }).bgImage,
    'media/' + 'a'.repeat(64) + '.png',
  );
});

test('style : la carte complète le jeu ; texte toujours lisible', () => {
  assert.deepEqual(mergeStyle({ bg: '#FFFFFF', font: 'sans' }, { bg: '#1B2A41' }), { bg: '#1B2A41', font: 'sans' });
  // fond sombre, texte demandé sombre → remplacé par du blanc
  assert.equal(autoFg('#1B2A41', '#222222'), '#FFFFFF');
  // couleur choisie suffisamment contrastée → respectée
  assert.equal(autoFg('#FFFFFF', '#AA0000'), '#AA0000');
  // sans préférence : encre sur clair, blanc sur sombre
  assert.equal(autoFg('#FFF3A3'), '#1B2A41');
  assert.equal(autoFg('#000000'), '#FFFFFF');
  assert.ok(contrast('#000000', '#FFFFFF') > 20);
  const a = cardAppearance({ bg: '#1B2A41', backBg: '#FFFFFF', font: 'mono' }, 'answer');
  assert.equal(a.vars['--card-bg'], '#FFFFFF');
  assert.match(a.className, /font-mono/);
  assert.match(cardAppearance({ bg: '#1B2A41' }, 'prompt').className, /is-dark/);
});

test('items : style hérité du jeu, images recto/verso selon le sens', () => {
  const s = newSet({ style: { bg: '#CFF1DC', font: 'sans' } });
  s.cards.push(
    newCard({
      term: 'a',
      definition: 'b',
      image: 'media/' + '1'.repeat(64) + '.png',
      termImage: 'media/' + '2'.repeat(64) + '.png',
      style: { font: 'mono' },
    }),
  );
  const [fwd] = expandSet(s, 'term');
  assert.equal(fwd.style.bg, '#CFF1DC');
  assert.equal(fwd.style.font, 'mono');
  assert.equal(fwd.promptImage, s.cards[0].termImage);
  assert.equal(fwd.answerImage, s.cards[0].image);
  const [rev] = expandSet(s, 'def');
  assert.equal(rev.promptImage, s.cards[0].image);
  assert.equal(rev.answerImage, s.cards[0].termImage);
  // une carte avec seulement des images est utilisable
  s.cards.push(
    newCard({
      term: '',
      definition: '',
      image: 'media/' + '3'.repeat(64) + '.png',
      termImage: 'media/' + '4'.repeat(64) + '.png',
    }),
  );
  assert.equal(expandSet(s, 'term').length, 2);
});

test('format : normalizeSet nettoie les styles et la couleur ; collectMedia les référence tous', () => {
  const m = (c) => 'media/' + c.repeat(64) + '.png';
  const raw = JSON.parse(JSON.stringify(newSet({ color: '#abcdef', style: { bgImage: m('a'), bg: 'nope' } })));
  raw.cards = [
    { id: 'x', term: 't', definition: 'd', image: m('b'), termImage: m('c'), style: { bgImage: m('d'), fg: '#00000' } },
  ];
  const n = normalizeSet(raw);
  assert.equal(n.color, '#ABCDEF');
  assert.deepEqual(n.style, { bgImage: m('a') });
  assert.deepEqual(n.cards[0].style, { bgImage: m('d') });
  assert.deepEqual([...collectMedia(n)].sort(), ['a', 'b', 'c', 'd'].map(m));
});

test('studyMore / defaultBoost : au-delà des limites du jour, puis en avance', async () => {
  const { studyMore, defaultBoost, localDay } = await import('../src/core/srs.js');
  const now = new Date('2026-10-31T10:00:00');
  const set = newSet({ cards: Array.from({ length: 30 }, (_, i) => newCard({ term: 't' + i, definition: 'd' + i })) });
  const items = expandSet(set);
  const progress = newProgress(set.id);
  const opts = { now, newPerDay: 20, reviewsPerDay: 200 };
  // limite des nouvelles atteinte aujourd'hui
  progress.daily[localDay(now)] = { new: 20, reviews: 0 };
  assert.equal(buildQueue(items, progress, opts).counts.new, 0);
  const more = studyMore(items, progress, opts);
  assert.equal(more.newLeft, 30);
  assert.deepEqual(defaultBoost(more), { moreNew: 10 });
  assert.equal(buildQueue(items, progress, { ...opts, moreNew: 10 }).counts.new, 10);
  // tout est vu : seules restent des révisions des prochains jours
  for (const it of items)
    progress.items[it.id] = { srs: { state: SrsState.Review, due: new Date('2026-11-03T09:00:00').toISOString() } };
  const later = studyMore(items, progress, opts);
  assert.deepEqual([later.newLeft, later.reviewsLeft, later.ahead], [0, 0, 30]);
  assert.deepEqual(defaultBoost(later), { aheadDays: 7 });
  assert.equal(buildQueue(items, progress, { ...opts, aheadDays: 7 }).counts.review, 30);
  assert.equal(defaultBoost({ newLeft: 0, reviewsLeft: 0, ahead: 0 }), null);
});

test("todayQueue : même file partout, plan d'examen compris", async () => {
  const { todayQueue, todayMore, dailyLimits } = await import('../src/core/daily.js');
  const now = new Date('2026-10-31T10:00:00');
  const set = newSet({ cards: Array.from({ length: 40 }, (_, i) => newCard({ term: 't' + i, definition: 'd' + i })) });
  const items = expandSet(set);
  const progress = newProgress(set.id);
  const settings = { newPerDay: 5, reviewsPerDay: 200 };
  assert.equal(todayQueue(items, progress, settings, null, now).counts.new, 5);
  // examen dans 5 jours : 40 cartes à voir en 4 jours d'apprentissage → 10 par jour, au-delà des réglages
  progress.exam = { date: '2026-11-05' };
  assert.equal(dailyLimits(items, progress, settings, now).newOverride, 10);
  assert.equal(todayQueue(items, progress, settings, null, now).counts.new, 10);
  assert.equal(todayQueue(items, progress, settings, { moreNew: 3 }, now).counts.new, 13);
  assert.equal(todayMore(items, progress, settings, now).newLeft, 30);
});

test('SrsSession : ne modifie pas la progression reçue', () => {
  const set = mkSet(3);
  const items = expandSet(set);
  const progress = newProgress(set.id);
  const before = JSON.stringify(progress);
  const now = new Date('2026-10-28T09:00:00');
  const session = new SrsSession(
    buildQueue(items, progress, { now }),
    progress,
    new Scheduler({ fuzz: false }),
    new Map(items.map((i) => [i.id, i])),
  );
  const first = session.current(now);
  const res = session.answer(first.id, Grade.Again, now);
  assert.equal(JSON.stringify(progress), before);
  assert.equal(session.remaining().learning, 1, 'la séance suit ses propres états');
  assert.equal(res.srs.state, SrsState.Learning);
});

test('SrsSession : cartes vues et terminées (barre de progression en deux tons)', () => {
  const set = mkSet(3);
  const items = expandSet(set);
  const progress = newProgress(set.id);
  const now = new Date('2026-10-28T09:00:00');
  const s = new SrsSession(
    buildQueue(items, progress, { now }),
    progress,
    new Scheduler({ fuzz: false }),
    new Map(items.map((i) => [i.id, i])),
  );
  const a = s.current(now);
  s.answer(a.id, Grade.Again, now); // vue, pas terminée : reviendra
  assert.deepEqual([s.seen.size, s.done, s.total], [1, 0, 3]);
  const b = s.current(now);
  s.answer(b.id, Grade.Easy, now); // vue et terminée
  assert.deepEqual([s.seen.size, s.done], [2, 1]);
  s.answer(a.id, Grade.Again, now); // revue : pas comptée deux fois
  assert.equal(s.seen.size, 2);
});

test("SrsSession : jamais deux fois de suite la même carte, sauf si c'est la dernière", () => {
  const set = mkSet(2);
  const items = expandSet(set);
  const progress = newProgress(set.id);
  const now = new Date('2026-10-28T09:00:00');
  const s = new SrsSession(
    buildQueue(items, progress, { now }),
    progress,
    new Scheduler({ fuzz: false }),
    new Map(items.map((i) => [i.id, i])),
  );
  const a = s.current(now);
  s.answer(a.id, Grade.Easy, now);
  const b = s.current(now);
  assert.notEqual(b.id, a.id);
  // b ratée puis ratée encore : c'est la seule carte restante, elle revient
  s.answer(b.id, Grade.Again, now);
  assert.equal(s.current(now).id, b.id);
  // avec une autre carte en apprentissage, celle qu'on vient de rater ne revient pas tout de suite
  const s2 = new SrsSession(
    buildQueue(items, progress, { now }),
    progress,
    new Scheduler({ fuzz: false }),
    new Map(items.map((i) => [i.id, i])),
  );
  const x = s2.current(now);
  s2.answer(x.id, Grade.Again, now);
  const y = s2.current(now);
  assert.notEqual(y.id, x.id);
  s2.answer(y.id, Grade.Again, now);
  assert.equal(s2.current(now).id, x.id, "la carte en apprentissage la plus proche, pas celle qu'on vient de voir");
});
