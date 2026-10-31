import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Scheduler, SrsSession, defaultBoost, Grade, humanInterval, AHEAD_DAYS } from '../../core/srs.js';
import { applySrsResult } from '../../core/progress.js';
import { todayMore, todayQueue } from '../../core/daily.js';
import { FlipCard, useKeys } from '../components.jsx';
import { useApp } from '../ctx.js';
import { errorText, t, tn } from '../i18n.js';
import { useItems } from '../useSet.js';
import { CardFace } from './face.jsx';
import { Finish, StudyEmpty, StudyShell } from './shell.jsx';

const unitLabel = { min: 'min', h: 'h', d: 'j', mo: 'mois', y: 'an(s)' };
const unitLabelEn = { min: 'min', h: 'h', d: 'd', mo: 'mo', y: 'y' };

export function intervalText(from, to, lang) {
  const h = humanInterval(from, to);
  const u = (lang === 'en' ? unitLabelEn : unitLabel)[h.unit];
  return `${h.lt ? '<' : ''}${h.value} ${u}`;
}

/** Révision espacée FSRS : file du jour, 4 notes, aperçu des intervalles. */
export function Review({ set, progress, update, log, variant }) {
  const { settings } = useApp();
  const [direction, setDirection] = useState('term');
  const items = useItems(set, progress, { direction });
  // « étudier plus » (#/set/<id>/study/review/more) : au-delà des limites du jour, ou en avance
  const [boost, setBoost] = useState(() =>
    variant === 'more' ? defaultBoost(todayMore(items, progress, settings)) : null,
  );
  const options = (
    <label class="field-inline">
      <span>{t('common.direction')}</span>
      <select value={direction} onChange={(e) => setDirection(e.currentTarget.value)}>
        <option value="term">{t('common.directionTermToDef')}</option>
        <option value="def">{t('common.directionDefToTerm')}</option>
        <option value="both">{t('common.directionBoth')}</option>
      </select>
    </label>
  );
  if (!items.length)
    return (
      <StudyShell set={set} title={t('mode.review')} options={options}>
        <StudyEmpty set={set} />
      </StudyShell>
    );
  return (
    <ReviewRun
      key={direction + JSON.stringify(boost)}
      {...{ set, progress, update, log, items, options, settings, boost, setBoost }}
    />
  );
}

function ReviewRun({ set, progress, update, log, items, options, settings, boost, setBoost }) {
  const { lang, toast } = useApp();
  const scheduler = useMemo(() => new Scheduler({ retention: settings.retention }), [settings.retention]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  // une séance par montage (la clé du composant change avec le sens et « étudier plus »)
  const [session] = useState(
    () => new SrsSession(todayQueue(items, progress, settings, boost), progress, scheduler, byId),
  );
  const [item, setItem] = useState(() => session.current());
  const [shown, setShown] = useState(false);
  // chaque note fait passer au tour suivant, même si la séance représente la même carte
  const [turn, setTurn] = useState(0);
  const started = useRef(Date.now());

  useEffect(() => {
    started.current = Date.now();
    setShown(false);
  }, [item?.id, turn]);

  // état de la séance (une carte en réapprentissage revient avec son nouvel état)
  const preview = item ? scheduler.preview(session.srs[item.id] ?? null, new Date()) : null;

  const grade = (g) => {
    if (!item || !shown) return;
    try {
      const now = new Date();
      const ms = now - started.current;
      const res = session.answer(item.id, g, now, ms);
      update((p) => applySrsResult(p, res, now, ms));
      log(res.log);
      setItem(session.current());
      setTurn((n) => n + 1);
    } catch (e) {
      toast(errorText(e), 'bad');
    }
  };

  useKeys({
    ' ': () => setShown(true),
    Enter: () => (shown ? grade(Grade.Good) : setShown(true)),
    1: () => grade(Grade.Again),
    2: () => grade(Grade.Hard),
    3: () => grade(Grade.Good),
    4: () => grade(Grade.Easy),
  });

  const rem = session.remaining();
  const title = t('mode.review');

  if (!item) {
    const nextDue = Object.values(progress.items)
      .map((x) => x.srs && new Date(x.srs.due))
      .filter((d) => d && d > new Date())
      .sort((a, b) => a - b)[0];
    return (
      <StudyShell
        set={set}
        title={title}
        options={options}
        progress={{ value: session.total, max: session.total || 1, label: t('common.progress') }}
      >
        <Finish
          title={session.total ? t('study.sessionComplete') : t('study.nothingReviewNow')}
          actions={
            <>
              <MoreButtons more={todayMore(items, progress, settings)} onBoost={setBoost} />
              <a class="btn primary" href={`#/set/${set.id}`}>
                {t('study.backSet')}
              </a>
            </>
          }
        >
          <p>{session.total ? tn('study.cardsReviewed', session.done) : t('study.todaysLimitsReachedAll')}</p>
          {nextDue && <p>{t('study.nextReview', { d: intervalText(new Date(), nextDue, lang) })}</p>}
        </Finish>
      </StudyShell>
    );
  }

  const labels = {
    [Grade.Again]: t('srs.rating.again'),
    [Grade.Hard]: t('srs.rating.hard'),
    [Grade.Good]: t('srs.rating.good'),
    [Grade.Easy]: t('srs.rating.easy'),
  };
  return (
    <StudyShell
      set={set}
      title={title}
      options={options}
      progress={{
        value: session.done,
        secondary: session.seen.size,
        max: session.total,
        label: t('common.progress'),
        caption: `${tn('study.progressDone', session.done)} · ${tn('study.progressSeen', session.seen.size, { total: session.total })}`,
      }}
    >
      <div class="stage">
        <div class="stage-top counts" aria-label={t('study.remaining')}>
          {/* restant dans la séance : nouvelles, en apprentissage (reviennent sous peu), à réviser */}
          <span class="pill new">{tn('study.pillNew', rem.new)}</span>
          <span class="pill learn">{tn('study.pillLearn', rem.learning)}</span>
          <span class="pill due">{tn('study.pillDue', rem.review)}</span>
        </div>
        <FlipCard
          flipped={shown}
          onFlip={() => setShown((s) => !s)}
          frontStyle={item.style}
          backStyle={item.style}
          front={<CardFace item={item} set={set} side="prompt" showHint />}
          back={<CardFace item={item} set={set} side="answer" recall />}
        />
        <div class="stage-actions grades">
          {!shown ? (
            <button class="btn primary wide" onClick={() => setShown(true)}>
              {t('study.showAnswer')} <kbd>{t('common.space')}</kbd>
            </button>
          ) : (
            [Grade.Again, Grade.Hard, Grade.Good, Grade.Easy].map((g) => (
              <button key={g} class={'btn grade g' + g} onClick={() => grade(g)}>
                <span>{labels[g]}</span>
                <small>{intervalText(new Date(), preview[g], lang)}</small>
                <kbd>{g}</kbd>
              </button>
            ))
          )}
        </div>
      </div>
    </StudyShell>
  );
}

/** Étudier plus : chaque bouton n'apparaît que s'il reste quelque chose à étudier. */
function MoreButtons({ more, onBoost }) {
  const moreNew = Math.min(10, more.newLeft);
  const moreReviews = Math.min(50, more.reviewsLeft);
  return (
    <>
      {moreNew > 0 && (
        <button class="btn" onClick={() => onBoost({ moreNew })}>
          {tn('study.moreNew', moreNew)}
        </button>
      )}
      {moreReviews > 0 && (
        <button class="btn" onClick={() => onBoost({ moreReviews })}>
          {tn('study.moreReviews', moreReviews)}
        </button>
      )}
      {more.ahead > 0 && (
        <button class="btn" onClick={() => onBoost({ aheadDays: AHEAD_DAYS })}>
          {t('study.reviewAheadOverDays', { n: more.ahead, d: AHEAD_DAYS })}
        </button>
      )}
    </>
  );
}
