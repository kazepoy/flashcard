import { useEffect, useRef, useState } from 'preact/hooks';
import { GravityGame } from '../../core/games.js';
import { recordAnswer } from '../../core/progress.js';
import { useApp } from '../ctx.js';
import { Finish, StudyEmpty, StudyShell } from './shell.jsx';
import { DirectionPicker } from './shell.jsx';
import { t } from '../i18n.js';
import { useItems } from '../useSet.js';

export function GravityMode({ set, progress, update, log }) {
  const [direction, setDirection] = useState('term');
  const [starredOnly, setStarredOnly] = useState(false);
  const [gen, setGen] = useState(0);
  const items = useItems(set, progress, { direction, starredOnly, need: 'plain' });
  const hasStarred = Object.keys(progress.starred).length > 0;
  const options = (
    <DirectionPicker
      value={direction}
      onChange={setDirection}
      starred={starredOnly}
      onStarred={setStarredOnly}
      hasStarred={hasStarred}
    />
  );
  if (items.length < 3)
    return (
      <StudyShell set={set} title={t('mode.gravity')} options={options}>
        <StudyEmpty set={set} message={t('study.needLeast3Cards')} />
      </StudyShell>
    );
  return (
    <GravityRun
      key={[direction, starredOnly, gen].join('|')}
      {...{ set, progress, update, log, items, options, again: () => setGen((g) => g + 1) }}
    />
  );
}

function GravityRun({ set, progress, update, log, items, options, again }) {
  const { settings } = useApp();
  const game = useRef(null);
  if (!game.current) game.current = new GravityGame(items, { typoTolerance: false });
  const [, frame] = useState(0);
  const [text, setText] = useState('');
  const [flash, setFlash] = useState(null);
  const [over, setOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const inputRef = useRef();
  const reduced = useRef(matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    let raf;
    let last = performance.now();
    const loop = (nowMs) => {
      const dt = Math.min(100, nowMs - last);
      last = nowMs;
      if (!paused && !game.current.over) {
        const { hit } = game.current.tick(dt * (reduced.current ? 0.6 : 1));
        if (hit.length) update((p) => hit.forEach((a) => recordAnswer(p, a.itemId, false)));
        if (game.current.over) {
          setOver(true);
          const score = game.current.score;
          update((p) => {
            const g = (p.games.gravity ||= {});
            g.best = Math.max(g.best ?? 0, score);
          });
          log({ t: new Date().toISOString(), item: '*', mode: 'gravity', rating: 3, ms: 0 });
        }
        frame((n) => n + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    inputRef.current?.focus();
    return () => cancelAnimationFrame(raf);
  }, [paused, update, log]);

  const submit = (e) => {
    e.preventDefault();
    const r = game.current.submit(text);
    if (r.ok) {
      update((p) => recordAnswer(p, r.asteroid.itemId, true));
      setFlash({ id: r.asteroid.id, text: r.asteroid.answer });
      setTimeout(() => setFlash(null), 700);
    }
    setText('');
  };

  const g = game.current;
  if (over) {
    return (
      <StudyShell set={set} title={t('mode.gravity')} options={options}>
        <Finish
          title={t('study.gameOver')}
          actions={
            <>
              <button class="btn primary" onClick={again}>
                {t('study.playAgain')}
              </button>
              <a class="btn" href={`#/set/${set.id}`}>
                {t('study.backSet')}
              </a>
            </>
          }
        >
          <p>
            {t('study.score', { s: g.score })} — {t('study.best', { s: progress.games.gravity?.best ?? g.score })}
          </p>
          <p>{t('study.asteroidsDestroyed', { n: g.destroyed })}</p>
        </Finish>
      </StudyShell>
    );
  }
  return (
    <StudyShell set={set} title={t('mode.gravity')} options={options}>
      <div class="gravity">
        <div class="hud">
          <span>{t('study.score', { s: g.score })}</span>
          <span>{t('study.level', { n: g.level })}</span>
          <span aria-label={t('study.lives', { n: g.lives })}>{'♥'.repeat(Math.max(0, g.lives)) || '—'}</span>
          <button class="btn small" onClick={() => setPaused((p) => !p)}>
            {paused ? t('study.resume') : t('study.pause')}
          </button>
        </div>
        <div class="sky" role="img" aria-label={t('study.gameAreaAsteroidsFalling')}>
          {g.asteroids.map((a) => (
            <div class="asteroid" key={a.id} style={{ left: a.x + '%', top: a.y + '%' }}>
              {a.prompt.slice(0, 60)}
            </div>
          ))}
          {flash && (
            <div class="boom" aria-live="polite">
              {flash.text}
            </div>
          )}
          <div class="ground" />
        </div>
        <form class="answer-form" onSubmit={submit}>
          <label class="sr-only" for="g-answer">
            {t('study.yourAnswer')}
          </label>
          <input
            id="g-answer"
            ref={inputRef}
            class="answer"
            value={text}
            autocomplete="off"
            autocapitalize="off"
            spellcheck={false}
            placeholder={t('study.typeAnswerEnter')}
            onInput={(e) => setText(e.currentTarget.value)}
            disabled={paused}
          />
        </form>
        {settings && <p class="muted small">{t('study.typeAsteroidsExactAnswer')}</p>}
      </div>
    </StudyShell>
  );
}
