import { useEffect, useMemo, useState } from 'preact/hooks';
import { shuffle } from '../../core/ids.js';
import { recordAnswer, toggleStar } from '../../core/progress.js';
import { FlipCard, Icon, useKeys } from '../components.jsx';
import { t, tn } from '../i18n.js';
import { useItems } from '../useSet.js';
import { CardFace } from './face.jsx';
import { DirectionPicker, Finish, StudyEmpty, StudyShell } from './shell.jsx';

export function Flashcards({ set, progress, update, log }) {
  const [direction, setDirection] = useState('term');
  const [starredOnly, setStarredOnly] = useState(false);
  const [random, setRandom] = useState(false);
  const items = useItems(set, progress, { direction, starredOnly });
  const [queue, setQueue] = useState([]);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [wrong, setWrong] = useState([]);
  const [rightCount, setRightCount] = useState(0);
  const hasStarred = Object.keys(progress.starred).length > 0;

  const restart = (ids) => {
    setQueue(ids);
    setPos(0);
    setFlipped(false);
    setWrong([]);
    setRightCount(0);
  };
  useEffect(() => {
    const ids = items.map((i) => i.id);
    restart(random ? shuffle(ids) : ids);
  }, [items, random]);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const item = byId.get(queue[pos]);
  const done = queue.length > 0 && pos >= queue.length;

  const mark = (known) => {
    if (!item) return;
    update((p) => recordAnswer(p, item.id, known));
    log({ t: new Date().toISOString(), item: item.id, mode: 'flashcards', rating: known ? 3 : 1 });

    if (known) setRightCount((n) => n + 1);
    else setWrong((w) => [...w, item.id]);
    setFlipped(false);
    setPos((p) => p + 1);
  };
  const flip = () => {
    if (item) setFlipped((f) => !f);
  };
  const star = () => {
    update((p) => toggleStar(p, item.cardId));
  };

  useKeys({
    ' ': flip,
    Enter: flip,
    ArrowRight: () => (flipped ? mark(true) : flip()),
    ArrowLeft: () => (flipped ? mark(false) : setPos((p) => Math.max(0, p - 1))),
    s: star,
  });

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
        <input type="checkbox" checked={random} onChange={(e) => setRandom(e.currentTarget.checked)} />
        <span>{t('study.shuffle')}</span>
      </label>
    </>
  );

  if (!items.length)
    return (
      <StudyShell set={set} title={t('mode.flashcards')} options={options}>
        <StudyEmpty set={set} />
      </StudyShell>
    );

  if (done) {
    return (
      <StudyShell
        set={set}
        title={t('mode.flashcards')}
        options={options}
        progress={{ value: queue.length, max: queue.length, label: t('common.progress') }}
      >
        <Finish
          title={wrong.length ? t('study.turnComplete') : t('study.knowAll')}
          actions={
            <>
              {wrong.length > 0 && (
                <button class="btn primary" onClick={() => restart(wrong)}>
                  {t('study.reviewMissed', { n: wrong.length })}
                </button>
              )}
              <button
                class="btn"
                onClick={() => restart(random ? shuffle(items.map((i) => i.id)) : items.map((i) => i.id))}
              >
                {t('study.startOver')}
              </button>
            </>
          }
        >
          <p>
            {tn('study.cardsKnown', rightCount)} {wrong.length > 0 && tn('study.toReview', wrong.length)}
          </p>
        </Finish>
      </StudyShell>
    );
  }
  if (!item) return null;

  return (
    <StudyShell
      set={set}
      title={t('mode.flashcards')}
      options={options}
      progress={{ value: pos, max: queue.length, label: t('common.progress') }}
    >
      <div class="stage">
        <div class="stage-top">
          <span class="counter">
            {pos + 1} / {queue.length}
          </span>
          <button
            class={'icon-btn star' + (progress.starred[item.cardId] ? ' on' : '')}
            onClick={star}
            aria-pressed={!!progress.starred[item.cardId]}
            aria-label={t('common.star')}
            title={t('study.starS')}
          >
            <Icon name="star" fill={!!progress.starred[item.cardId]} />
          </button>
        </div>
        <FlipCard
          flipped={flipped}
          onFlip={flip}
          frontStyle={item.style}
          backStyle={item.style}
          front={<CardFace item={item} set={set} side="prompt" showHint />}
          back={<CardFace item={item} set={set} side="answer" recall />}
        />
        <div class="stage-actions">
          {flipped ? (
            <>
              <button class="btn bad" onClick={() => mark(false)}>
                {t('srs.rating.again')} <kbd>←</kbd>
              </button>
              <button class="btn ok" onClick={() => mark(true)}>
                {t('study.iKnow')} <kbd>→</kbd>
              </button>
            </>
          ) : (
            <>
              <button class="btn" onClick={() => setPos((p) => Math.max(0, p - 1))} disabled={pos === 0}>
                {t('study.previous')} <kbd>←</kbd>
              </button>
              <button class="btn primary" onClick={flip}>
                {t('study.flip')} <kbd>{t('common.space')}</kbd>
              </button>
            </>
          )}
        </div>
      </div>
    </StudyShell>
  );
}
