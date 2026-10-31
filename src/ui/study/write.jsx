import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { shuffle } from '../../core/ids.js';
import { recordAnswer } from '../../core/progress.js';
import { checkAnswer } from '../../core/text.js';
import { IndexCard, Icon, Md, MediaImage, speak } from '../components.jsx';
import { useApp } from '../ctx.js';
import { t, tn } from '../i18n.js';
import { useItems } from '../useSet.js';
import { CardFace, langOf } from './face.jsx';
import { DirectionPicker, Finish, StudyEmpty, StudyShell } from './shell.jsx';

/**
 * Mode « Écrire » (énoncé affiché → on tape la réponse) et « Épeler » (on entend le terme → on le tape).
 * Les réponses fausses reviennent en fin de manche jusqu'à être justes.
 */
export function WriteMode({ set, progress, update, log, spell = false }) {
  const [direction, setDirection] = useState(spell ? 'def' : 'term');
  const [starredOnly, setStarredOnly] = useState(false);
  const [gen, setGen] = useState(0);
  const items = useItems(set, progress, {
    direction: spell ? 'def' : direction,
    starredOnly,
    need: spell ? 'plain' : 'text',
  });
  const hasStarred = Object.keys(progress.starred).length > 0;
  const title = spell ? t('mode.spell') : t('mode.write');
  const options = spell ? (
    <label class="check">
      <input
        type="checkbox"
        checked={starredOnly}
        disabled={!hasStarred}
        onChange={(e) => setStarredOnly(e.currentTarget.checked)}
      />
      <span>{t('study.starredOnly')}</span>
    </label>
  ) : (
    <DirectionPicker
      value={direction}
      onChange={setDirection}
      starred={starredOnly}
      onStarred={setStarredOnly}
      hasStarred={hasStarred}
    />
  );
  if (!items.length)
    return (
      <StudyShell set={set} title={title} options={options}>
        <StudyEmpty set={set} />
      </StudyShell>
    );
  return (
    <WriteRun
      key={[direction, starredOnly, gen, items.length].join('|')}
      {...{ set, progress, update, log, items, title, options, spell, restart: () => setGen((g) => g + 1) }}
    />
  );
}

function WriteRun({ set, update, log, items, title, options, spell, restart }) {
  const { settings } = useApp();
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const [queue, setQueue] = useState(() => shuffle(items.map((i) => i.id)));
  const [done, setDone] = useState(0);
  const [stats, setStats] = useState({ ok: 0, ko: 0 });
  const [text, setText] = useState('');
  const [fb, setFb] = useState(null);
  const inputRef = useRef();
  const started = useRef(Date.now());
  const item = byId.get(queue[0]);

  const say = () => item && speak(item.answer, langOf(set, item, 'answer'));
  const itemId = queue[0];
  const sayRef = useRef(say);
  sayRef.current = say;
  // nouvel item : on repart d'une saisie vide (et on le prononce en mode Épeler)
  useEffect(() => {
    setText('');
    setFb(null);
    started.current = Date.now();
    setTimeout(() => inputRef.current?.focus(), 30);
    if (spell && itemId) setTimeout(() => sayRef.current(), 150);
  }, [itemId, spell]);

  const commit = (ok, given) => {
    update((p) => recordAnswer(p, item.id, ok, { ms: Date.now() - started.current }));
    log({
      t: new Date().toISOString(),
      item: item.id,
      mode: spell ? 'spell' : 'write',
      rating: ok ? 3 : 1,
      ms: Date.now() - started.current,
    });

    setStats((s) => ({ ok: s.ok + (ok ? 1 : 0), ko: s.ko + (ok ? 0 : 1) }));
    setFb({ ok, given });
  };
  const next = () => {
    const ok = fb.ok;
    setQueue((q) => (ok ? q.slice(1) : [...q.slice(1), q[0]]));
    if (ok) setDone((d) => d + 1);
  };
  const submit = () => {
    if (fb) return fb.close ? null : next();
    if (!text.trim()) return;
    const r = checkAnswer(item.answer, text, { typoTolerance: settings.typoTolerance });
    if (r.close) return setFb({ close: true, given: text });
    commit(r.correct, text);
  };
  const override = () => {
    setFb({ ok: true, given: fb.given, overridden: true });
    setStats((s) => ({ ok: s.ok + 1, ko: s.ko - 1 }));
  };

  if (!item) {
    return (
      <StudyShell
        set={set}
        title={title}
        options={options}
        progress={{ value: items.length, max: items.length, label: t('common.progress') }}
      >
        <Finish
          title={t('study.done')}
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
          <p>
            {tn('study.correctAnswers', stats.ok)}, {tn('study.mistakes', stats.ko)}.
          </p>
        </Finish>
      </StudyShell>
    );
  }

  return (
    <StudyShell
      set={set}
      title={title}
      options={options}
      progress={{ value: done, max: items.length, label: t('common.progress') }}
    >
      <div class="stage learn">
        {spell ? (
          <IndexCard class="question spell" style={item.style} side="prompt">
            <div class="face-content">
              <button class="btn big" onClick={say}>
                <Icon name="speaker" size={26} /> {t('study.listenWord')}
              </button>
              {fb && (
                <p class="hint">
                  {t('study.definition', { d: '' })}
                  <Md text={item.prompt} />
                </p>
              )}
            </div>
          </IndexCard>
        ) : (
          <IndexCard class="question" style={item.style} side="prompt">
            <CardFace item={item} set={set} side="prompt" showHint={!!fb} />
          </IndexCard>
        )}
        <form class="answer-form" onSubmit={(e) => (e.preventDefault(), submit())}>
          <label class="sr-only" for="answer">
            {t('study.yourAnswer')}
          </label>
          <input
            id="answer"
            ref={inputRef}
            class={'answer ' + (fb ? (fb.ok ? 'right' : fb.close ? '' : 'wrong') : '')}
            value={text}
            readOnly={!!fb && !fb.close}
            autocomplete="off"
            autocapitalize="off"
            spellcheck={false}
            placeholder={t('study.typeAnswer')}
            onInput={(e) => setText(e.currentTarget.value)}
          />
          {!fb && (
            <button class="btn primary" type="submit">
              {t('study.submit')}
            </button>
          )}
        </form>
        {fb?.close && (
          <div class="feedback close" role="alert">
            <p>
              {t('study.almostExpectedAnswer')}{' '}
              <strong>
                <Md text={item.answer} />
              </strong>
            </p>
            <div class="actions">
              <button class="btn ok" onClick={() => commit(true, fb.given)}>
                {t('study.typo')}
              </button>
              <button class="btn bad" onClick={() => commit(false, fb.given)}>
                {t('study.iWasWrong')}
              </button>
            </div>
          </div>
        )}
        {fb && !fb.close && (
          <div class={'feedback ' + (fb.ok ? 'ok' : 'bad')} role="status">
            <p class="verdict">
              {fb.ok ? (fb.overridden ? t('study.countedCorrect') : t('study.correct')) : t('study.expectedAnswer')}
            </p>
            {!fb.ok && (
              <div class="expected">
                <Md text={item.kind === 'cloze' ? item.reveal : item.answer} />
                <MediaImage path={item.answerImage} />
              </div>
            )}
            <div class="actions">
              {!fb.ok && (
                <button class="btn" onClick={override}>
                  {t('study.iWasRight')}
                </button>
              )}
              <button class="btn primary" autofocus onClick={next}>
                {t('study.continue')} <kbd>↵</kbd>
              </button>
            </div>
          </div>
        )}
      </div>
    </StudyShell>
  );
}
