// Statistiques détaillées : toute la bibliothèque ou un jeu (#/stats, #/stats/<setId>).
import { useMemo, useState } from 'preact/hooks';
import {
  activeProgress,
  answerButtons,
  dailyActivity,
  difficultyHistogram,
  futureDue,
  hourly,
  intervalHistogram,
  itemCounts,
  retrievabilityHistogram,
  reviewsPerDay,
  scopeStatsEntries,
  streak,
  trueRetention,
  KINDS,
} from '../core/analytics.js';
import { Scheduler } from '../core/srs.js';
import { Calendar, Columns, SplitBar } from './charts.jsx';
import { Empty, InfoTip } from './components.jsx';
import { go, href, useApp, useAsync } from './ctx.js';
import { errorText, locale, percent, t, tn } from './i18n.js';

// un état = un nom, une explication, une couleur, partout ; ordre : du souvenir le moins solide au plus solide
const STATE = () => ({
  new: { label: t('common.new'), help: t('stats.help.new'), color: 'var(--s-neutral)' },
  learn: { label: t('stats.learning'), help: t('stats.help.learn'), color: 'var(--s1)' },
  relearn: { label: t('stats.relearning'), help: t('stats.help.relearn'), color: 'var(--s4)' },
  young: { label: t('stats.young'), help: t('stats.help.young'), color: 'var(--s2)' },
  mature: { label: t('stats.mature'), help: t('stats.help.mature'), color: 'var(--s3)' },
});
const KIND_SERIES = () => KINDS.map((key) => ({ key, ...STATE()[key] }));
const RANGES = [
  [30, 'stats.range.30d'],
  [90, 'stats.range.90d'],
  [365, 'stats.range.365d'],
];

export function StatsPage({ setId = null }) {
  const { lib, version, settings } = useApp();
  const [range, setRange] = useState(30);
  const scheduler = useMemo(() => new Scheduler({ retention: settings.retention }), [settings.retention]);

  const { data, loading, error } = useAsync(async () => {
    const { sets } = await lib.listSets();
    const out = [];
    for (const s of sets) {
      const set = await lib.loadSet(s.id);
      if (!set) continue;
      out.push({ set, progress: await lib.loadProgress(s.id), log: await lib.readLog(s.id) });
    }
    return out;
  }, [lib, version]);

  const { scoped, inactiveSets } = useMemo(() => scopeStatsEntries(data, setId), [data, setId]);
  const [now] = useState(() => new Date()); // instant de référence de la page
  const stats = useMemo(() => {
    if (!scoped.length) return null;
    // état actuel : seulement les cartes qui existent et ne sont pas suspendues ; l'historique (logs) reste entier
    const active = scoped.map((x) => activeProgress(x.set, x.progress));
    const progresses = active.map((a) => a.progress);
    const totalItems = active.reduce((n, a) => n + a.totalItems, 0);
    const suspendedCards = active.reduce((n, a) => n + a.suspendedCards, 0);
    const logs = scoped.flatMap((x) => x.log);
    const activity = dailyActivity(progresses, 365, now, logs);
    const today = activity[activity.length - 1];
    const due = futureDue(progresses, 30, now);
    const retention = trueRetention(logs, now);
    return {
      activity,
      today,
      todayReviews: reviewsPerDay(logs, 1, now)[0],
      streak: streak(activity),
      due,
      retention,
      counts: itemCounts(progresses, totalItems),
      suspendedCards,
      intervals: intervalHistogram(progresses),
      difficulty: difficultyHistogram(progresses),
      recall: retrievabilityHistogram(progresses, (s, n) => scheduler.retrievability(s, n), now),
      hours: hourly(logs, 30, now),
      buttons: answerButtons(logs, 30, now),
      logs,
    };
  }, [scoped, scheduler, now]);

  const reviews = useMemo(() => (stats ? reviewChartData(stats.logs, range, now) : []), [stats, range, now]);

  if (error)
    return (
      <p class="notice bad" role="alert">
        {errorText(error)}
      </p>
    );
  if (loading && !data) return <p class="muted pad">{t('common.loading')}</p>;
  if (!data?.length)
    return (
      <Empty title={t('stats.noStatistics')}>
        <p>{t('stats.createImportSetGet')}</p>
        <a class="btn" href={href('')}>
          {t('common.backLibrary')}
        </a>
      </Empty>
    );
  if (!stats)
    return (
      <Empty title={setId ? t('common.setNotFound') : t('stats.noStatistics')}>
        {inactiveSets > 0 && <p>{tn('stats.inactiveSetsNotCounted', inactiveSets)}</p>}
        <a class="btn" href={href(setId ? 'stats' : '')}>
          {setId ? t('stats.wholeLibrary') : t('common.backLibrary')}
        </a>
      </Empty>
    );

  const f = new Intl.NumberFormat(locale());
  const pct = (r) => (r == null ? '—' : percent(Math.round(r * 100)));
  const minutes = Math.round(stats.today.ms / 60000);
  const todayRet = stats.retention[0].total;
  const dueNow = stats.due.overdue + stats.due.perDay[0];
  const series = KIND_SERIES();
  const dfShort = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' });
  const scope = setId ? scoped[0].set : null;

  return (
    <div class="stats">
      <header class="lib-head">
        <div>
          {scope && (
            <p class="crumbs">
              <a href={href(`set/${scope.id}`)}>{scope.title}</a>
            </p>
          )}
          <h1>{t('common.statistics')}</h1>
        </div>
        <label class="field-inline">
          <span>{t('stats.scope')}</span>
          <select
            value={setId || ''}
            onChange={(e) => go(e.currentTarget.value ? `stats/${e.currentTarget.value}` : 'stats')}
          >
            <option value="">{t('stats.wholeLibrary')}</option>
            {data.map((x) => (
              <option key={x.set.id} value={x.set.id}>
                {x.set.inactive ? `${x.set.title} (${t('common.inactive').toLowerCase()})` : x.set.title}
              </option>
            ))}
          </select>
        </label>
      </header>

      {scope?.inactive && (
        <p class="notice small inactive-note" role="note">
          {t('stats.inactiveSetNotice')}
        </p>
      )}
      {!scope && inactiveSets > 0 && <p class="muted small">{tn('stats.inactiveSetsNotCounted', inactiveSets)}</p>}

      <section class="kpis" aria-label={t('stats.period.today')}>
        <Tile
          label={t('stats.answersToday')}
          value={f.format(stats.today.n)}
          sub={minutes ? tn('stats.minutes', minutes) : null}
        />
        <Tile
          label={t('stats.spacedReviews')}
          value={f.format(stats.todayReviews.total)}
          sub={todayRet.n ? t('stats.successRate', { p: pct(todayRet.rate) }) : null}
        />
        <Tile
          label={t('stats.dueNow')}
          value={f.format(dueNow)}
          sub={stats.due.overdue ? t('stats.includingOverdue', { n: f.format(stats.due.overdue) }) : null}
        />
        <Tile label={t('common.streak')} value={tn('common.days', stats.streak)} />
      </section>

      <section class="panel">
        <Calendar title={t('stats.activityOverYearAll')} help={t('stats.help.activity')} days={stats.activity} />
      </section>

      <section class="panel">
        <div class="section-head">
          <h2>{t('stats.spacedReviews')}</h2>
          <div class="seg" role="group" aria-label={t('common.period')}>
            {RANGES.map(([d, l]) => (
              <button
                key={d}
                class={'seg-opt' + (range === d ? ' on' : '')}
                aria-pressed={range === d}
                onClick={() => setRange(d)}
              >
                {t(l)}
              </button>
            ))}
          </div>
        </div>
        <Columns
          title={range === 365 ? t('stats.reviewsPerWeek') : t('stats.reviewsPerDay')}
          help={t('stats.help.reviews')}
          data={reviews}
          series={series}
          labelEvery={range === 30 ? 5 : range === 90 ? 15 : 8}
          empty={t('stats.noSpacedRepetitionDuring')}
        />
      </section>

      <div class="grid2">
        <section class="panel">
          <h2>{t('stats.upcoming')}</h2>
          <Columns
            title={t('stats.cardsDueNext30')}
            help={t('stats.help.due')}
            data={stats.due.perDay.map((n, i) => {
              const d = new Date(now);
              d.setDate(d.getDate() + i);
              return {
                label: i === 0 ? t('stats.period.today') : dfShort.format(d),
                short: i === 0 ? t('stats.todayShort') : `+${i}`,
                values: { n },
                note: i === 0 && stats.due.overdue ? t('stats.overdue', { n: stats.due.overdue }) : null,
              };
            })}
            series={[{ key: 'n', label: t('common.cards'), color: 'var(--s1)' }]}
            labelEvery={5}
            empty={t('stats.nothingScheduled')}
          />
          {stats.due.overdue > 0 && (
            <p class="muted small">{tn('stats.overdueCardsCountedToday', stats.due.overdue)}</p>
          )}
        </section>
        <section class="panel">
          <h2>{t('common.cards')}</h2>
          <SplitBar
            title={t('stats.breakdownStudyItems')}
            help={t('stats.help.breakdown')}
            parts={['new', ...KINDS].map((key) => ({ key, ...STATE()[key], n: stats.counts[key] }))}
          />
          {stats.suspendedCards > 0 && (
            <p class="muted small">{tn('stats.suspendedNotCounted', stats.suspendedCards)}</p>
          )}
        </section>
      </div>

      <section class="panel">
        <h2>
          {t('stats.trueRetention')} <InfoTip text={t('stats.help.retention')} />
        </h2>
        <p class="muted small">{t('stats.shareSuccessfulReviewsAny', { p: pct(settings.retention) })}</p>
        <div class="table-scroll">
          <table class="mini-table ret-table">
            <thead>
              <tr>
                <th>{t('common.period')}</th>
                <th>
                  {t('stats.young')} <InfoTip text={t('stats.help.young')} />
                </th>
                <th>
                  {t('stats.mature')} <InfoTip text={t('stats.help.mature')} />
                </th>
                <th>{t('common.total')}</th>
                <th>{t('browse.sort.reps')}</th>
              </tr>
            </thead>
            <tbody>
              {stats.retention.map((r) => (
                <tr key={r.id}>
                  <td>{t(`stats.period.${r.id}`)}</td>
                  <td>{pct(r.young.rate)}</td>
                  <td>{pct(r.mature.rate)}</td>
                  <td>
                    <strong>{pct(r.total.rate)}</strong>
                  </td>
                  <td>{f.format(r.total.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div class="grid3">
        <section class="panel">
          <Columns
            title={t('stats.intervalsDays')}
            help={t('stats.help.intervals')}
            data={stats.intervals.map((b) => ({
              label:
                b.hi === Infinity
                  ? t('stats.daysOrMore', { a: b.lo })
                  : b.hi - b.lo === 1
                    ? t('stats.days', { a: b.lo })
                    : t('stats.daysRange', { a: b.lo, b: b.hi - 1 }),
              short: String(b.lo),
              values: { n: b.n },
            }))}
            series={[{ key: 'n', label: t('common.cards'), color: 'var(--s1)' }]}
            labelEvery={3}
            height={130}
          />
        </section>
        <section class="panel">
          <Columns
            title={t('stats.fsrsDifficulty1Easy')}
            help={t('stats.help.difficulty')}
            data={stats.difficulty.map((b) => ({
              label: b.hi === Infinity ? '9–10' : `${b.lo}–${b.hi}`,
              short: String(b.lo),
              values: { n: b.n },
            }))}
            series={[{ key: 'n', label: t('common.cards'), color: 'var(--s1)' }]}
            labelEvery={2}
            height={130}
          />
        </section>
        <section class="panel">
          <Columns
            title={t('stats.currentRecallProbability')}
            help={t('stats.help.recall')}
            data={stats.recall.map((b) => ({
              label: percent(`${b.lo}–${b.hi === Infinity ? 100 : b.hi}`),
              short: `${b.lo}`,
              values: { n: b.n },
            }))}
            series={[{ key: 'n', label: t('common.cards'), color: 'var(--s1)' }]}
            labelEvery={3}
            height={130}
          />
        </section>
      </div>

      <div class="grid2">
        <section class="panel">
          <Columns
            title={t('stats.reviewsHourLast30')}
            help={t('stats.help.hours')}
            data={stats.hours.map((h) => ({
              label: t('stats.hourRange', { h: h.hour, h2: h.hour + 1 }),
              short: String(h.hour),
              values: { n: h.n },
              note: h.rate == null ? null : t('stats.successRate', { p: pct(h.rate) }),
            }))}
            series={[{ key: 'n', label: t('browse.sort.reps'), color: 'var(--s1)' }]}
            labelEvery={6}
            height={130}
          />
        </section>
        <section class="panel">
          <h2 class="chart-title">
            {t('stats.ratingsGivenLast30')} <InfoTip text={t('stats.help.ratings')} />
          </h2>
          <div class="table-scroll">
            <table class="mini-table">
              <thead>
                <tr>
                  <th />
                  <th>{t('srs.rating.again')}</th>
                  <th>{t('srs.rating.hard')}</th>
                  <th>{t('srs.rating.good')}</th>
                  <th>{t('srs.rating.easy')}</th>
                </tr>
              </thead>
              <tbody>
                {series.map((s) => {
                  const b = stats.buttons[s.key];
                  const p = (n) => (b.n ? percent(Math.round((n / b.n) * 100)) : '—');
                  return (
                    <tr key={s.key}>
                      <td>
                        <span class="key" style={{ background: s.color }} /> {s.label}{' '}
                        {s.help && <InfoTip text={s.help} />}
                      </td>
                      <td>{p(b[1])}</td>
                      <td>{p(b[2])}</td>
                      <td>{p(b[3])}</td>
                      <td>{p(b[4])}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function Tile({ label, value, sub }) {
  return (
    <div class="kpi">
      <span class="kpi-label">{label}</span>
      <span class="kpi-value">{value}</span>
      {sub && <span class="kpi-sub">{sub}</span>}
    </div>
  );
}

/** Révisions par jour (30, 90 j) ou par semaine (1 an). */
function reviewChartData(logs, range, now) {
  const perDay = reviewsPerDay(logs, range, now);
  const df = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' });
  const lab = (k) => df.format(new Date(k + 'T12:00:00'));
  if (range !== 365) return perDay.map((d) => ({ label: lab(d.day), short: lab(d.day), values: d }));
  const weeks = [];
  for (let i = perDay.length % 7; i < perDay.length; i += 7) {
    const chunk = perDay.slice(i, i + 7);
    const v = { learn: 0, young: 0, mature: 0, relearn: 0 };
    for (const d of chunk) for (const k of Object.keys(v)) v[k] += d[k];
    weeks.push({ label: t('stats.week', { d: lab(chunk[0].day) }), short: lab(chunk[0].day), values: v });
  }
  return weeks;
}
