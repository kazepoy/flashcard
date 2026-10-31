// Mode « Test » : génération et correction d'un contrôle (QCM, vrai/faux, écrit, association).
import { shuffle } from './ids.js';
import { buildChoices } from './learn.js';
import { checkAnswer, normalizeAnswer } from './text.js';

export const TEST_TYPES = ['choice', 'truefalse', 'written', 'matching'];

/**
 * @param {import('./items.js').Item[]} items
 * @param {{count?:number, types?:Record<string,boolean>, matchSize?:number}} opts
 */
export function buildTest(items, opts = {}, rng = Math.random) {
  const {
    count = Math.min(20, items.length),
    types = { choice: true, truefalse: true, written: true, matching: true },
    matchSize = 6,
  } = opts;
  const enabled = TEST_TYPES.filter((t) => types[t]);
  if (!enabled.length || !items.length) return [];
  let pool = shuffle(items, rng).slice(0, Math.max(1, count));
  const questions = [];

  // Association : un bloc de `matchSize` paires si activé et assez d'items.
  // (sans les images masquées : les paires n'affichent que du texte)
  const matchable = pool.filter((it) => it.kind !== 'occlusion');
  if (enabled.includes('matching') && matchable.length >= 4) {
    const size = Math.min(matchSize, Math.max(3, Math.floor(matchable.length / 3)));
    const block = matchable.slice(0, size);
    pool = pool.filter((it) => !block.includes(it));
    questions.push({
      id: 'm' + block[0].id,
      type: 'matching',
      pairs: block.map((it) => ({ itemId: it.id, prompt: it.prompt, answer: it.answer })),
      answers: shuffle(
        block.map((it) => it.answer),
        rng,
      ),
    });
  }
  const rest = enabled.filter((t) => t !== 'matching');
  pool.forEach((item, i) => {
    let type = rest.length ? rest[i % rest.length] : 'written';
    if (type === 'choice') {
      const ch = buildChoices(item, items, rng);
      if (ch) return questions.push({ id: item.id, type, item, ...ch });
      type = 'written';
    }
    if (type === 'truefalse') {
      const others = items.filter(
        (o) => o.id !== item.id && normalizeAnswer(o.answer) !== normalizeAnswer(item.answer),
      );
      const useTrue = !others.length || rng() < 0.5;
      const shown = useTrue ? item.answer : others[Math.floor(rng() * others.length)].answer;
      return questions.push({ id: item.id, type, item, shown, isTrue: useTrue });
    }
    questions.push({ id: item.id, type: 'written', item });
  });
  return shuffle(questions, rng);
}

/**
 * Corrige un test.
 * @param {Array} questions
 * @param {Record<string, any>} answers  id question → réponse :
 *   choice: index choisi ; truefalse: booléen ; written: texte ; matching: {itemId: réponse choisie}
 * @returns {{score:number, total:number, results:Array}}
 */
export function gradeTest(questions, answers, { typoTolerance = true } = {}) {
  let score = 0;
  let total = 0;
  const results = [];
  for (const q of questions) {
    const given = answers[q.id];
    if (q.type === 'matching') {
      const per = q.pairs.map((p) => {
        const ok = given && given[p.itemId] === p.answer;
        total++;
        if (ok) score++;
        return { itemId: p.itemId, correct: !!ok };
      });
      results.push({ id: q.id, type: q.type, correct: per.every((x) => x.correct), parts: per });
      continue;
    }
    total++;
    let correct = false;
    if (q.type === 'choice') correct = given === q.correctIndex;
    else if (q.type === 'truefalse') correct = given === q.isTrue;
    else if (q.type === 'written')
      correct = typeof given === 'string' && checkAnswer(q.item.answer, given, { typoTolerance }).correct;
    if (correct) score++;
    results.push({ id: q.id, type: q.type, itemId: q.item.id, correct });
  }
  return { score, total, results };
}
