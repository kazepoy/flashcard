import { useState } from 'preact/hooks';
import { buildTest, gradeTest } from '../../core/test.js';
import { recordAnswer } from '../../core/progress.js';
import { IndexCard, Md } from '../components.jsx';
import { useApp } from '../ctx.js';
import { t, tn } from '../i18n.js';
import { useItems } from '../useSet.js';
import { CardFace } from './face.jsx';
import { DirectionPicker, Finish, StudyEmpty, StudyShell } from './shell.jsx';

export function TestMode({ set, progress, update, log }) {
  const [direction, setDirection] = useState('term');
  const [starredOnly, setStarredOnly] = useState(false);
  const items = useItems(set, progress, { direction, starredOnly, need: 'text' });
  const hasStarred = Object.keys(progress.starred).length > 0;
  const [cfg, setCfg] = useState(null); // null = écran de configuration
  const [count, setCount] = useState(20);
  const [types, setTypes] = useState({ choice: true, truefalse: true, written: true, matching: true });
  const options = (
    <DirectionPicker
      value={direction}
      onChange={setDirection}
      starred={starredOnly}
      onStarred={setStarredOnly}
      hasStarred={hasStarred}
    />
  );

  if (items.length < 1)
    return (
      <StudyShell set={set} title={t('mode.test')} options={options}>
        <StudyEmpty set={set} />
      </StudyShell>
    );

  if (!cfg) {
    const max = items.length;
    const n = Math.min(count, max);
    return (
      <StudyShell set={set} title={t('mode.test')} options={options}>
        <form class="panel narrow" onSubmit={(e) => (e.preventDefault(), setCfg({ count: n, types, run: Date.now() }))}>
          <h2>{t('study.prepareTest')}</h2>
          <label class="field">
            <span>{t('study.numberQuestions', { n })}</span>
            <input type="range" min="1" max={max} value={n} onInput={(e) => setCount(Number(e.currentTarget.value))} />
          </label>
          <fieldset>
            <legend>{t('study.questionTypes')}</legend>
            {[
              ['choice', t('study.multipleChoice')],
              ['truefalse', t('study.trueFalse')],
              ['written', t('study.writtenAnswer')],
              ['matching', t('mode.match')],
            ].map(([k, label]) => (
              <label class="check" key={k}>
                <input
                  type="checkbox"
                  checked={types[k]}
                  onChange={(e) => setTypes({ ...types, [k]: e.currentTarget.checked })}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          <button class="btn primary" type="submit" disabled={!Object.values(types).some(Boolean)}>
            {t('study.startTest')}
          </button>
        </form>
      </StudyShell>
    );
  }
  return <TestRun key={cfg.run} {...{ set, progress, update, log, items, options, cfg, redo: () => setCfg(null) }} />;
}

function TestRun({ set, update, log, items, options, cfg, redo }) {
  const { settings } = useApp();
  const [questions] = useState(() => buildTest(items, { count: cfg.count, types: cfg.types }));
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const set1 = (id, v) => setAnswers((a) => ({ ...a, [id]: v }));

  const submit = () => {
    const g = gradeTest(questions, answers, { typoTolerance: settings.typoTolerance });
    const now = new Date().toISOString();
    const graded = g.results.flatMap((r) =>
      r.parts ? r.parts.map((p) => [p.itemId, p.correct]) : [[r.itemId, r.correct]],
    );
    update((p) => graded.forEach(([itemId, ok]) => recordAnswer(p, itemId, ok)));
    for (const [itemId, ok] of graded) log({ t: now, item: itemId, mode: 'test', rating: ok ? 3 : 1 });
    setResult(g);
  };

  const answered = questions.filter((q) =>
    q.type === 'matching'
      ? Object.keys(answers[q.id] || {}).length === q.pairs.length
      : answers[q.id] !== undefined && answers[q.id] !== '',
  ).length;
  const resById = result ? Object.fromEntries(result.results.map((r) => [r.id, r])) : {};

  return (
    <StudyShell
      set={set}
      title={t('mode.test')}
      options={options}
      progress={{ value: result ? questions.length : answered, max: questions.length, label: t('common.progress') }}
    >
      {result && (
        <Finish
          title={t('study.testScore', {
            s: result.score,
            n: result.total,
            p: Math.round((result.score / result.total) * 100),
          })}
          actions={
            <button class="btn primary" onClick={redo}>
              {t('study.takeAnotherTest')}
            </button>
          }
        >
          <p>
            {result.score === result.total
              ? t('study.noMistakes')
              : tn('study.answersReviewBelow', result.total - result.score)}
          </p>
        </Finish>
      )}
      <ol class="test-list">
        {questions.map((q, qi) => {
          const r = resById[q.id];
          return (
            <li key={q.id} class={'test-q ' + (r ? (r.correct ? 'right' : 'wrong') : '')}>
              <span class="qnum">{qi + 1}</span>
              {q.type === 'matching' ? (
                <fieldset disabled={!!result}>
                  <legend>{t('study.matchEachPromptAnswer')}</legend>
                  {q.pairs.map((p) => {
                    const part = r?.parts?.find((x) => x.itemId === p.itemId);
                    return (
                      <div class={'match-row ' + (part ? (part.correct ? 'right' : 'wrong') : '')} key={p.itemId}>
                        <Md text={p.prompt} />
                        <select
                          aria-label={t('study.answer')}
                          value={answers[q.id]?.[p.itemId] ?? ''}
                          onChange={(e) => set1(q.id, { ...(answers[q.id] || {}), [p.itemId]: e.currentTarget.value })}
                        >
                          <option value="" disabled>
                            {t('study.choose')}
                          </option>
                          {q.answers.map((a, i) => (
                            <option key={i} value={a}>
                              {a.replace(/\s+/g, ' ').slice(0, 80)}
                            </option>
                          ))}
                        </select>
                        {part && !part.correct && (
                          <span class="expected-inline">
                            <Md text={p.answer} />
                          </span>
                        )}
                      </div>
                    );
                  })}
                </fieldset>
              ) : (
                <div class="q-body">
                  <IndexCard class="question small" style={q.item.style} side="prompt">
                    <CardFace item={q.item} set={set} side="prompt" />
                  </IndexCard>
                  {q.type === 'truefalse' && (
                    <fieldset disabled={!!result}>
                      <legend class="sr-only">{t('study.trueOrFalse')}</legend>
                      <p class="claim">
                        <Md text={q.shown} />
                      </p>
                      <div class="seg">
                        {[
                          [true, t('study.true')],
                          [false, t('study.false')],
                        ].map(([v, label]) => (
                          <label class={'seg-opt' + (answers[q.id] === v ? ' on' : '')} key={label}>
                            <input
                              type="radio"
                              name={q.id}
                              checked={answers[q.id] === v}
                              onChange={() => set1(q.id, v)}
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  {q.type === 'choice' && (
                    <fieldset disabled={!!result} class="radios">
                      <legend class="sr-only">{t('study.possibleAnswers')}</legend>
                      {q.options.map((o, i) => (
                        <label
                          class={
                            'radio' +
                            (answers[q.id] === i ? ' on' : '') +
                            (result && i === q.correctIndex ? ' right' : '')
                          }
                          key={i}
                        >
                          <input
                            type="radio"
                            name={q.id}
                            checked={answers[q.id] === i}
                            onChange={() => set1(q.id, i)}
                          />
                          <Md text={o} />
                        </label>
                      ))}
                    </fieldset>
                  )}
                  {q.type === 'written' && (
                    <label class="field">
                      <span class="sr-only">{t('study.yourAnswer')}</span>
                      <input
                        class="answer"
                        value={answers[q.id] ?? ''}
                        disabled={!!result}
                        autocomplete="off"
                        spellcheck={false}
                        placeholder={t('study.typeAnswer')}
                        onInput={(e) => set1(q.id, e.currentTarget.value)}
                      />
                    </label>
                  )}
                  {r && !r.correct && (
                    <p class="expected-inline">
                      {t('study.correctAnswer')}{' '}
                      {q.type === 'truefalse' ? (
                        q.isTrue ? (
                          t('study.true')
                        ) : (
                          t('study.false')
                        )
                      ) : (
                        <Md text={q.item.answer} />
                      )}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {!result && (
        <div class="actions sticky-actions">
          <span>{t('study.answered', { a: answered, n: questions.length })}</span>
          <button class="btn primary" onClick={submit}>
            {t('study.gradeTest')}
          </button>
        </div>
      )}
    </StudyShell>
  );
}
