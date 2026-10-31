// Statistiques détaillées (inspirées des graphiques d'Anki), calculées à partir des fichiers
// progress/ et logs/. Pur : `now` et la fonction de rappel sont injectés.
import { localDay, SrsState } from './srs.js';

const DAY = 86400000;
/** Seuil Anki : une carte est « mature » à partir de 21 jours d'intervalle. */
export const MATURE_DAYS = 21;

/** Catégorie d'une révision FSRS d'après l'état AVANT la révision (ligne de journal). */
export function reviewKind(l) {
  if (l.state === SrsState.Relearning) return 'relearn';
  if (l.state === SrsState.Review) return (l.scheduled_days || 0) >= MATURE_DAYS ? 'mature' : 'young';
  return 'learn'; // nouveau ou en apprentissage
}
export const KINDS = ['learn', 'young', 'mature', 'relearn'];

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
/** Nombre de jours calendaires entre deux dates (b - a). */
const dayDiff = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);

const srsLines = (logs) => logs.filter((l) => l.mode === 'srs' && l.t && l.rating);

/** Révisions FSRS par jour sur `days` jours (le dernier = aujourd'hui), empilées par catégorie. */
export function reviewsPerDay(logs, days, now = new Date()) {
  const out = Array.from({ length: days }, (_, i) => {
    const d = new Date(startOfDay(now));
    d.setDate(d.getDate() - (days - 1 - i));
    return { day: localDay(d), learn: 0, young: 0, mature: 0, relearn: 0, total: 0, ms: 0 };
  });
  for (const l of srsLines(logs)) {
    const i = days - 1 - dayDiff(new Date(l.t), now);
    if (i < 0 || i >= days) continue;
    out[i][reviewKind(l)]++;
    out[i].total++;
    out[i].ms += l.ms || 0;
  }
  return out;
}

/**
 * Activité quotidienne (tous modes) : compteurs `daily` de chaque progression, ou lignes du journal si
 * elles sont plus nombreuses (les compteurs de deux appareils se fusionnent par maximum, les journaux
 * par union : avec la synchronisation, le journal donne le vrai total).
 */
export function dailyActivity(progresses, days, now = new Date(), logs = []) {
  const logged = {};
  for (const l of logs) if (l.t) logged[localDay(new Date(l.t))] = (logged[localDay(new Date(l.t))] || 0) + 1;
  const out = [];
  const d = new Date(startOfDay(now));
  d.setDate(d.getDate() - days + 1);
  for (let i = 0; i < days; i++) {
    const k = localDay(d);
    let n = 0;
    let ms = 0;
    for (const p of progresses) {
      n += p.daily?.[k]?.answers || 0;
      ms += p.daily?.[k]?.ms || 0;
    }
    out.push({ day: k, n: Math.max(n, logged[k] || 0), ms });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** États FSRS vus (hors nouveaux) de tous les items. */
const seenItems = (progresses) =>
  progresses.flatMap((p) =>
    Object.values(p.items || {})
      .map((it) => it.srs)
      .filter((s) => s && s.state !== SrsState.New),
  );

/**
 * Répartition des items : nouveaux, en apprentissage (dont réapprentissage), jeunes, matures.
 * `totalItems` = nombre d'items d'étude existants (les nouveaux sont ceux jamais vus).
 */
export function itemCounts(progresses, totalItems) {
  const c = { new: 0, learn: 0, young: 0, mature: 0 };
  for (const s of seenItems(progresses)) {
    if (s.state === SrsState.Review) c[(s.scheduled_days || 0) >= MATURE_DAYS ? 'mature' : 'young']++;
    else c.learn++;
  }
  c.new = Math.max(0, totalItems - c.learn - c.young - c.mature);
  return c;
}

/** Échéances à venir : `overdue` (avant aujourd'hui) puis une case par jour, aujourd'hui inclus. */
export function futureDue(progresses, days, now = new Date()) {
  const perDay = Array.from({ length: days }, () => 0);
  let overdue = 0;
  for (const s of seenItems(progresses)) {
    const d = dayDiff(now, new Date(s.due));
    if (d < 0) overdue++;
    else if (d < days) perDay[d]++;
  }
  return { overdue, perDay };
}

/** Histogramme générique : `edges` croissants, une case par intervalle [edges[i], edges[i+1]) + la dernière ouverte. */
export function histogram(values, edges) {
  const bins = edges.map((lo, i) => ({ lo, hi: edges[i + 1] ?? Infinity, n: 0 }));
  for (const v of values) {
    if (v == null || Number.isNaN(v)) continue;
    let i = bins.length - 1;
    while (i > 0 && v < bins[i].lo) i--;
    if (v >= bins[0].lo) bins[i].n++;
  }
  return bins;
}

export const INTERVAL_EDGES = [0, 1, 2, 3, 4, 5, 7, 10, 14, 21, 30, 60, 90, 180, 365];
export const intervalHistogram = (progresses) =>
  histogram(
    seenItems(progresses)
      .filter((s) => s.state === SrsState.Review)
      .map((s) => s.scheduled_days || 0),
    INTERVAL_EDGES,
  );

export const difficultyHistogram = (progresses) =>
  histogram(
    seenItems(progresses).map((s) => s.difficulty),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );

/** Probabilité de rappel actuelle, par tranches de 10 % (de 0–10 à 90–100). */
export const retrievabilityHistogram = (progresses, retrievability, now = new Date()) =>
  histogram(
    seenItems(progresses)
      .filter((s) => s.last_review)
      .map((s) => Math.min(99.999, retrievability(s, now) * 100)),
    [0, 10, 20, 30, 40, 50, 60, 70, 80, 90],
  );

/**
 * Rétention réelle (comme Anki) : part des révisions de cartes en révision réussies
 * (toute note autre que « À revoir »), jeunes et matures séparées, par période.
 */
export function trueRetention(logs, now = new Date()) {
  const periods = [
    { id: 'today', days: 1 },
    { id: 'yesterday', days: 1, offset: 1 },
    { id: 'week', days: 7 },
    { id: 'month', days: 30 },
    { id: 'year', days: 365 },
    { id: 'all', days: Infinity },
  ];
  const lines = srsLines(logs).filter((l) => l.state === SrsState.Review);
  return periods.map((p) => {
    const r = { id: p.id, young: { pass: 0, fail: 0 }, mature: { pass: 0, fail: 0 } };
    for (const l of lines) {
      const ago = dayDiff(new Date(l.t), now);
      const from = p.offset || 0;
      if (ago < from || ago >= from + p.days) continue;
      const k = (l.scheduled_days || 0) >= MATURE_DAYS ? 'mature' : 'young';
      r[k][l.rating > 1 ? 'pass' : 'fail']++;
    }
    const pass = r.young.pass + r.mature.pass;
    const fail = r.young.fail + r.mature.fail;
    r.total = { pass, fail };
    for (const k of ['young', 'mature', 'total']) {
      const n = r[k].pass + r[k].fail;
      r[k].rate = n ? r[k].pass / n : null;
      r[k].n = n;
    }
    return r;
  });
}

/** Révisions FSRS par heure de la journée (fuseau local) et taux de réussite, sur `days` jours. */
export function hourly(logs, days = 30, now = new Date()) {
  const out = Array.from({ length: 24 }, (_, h) => ({ hour: h, n: 0, pass: 0, rate: null }));
  for (const l of srsLines(logs)) {
    const d = new Date(l.t);
    if (dayDiff(d, now) >= days) continue;
    const o = out[d.getHours()];
    o.n++;
    if (l.rating > 1) o.pass++;
  }
  for (const o of out) o.rate = o.n ? o.pass / o.n : null;
  return out;
}

/** Répartition des notes (1..4) par catégorie de révision. */
export function answerButtons(logs, days = Infinity, now = new Date()) {
  const out = Object.fromEntries(KINDS.map((k) => [k, { 1: 0, 2: 0, 3: 0, 4: 0, n: 0 }]));
  for (const l of srsLines(logs)) {
    if (dayDiff(new Date(l.t), now) >= days) continue;
    const o = out[reviewKind(l)];
    if (o[l.rating] != null) {
      o[l.rating]++;
      o.n++;
    }
  }
  return out;
}

/** Série de jours consécutifs avec au moins une réponse (aujourd'hui ne casse pas la série). */
export function streak(activity) {
  let i = activity.length - 1;
  if (i >= 0 && activity[i].n === 0) i--;
  let n = 0;
  while (i >= 0 && activity[i].n > 0) {
    n++;
    i--;
  }
  return n;
}
