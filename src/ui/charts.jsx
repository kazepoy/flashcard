// Petits graphiques SVG sans dépendance : colonnes (empilées ou non), barre de répartition,
// calendrier d'activité. Chaque graphique a une info-bulle au survol et une vue tableau.
import { useEffect, useRef, useState } from 'preact/hooks';
import { locale, percent, t } from './i18n.js';

const nf = () => new Intl.NumberFormat(locale());

/** Graduation « ronde » au-dessus du maximum : 1, 2, 5 × 10^k. */
export function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Largeur réelle d'un élément (px), suivie au redimensionnement. */
function useWidth(ref, fallback = 600) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const upd = () => el.clientWidth && setW(el.clientWidth);
    upd();
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** Rectangle à coins supérieurs arrondis (extrémité de donnée), base carrée. */
function topRounded(x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function Legend({ series }) {
  if (series.length < 2) return null;
  return (
    <ul class="legend">
      {series.map((s) => (
        <li key={s.key}>
          <span class="key" style={{ background: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function DataTable({ head, rows }) {
  return (
    <details class="chart-table">
      <summary>{t('charts.showData')}</summary>
      <div class="table-scroll">
        <table class="mini-table">
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * Colonnes, empilées si plusieurs séries.
 * @param {{data: Array<{label:string, short?:string, values:Record<string,number>}>, series: Array<{key,label,color}>,
 *          title:string, labelEvery?:number, height?:number, highlightLast?:boolean, format?:(n)=>string}} p
 */
export function Columns({ data, series, title, labelEvery = 1, height = 160, format, empty }) {
  const [hover, setHover] = useState(null);
  const wrap = useRef();
  const fmt = format || ((n) => nf().format(n));
  const totals = data.map((d) => series.reduce((n, s) => n + (d.values[s.key] || 0), 0));
  const max = niceMax(Math.max(0, ...totals));
  const W = useWidth(wrap);
  const padL = 34;
  const padB = 18;
  const top = 6;
  const plotH = height - padB - top;
  const slot = (W - padL) / data.length;
  const bw = Math.min(24, Math.max(2, slot * 0.7));
  const y = (v) => top + plotH - (v / max) * plotH;
  const allZero = totals.every((n) => n === 0);
  // au moins ~44 px entre deux étiquettes de l'axe horizontal
  const every = Math.max(labelEvery, Math.ceil(44 / slot));
  const showLabel = (i) => i % every === 0 || (i === data.length - 1 && ((data.length - 1) % every) * slot >= 44);

  const move = (i) => (e) => {
    const r = wrap.current.getBoundingClientRect();
    setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width });
  };

  return (
    <figure class="chart">
      <figcaption class="chart-title">{title}</figcaption>
      <Legend series={series} />
      <div class="chart-wrap" ref={wrap} onPointerLeave={() => setHover(null)}>
        <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={title} class="chart-svg">
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line class="grid" x1={padL} x2={W} y1={y(max * f)} y2={y(max * f)} />
              <text class="tick" x={padL - 6} y={y(max * f) + 3} text-anchor="end">
                {fmt(max * f)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = padL + i * slot + (slot - bw) / 2;
            let acc = 0;
            const segs = series.map((s) => ({ s, v: d.values[s.key] || 0 })).filter((seg) => seg.v > 0);
            return (
              <g key={i} class={hover?.i === i ? 'col on' : 'col'}>
                {segs.map(({ s, v }, j) => {
                  const y0 = y(acc);
                  acc += v;
                  const y1 = y(acc);
                  // 2 px de vide (couleur du fond) sous chaque segment posé sur un autre
                  const h = Math.max(1, y0 - y1 - (j > 0 ? 2 : 0));
                  return j === segs.length - 1 ? (
                    <path key={s.key} d={topRounded(x, y1, bw, h, 4)} fill={s.color} />
                  ) : (
                    <rect key={s.key} x={x} y={y1} width={bw} height={h} fill={s.color} />
                  );
                })}
                {showLabel(i) && (
                  <text class="tick" x={x + bw / 2} y={height - 4} text-anchor="middle">
                    {d.short ?? d.label}
                  </text>
                )}
                <rect
                  class="hit"
                  x={padL + i * slot}
                  y={top}
                  width={slot}
                  height={plotH}
                  onPointerMove={move(i)}
                  onPointerDown={move(i)}
                />
              </g>
            );
          })}
          <line class="axis" x1={padL} x2={W} y1={y(0)} y2={y(0)} />
        </svg>
        {allZero && <p class="chart-empty">{empty || t('charts.noDataYet')}</p>}
        {hover && (
          <div
            class="tooltip"
            style={{ left: Math.min(hover.x + 12, hover.w - 170) + 'px', top: Math.max(0, hover.y - 10) + 'px' }}
          >
            <strong>{data[hover.i].label}</strong>
            {series.length > 1 &&
              series.map((s) => (
                <span key={s.key} class="tt-row">
                  <span class="key" style={{ background: s.color }} />
                  {s.label}
                  <b>{fmt(data[hover.i].values[s.key] || 0)}</b>
                </span>
              ))}
            <span class="tt-row total">
              {series.length > 1 ? t('common.total') : series[0].label}
              <b>{fmt(totals[hover.i])}</b>
            </span>
            {data[hover.i].note && <span class="tt-note">{data[hover.i].note}</span>}
          </div>
        )}
      </div>
      <DataTable
        head={[t('common.period'), ...series.map((s) => s.label), ...(series.length > 1 ? [t('common.total')] : [])]}
        rows={data.map((d, i) => [
          d.label,
          ...series.map((s) => fmt(d.values[s.key] || 0)),
          ...(series.length > 1 ? [fmt(totals[i])] : []),
        ])}
      />
    </figure>
  );
}

/** Barre de répartition (100 %) avec légende chiffrée. */
export function SplitBar({ title, parts }) {
  const total = parts.reduce((n, p) => n + p.n, 0);
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  const f = nf();
  return (
    <figure class="chart">
      <figcaption class="chart-title">{title}</figcaption>
      {total === 0 ? (
        <p class="muted">{t('charts.noDataYet')}</p>
      ) : (
        <div class="split" role="img" aria-label={`${title} : ${parts.map((p) => `${p.label} ${p.n}`).join(', ')}`}>
          {parts
            .filter((p) => p.n > 0)
            .map((p) => (
              <span
                key={p.key}
                style={{ flexGrow: p.n, background: p.color }}
                title={`${p.label} : ${f.format(p.n)} (${percent(pct(p.n))})`}
              />
            ))}
        </div>
      )}
      <ul class="legend values">
        {parts.map((p) => (
          <li key={p.key}>
            <span class="key" style={{ background: p.color }} />
            {p.label}
            <b>{f.format(p.n)}</b>
            <span class="muted">{percent(pct(p.n))}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Calendrier d'activité : colonnes = semaines (lundi en haut), intensité = nombre de réponses. */
export function Calendar({ title, days }) {
  const [hover, setHover] = useState(null);
  const grid = useRef();
  // sur petit écran, montrer d'abord les semaines les plus récentes
  useEffect(() => {
    if (grid.current) grid.current.scrollLeft = grid.current.scrollWidth;
  }, [days.length]);
  const max = Math.max(1, ...days.map((d) => d.n));
  const level = (n) => (n === 0 ? 0 : Math.min(4, 1 + Math.floor((n / max) * 3.99)));
  const first = new Date(days[0].day + 'T12:00:00');
  const pad = (first.getDay() + 6) % 7; // lundi = 0
  const df = new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  const f = nf();
  const active = days.filter((d) => d.n > 0).length;
  return (
    <figure class="chart">
      <figcaption class="chart-title">{title}</figcaption>
      <div
        class="calendar"
        ref={grid}
        role="img"
        aria-label={t('charts.activeDaysOfSet', { title, a: active, n: days.length })}
        onPointerLeave={() => setHover(null)}
      >
        {Array.from({ length: pad }, (_, i) => (
          <span key={'p' + i} class="cell pad" />
        ))}
        {days.map((d) => (
          <span
            key={d.day}
            class={'cell l' + level(d.n)}
            onPointerEnter={() => setHover(d)}
            title={`${df.format(new Date(d.day + 'T12:00:00'))} : ${f.format(d.n)}`}
          />
        ))}
      </div>
      <p class="muted small cal-foot">
        {hover
          ? t('charts.answers', { d: df.format(new Date(hover.day + 'T12:00:00')), n: f.format(hover.n) })
          : t('charts.activeDays', { a: active, n: days.length })}
        <span class="cal-scale" aria-hidden="true">
          {t('charts.less')}{' '}
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} class={'cell l' + l} />
          ))}{' '}
          {t('charts.more')}
        </span>
      </p>
    </figure>
  );
}
