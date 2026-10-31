// Statistiques détaillées : toute la bibliothèque ou un jeu (#/stats, #/stats/<setId>).
import { useMemo, useState } from 'preact/hooks';
import {
  answerButtons,
  dailyActivity,
  difficultyHistogram,
  futureDue,
  hourly,
  intervalHistogram,
  itemCounts,
  retrievabilityHistogram,
  reviewsPerDay,
  streak,
  trueRetention,
} from '../core/analytics.js';
import { expandSet } from '../core/items.js';
import { Scheduler } from '../core/srs.js';
import { Calendar, Columns, SplitBar } from './charts.jsx';
import { Empty } from './components.jsx';
import { go, href, useApp, useAsync } from './ctx.js';
import { errorText, locale, percent, t, tn } from './i18n.js';

const KIND_SERIES = () => [
  { key: 'learn', label: t('stats.learning'), color: 'var(--s1)' },
  { key: 'young', label: t('stats.young'), color: 'var(--s2)' },
  { key: 'mature', label: t('stats.mature'), color: 'var(--s3)' },
  { key: 'relearn', label: t('stats.relearning'), color: 'var(--s4)' },
];
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

  const scoped = useMemo(() => (data || []).filter((x) => !setId || x.set.id === setId), [data, setId]);
  const [now] = useState(() => new Date()); // instant de référence de la page
  const stats = useMemo(() => {
    if (!scoped.length) return null;
    const progresses = scoped.map((x) => x.progress);
    const logs = scoped.flatMap((x) => x.log);
    let totalItems = 0;
    for (const { set, progress } of scoped) {
      const ids = new Set(expandSet(set, 'term').map((i) => i.id));
      for (const [id, it] of Object.entries(progress.items)) if (it.srs) ids.add(id);
      totalItems += ids.size;
    }
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
      <Empty title={t('common.setNotFound')}>
        <a class="btn" href={href('stats')}>
          {t('stats.wholeLibrary')}
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
                {x.set.title}
              </option>
            ))}
          </select>
        </label>
      </header>

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
        <Calendar title={t('stats.activityOverYearAll')} days={stats.activity} />
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
            parts={[
              { key: 'new', label: t('common.new'), n: stats.counts.new, color: 'var(--s-neutral)' },
              { key: 'learn', label: t('stats.learning'), n: stats.counts.learn, color: 'var(--s1)' },
              { key: 'young', label: t('stats.young'), n: stats.counts.young, color: 'var(--s2)' },
              { key: 'mature', label: t('stats.mature'), n: stats.counts.mature, color: 'var(--s3)' },
            ]}
          />
          <p class="muted small">{t('stats.youngIntervalUnder21')}</p>
        </section>
      </div>

      <section class="panel">
        <h2>{t('stats.trueRetention')}</h2>
        <p class="muted small">{t('stats.shareSuccessfulReviewsAny', { p: pct(settings.retention) })}</p>
        <div class="table-scroll">
          <table class="mini-table ret-table">
            <thead>
              <tr>
                <th>{t('common.period')}</th>
                <th>{t('stats.young')}</th>
                <th>{t('stats.mature')}</th>
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
          <h2 class="chart-title">{t('stats.ratingsGivenLast30')}</h2>
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
                        <span class="key" style={{ background: s.color }} /> {s.label}
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
