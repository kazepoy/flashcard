import { useEffect, useRef, useState } from 'preact/hooks';
import { explainAnswer, aiConfigured, loadAiConfig } from '../../ai/client.js';
import { LearnSession } from '../../core/learn.js';
import { applyMastery, recordAnswer } from '../../core/progress.js';
import { checkAnswer } from '../../core/text.js';
import { useApp } from '../ctx.js';
import { IndexCard, Md, MediaImage, useKeys } from '../components.jsx';
import { errorText, t, tn } from '../i18n.js';
import { useItems } from '../useSet.js';
import { CardFace } from './face.jsx';
import { DirectionPicker, Finish, StudyEmpty, StudyShell } from './shell.jsx';

export function Learn({ set, progress, update, log }) {
  const [direction, setDirection] = useState('term');
  const [starredOnly, setStarredOnly] = useState(false);
  const [mc, setMc] = useState(true);
  const [wr, setWr] = useState(true);
  const [gen, setGen] = useState(0);
  const items = useItems(set, progress, { direction, starredOnly, need: 'text' });
  const hasStarred = Object.keys(progress.starred).length > 0;

  const options = (
    <>
      <DirectionPicker
        value={direction}
        onChange={setDirection}
        starred={starredOnly}
        onStarred={setStarredOnly}
        hasStarred={hasStarred}
      />
      <label class="check">
        <input
          type="checkbox"
          checked={mc}
          onChange={(e) => {
            const v = e.currentTarget.checked;
            setMc(v);
            if (!v && !wr) setWr(true);
          }}
        />
        <span>{t('study.multipleChoice')}</span>
      </label>
      <label class="check">
        <input
          type="checkbox"
          checked={wr}
          onChange={(e) => {
            const v = e.currentTarget.checked;
            setWr(v);
            if (!v && !mc) setMc(true);
          }}
        />
        <span>{t('study.writtenAnswer')}</span>
      </label>
    </>
  );
  if (items.length < 1)
    return (
      <StudyShell set={set} title={t('mode.learn')} options={options}>
        <StudyEmpty set={set} />
      </StudyShell>
    );
  return (
    <LearnRun
      key={[direction, starredOnly, mc, wr, gen, items.length].join('|')}
      {...{ set, progress, update, log, items, options, mc, wr, restart: () => setGen((g) => g + 1) }}
    />
  );
}

function LearnRun({ set, progress, update, log, items, options, mc, wr, restart }) {
  const { settings } = useApp();
  const [session] = useState(() => {
    const mastery = Object.fromEntries(items.map((i) => [i.id, progress.items[i.id]?.mastery ?? 0]));
    return new LearnSession(items, { mastery, multipleChoice: mc, written: wr });
  });
  const [q, setQ] = useState(() => session.next());
  const [feedback, setFeedback] = useState(null); // {correct, given, close?}
  const [text, setText] = useState('');
  const [explain, setExplain] = useState(null);
  const inputRef = useRef();
  const startedAt = useRef(Date.now());
  const pg = session.progress();

  useEffect(() => {
    startedAt.current = Date.now();
    setText('');
    setFeedback(null);
    setExplain(null);
    if (q?.kind === 'write') setTimeout(() => inputRef.current?.focus(), 30);
  }, [q]);

  const commit = (correct, given) => {
    const item = q.item;
    session.answer(correct);
    update((p) => {
      recordAnswer(p, item.id, correct, { ms: Date.now() - startedAt.current });
      applyMastery(p, { [item.id]: session.level.get(item.id) });
    });
    log({
      t: new Date().toISOString(),
      item: item.id,
      mode: 'learn',
      rating: correct ? 3 : 1,
      ms: Date.now() - startedAt.current,
    });

    setFeedback({ correct, given });
  };
  const next = () => setQ(session.next());

  const submitText = () => {
    if (feedback) return next();
    const r = checkAnswer(q.item.answer, text, { typoTolerance: settings.typoTolerance });
    if (!text.trim()) return;
    if (r.close) return setFeedback({ close: true, given: text });
    commit(r.correct, text);
  };
  const override = () => {
    // « J'avais raison » : on corrige la dernière réponse (la session l'avait comptée fausse)
    const id = q.item.id;
    session.stats.get(id).wrong--;
    session.stats.get(id).correct++;
    session.roundWrong--;
    session.roundCorrect++;
    session.level.set(id, Math.min(session.maxLevel, (session.level.get(id) || 0) + 1));
    const i = session.queue.indexOf(id);
    if (i >= 0 && session.level.get(id) >= session.maxLevel) session.queue.splice(i, 1);
    update((p) => {
      applyMastery(p, { [id]: session.level.get(id) });
      p.items[id].wrong = Math.max(0, (p.items[id].wrong || 1) - 1);
      p.items[id].correct = (p.items[id].correct || 0) + 1;
    });
    setFeedback({ correct: true, given: feedback.given, overridden: true });
  };

  useKeys({
    ...(q?.kind === 'choice' && !feedback
      ? { 1: () => pick(0), 2: () => pick(1), 3: () => pick(2), 4: () => pick(3) }
      : {}),
    Enter: () => feedback && !feedback.close && next(),
  });

  const pick = (i) => {
    if (!q || q.kind !== 'choice' || feedback || i >= q.options.length) return;
    commit(i === q.correctIndex, q.options[i]);
  };

  const askExplain = async () => {
    setExplain({ loading: true });
    try {
      const out = await explainAnswer(
        {
          prompt: q.item.prompt,
          expected: q.item.answer,
          given: feedback.given,
        },
        loadAiConfig(),
      );
      setExplain({ text: out });
    } catch (e) {
      setExplain({ error: errorText(e) });
    }
  };

  const shell = (children) => (
    <StudyShell
      set={set}
      title={t('mode.learn')}
      options={options}
      progress={{ value: pg.mastered, max: pg.total, label: t('study.masteredLabel') }}
    >
      {children}
    </StudyShell>
  );

  if (!q || session.finished) {
    return shell(
      <Finish
        title={t('study.setMastered')}
        actions={
          <>
            <button class="btn primary" onClick={restart}>
              {t('study.startOver')}
            </button>
            <a class="btn" href={`#/set/${set.id}`}>
              {t('study.backSet')}
            </a>
          </>
        }
      >
        <p>{tn('study.itemsLearned', pg.total)}</p>
      </Finish>,
    );
  }
  if (q.roundEnd) {
    return shell(
      <Finish
        title={t('study.roundComplete', { n: q.round })}
        actions={
          <button class="btn primary" autofocus onClick={() => (session.continueRound(), setQ(session.next()))}>
            {t('study.nextRound')}
          </button>
        }
      >
        <p>{t('study.correctMissed', { ok: q.correct, ko: q.wrong })}</p>
        <p>{t('study.mastered', { m: q.mastered, n: q.total })}</p>
      </Finish>,
    );
  }

  const item = q.item;
  const wrongNow = feedback && !feedback.close && !feedback.correct;
  return shell(
    <div class="stage learn">
      <IndexCard class="question" style={item.style} side="prompt">
        <CardFace item={item} set={set} side="prompt" showHint={!!feedback} />
      </IndexCard>

      {q.kind === 'choice' && (
        <ol class="choices" role="group" aria-label={t('study.possibleAnswers')}>
          {q.options.map((o, i) => {
            const state = feedback ? (i === q.correctIndex ? 'right' : o === feedback.given ? 'wrong' : '') : '';
            return (
              <li key={i}>
                <button class={'choice ' + state} disabled={!!feedback} onClick={() => pick(i)}>
                  <kbd>{i + 1}</kbd>
                  <Md text={o} />
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {q.kind === 'write' && (
        <form class="answer-form" onSubmit={(e) => (e.preventDefault(), submitText())}>
          <label class="sr-only" for="answer">
            {t('study.yourAnswer')}
          </label>
          <input
            id="answer"
            ref={inputRef}
            class={'answer ' + (feedback ? (feedback.correct ? 'right' : feedback.close ? '' : 'wrong') : '')}
            value={text}
            autocomplete="off"
            autocapitalize="off"
            spellcheck={false}
            readOnly={!!feedback && !feedback.close}
            placeholder={t('study.typeAnswer')}
            onInput={(e) => setText(e.currentTarget.value)}
          />
          {!feedback && (
            <button class="btn primary" type="submit">
              {t('study.submit')}
            </button>
          )}
        </form>
      )}

      {feedback?.close && (
        <div class="feedback close" role="alert">
          <p>
            {t('study.almostExpectedAnswer')}{' '}
            <strong>
              <Md text={item.answer} />
            </strong>
          </p>
          <div class="actions">
            <button class="btn ok" onClick={() => commit(true, feedback.given)}>
              {t('study.typo')}
            </button>
            <button class="btn bad" onClick={() => commit(false, feedback.given)}>
              {t('study.iWasWrong')}
            </button>
          </div>
        </div>
      )}

      {feedback && !feedback.close && (
        <div class={'feedback ' + (feedback.correct ? 'ok' : 'bad')} role="status">
          <p class="verdict">
            {feedback.correct
              ? feedback.overridden
                ? t('study.countedCorrect')
                : t('study.correct')
              : t('study.expectedAnswer')}
          </p>
          {(wrongNow || q.kind === 'choice') && !feedback.correct && (
            <div class="expected">
              <Md text={item.kind === 'cloze' ? item.reveal : item.answer} />
              <MediaImage path={item.answerImage} />
            </div>
          )}
          {item.extra && feedback.correct && <Md class="extra" text={item.extra} />}
          <div class="actions">
            {wrongNow && q.kind === 'write' && (
              <button class="btn" onClick={override}>
                {t('study.iWasRight')}
              </button>
            )}
            {wrongNow && aiConfigured(loadAiConfig()) && !explain && (
              <button class="btn" onClick={askExplain}>
                {t('study.explain')}
              </button>
            )}
            <button class="btn primary" autofocus onClick={next}>
              {t('study.continue')} <kbd>↵</kbd>
            </button>
          </div>
          {explain && <p class="explain">{explain.loading ? t('study.explaining') : explain.error || explain.text}</p>}
        </div>
      )}
    </div>,
  );
}
