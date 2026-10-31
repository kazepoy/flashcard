// Répétition espacée : enveloppe autour de ts-fsrs (FSRS) + file d'étude quotidienne.
import { fsrs, createEmptyCard, generatorParameters } from 'ts-fsrs';

export const Grade = { Again: 1, Hard: 2, Good: 3, Easy: 4 };
export const SrsState = { New: 0, Learning: 1, Review: 2, Relearning: 3 };

export const LEARN_AHEAD_MS = 20 * 60 * 1000;

export function serializeCard(c) {
  return {
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days ?? 0,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps ?? 0,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.toISOString() : null,
  };
}

export function deserializeCard(s) {
  return { ...s, due: new Date(s.due), last_review: s.last_review ? new Date(s.last_review) : undefined };
}

export const emptySrs = (now = new Date()) => serializeCard(createEmptyCard(now));

export class Scheduler {
  constructor({ retention = 0.9, fuzz = true, maxInterval = 36500 } = {}) {
    this.params = generatorParameters({
      request_retention: retention,
      enable_fuzz: fuzz,
      maximum_interval: maxInterval,
    });
    this.f = fsrs(this.params);
  }

  /** Applique une note (1..4). Renvoie le nouvel état sérialisé et la ligne de journal (état AVANT révision). */
  review(srs, grade, now = new Date()) {
    const card = deserializeCard(srs || emptySrs(now));
    const rec = this.f.repeat(card, now)[grade];
    const l = rec.log;
    return {
      srs: serializeCard(rec.card),
      log: {
        t: now.toISOString(),
        rating: grade,
        state: l.state,
        due: new Date(l.due).toISOString(),
        stability: l.stability,
        difficulty: l.difficulty,
        elapsed_days: l.elapsed_days,
        scheduled_days: l.scheduled_days,
      },
    };
  }

  /** Échéance que produirait chacune des 4 notes : {1: Date, 2: Date, 3: Date, 4: Date}. */
  preview(srs, now = new Date()) {
    const card = deserializeCard(srs || emptySrs(now));
    const rec = this.f.repeat(card, now);
    return { 1: rec[1].card.due, 2: rec[2].card.due, 3: rec[3].card.due, 4: rec[4].card.due };
  }

  /** Probabilité de rappel (0..1) à l'instant `now`. */
  retrievability(srs, now = new Date()) {
    if (!srs || srs.state === SrsState.New || !srs.last_review) return 0;
    return this.f.get_retrievability(deserializeCard(srs), now, false);
  }
}

/** Durée lisible : {value, unit} avec unit ∈ min|h|d|mo|y. */
export function humanInterval(from, to) {
  const ms = Math.max(0, new Date(to) - new Date(from));
  const min = ms / 60000;
  if (min < 1) return { value: 1, unit: 'min', lt: true };
  if (min < 60) return { value: Math.round(min), unit: 'min' };
  const h = min / 60;
  if (h < 24) return { value: Math.round(h), unit: 'h' };
  const d = h / 24;
  if (d < 30) return { value: Math.round(d), unit: 'd' };
  if (d < 365) return { value: Math.round(d / 30), unit: 'mo' };
  return { value: Math.round((d / 365) * 10) / 10, unit: 'y' };
}

const endOfDay = (now) => {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d;
};

/**
 * Construit la file du jour.
 * @returns {{learning:string[], review:string[], fresh:string[], counts:{learning:number, review:number, new:number}}}
 */
export function buildQueue(items, progress, opts = {}) {
  const {
    now = new Date(),
    newPerDay = 20,
    reviewsPerDay = 200,
    newOverride = null, // mode examen : nombre de nouveaux/jour imposé
    starredOnly = false,
    ignoreLimits = false,
    // « étudier plus » : au-delà des limites du jour, ou en avance
    moreNew = 0,
    moreReviews = 0,
    aheadDays = 0,
    rng = Math.random,
    shuffleNew = false,
  } = opts;
  const day = localDay(now);
  const daily = (progress.daily && progress.daily[day]) || { new: 0, reviews: 0 };
  const pool = starredOnly ? items.filter((i) => progress.starred?.[i.cardId]) : items;

  const learning = [];
  const review = [];
  const fresh = [];
  const eod = endOfDay(now).getTime() + aheadDays * 86400000;
  for (const it of pool) {
    const s = progress.items?.[it.id]?.srs;
    if (!s || s.state === SrsState.New) {
      fresh.push(it.id);
      continue;
    }
    const due = new Date(s.due).getTime();
    if (s.state === SrsState.Learning || s.state === SrsState.Relearning) {
      if (due <= now.getTime() + LEARN_AHEAD_MS) learning.push([due, it.id]);
    } else if (due <= eod) {
      review.push([due, it.id]);
    }
  }
  learning.sort((a, b) => a[0] - b[0]);
  review.sort((a, b) => a[0] - b[0]);
  const reviewLimit =
    ignoreLimits || aheadDays > 0 ? Infinity : Math.max(0, reviewsPerDay - (daily.reviews || 0)) + moreReviews;
  const newLimit = ignoreLimits ? Infinity : Math.max(0, (newOverride ?? newPerDay) - (daily.new || 0)) + moreNew;
  const freshIds = shuffleNew ? shuffleArr(fresh, rng) : fresh;
  const out = {
    learning: learning.map((x) => x[1]),
    review: review.slice(0, reviewLimit).map((x) => x[1]),
    fresh: freshIds.slice(0, newLimit),
  };
  out.counts = { learning: out.learning.length, review: out.review.length, new: out.fresh.length };
  return out;
}

/**
 * Ce que « étudier plus » peut encore proposer quand la file du jour est vide ou finie :
 * nouvelles cartes et révisions retenues par les limites du jour, révisions des 7 prochains jours.
 */
export const AHEAD_DAYS = 7;
export function studyMore(items, progress, opts = {}) {
  const base = buildQueue(items, progress, opts).counts;
  const all = buildQueue(items, progress, { ...opts, ignoreLimits: true }).counts;
  const ahead = buildQueue(items, progress, { ...opts, ignoreLimits: true, aheadDays: AHEAD_DAYS }).counts;
  return { newLeft: all.new - base.new, reviewsLeft: all.review - base.review, ahead: ahead.review - all.review };
}

/** Coup de pouce par défaut : nouvelles cartes d'abord, puis révisions retenues, puis révisions en avance. */
export function defaultBoost(more) {
  if (more.newLeft > 0) return { moreNew: Math.min(10, more.newLeft) };
  if (more.reviewsLeft > 0) return { moreReviews: Math.min(50, more.reviewsLeft) };
  if (more.ahead > 0) return { aheadDays: AHEAD_DAYS };
  return null;
}

function shuffleArr(a, rng) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export function localDay(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Session de révision : gère l'ordre, les ré-apprentissages à court terme et les compteurs.
 * Ne touche pas au stockage : l'appelant persiste `result.srs` / `result.log`.
 */
export class SrsSession {
  constructor(queue, progress, scheduler, itemsById) {
    this.learning = queue.learning.slice(); // ids dont l'échéance est proche
    this.review = queue.review.slice();
    this.fresh = queue.fresh.slice();
    // états FSRS de la séance : la progression reçue n'est jamais modifiée (l'appelant applique les résultats)
    this.srs = Object.fromEntries(
      [...this.learning, ...this.review, ...this.fresh].map((id) => [id, progress.items?.[id]?.srs ?? null]),
    );
    this.scheduler = scheduler;
    this.itemsById = itemsById;
    this.done = 0; // cartes sorties de la séance (réussies)
    this.seen = new Set(); // cartes ayant reçu au moins une réponse
    this.total = this.learning.length + this.review.length + this.fresh.length;
    this.history = []; // pour annuler
  }

  _dueOf(id) {
    return new Date(this.srs[id].due).getTime();
  }

  /** Prochain item à présenter, ou null. */
  /**
   * Ordre : apprentissages échus, révisions, nouvelles, puis apprentissages en avance (le plus proche
   * d'abord). Jamais deux fois de suite la même carte s'il en reste une autre à présenter.
   */
  current(now = new Date()) {
    const t = now.getTime();
    const dueLearning = this.learning.filter((id) => this._dueOf(id) <= t);
    const ahead = this.learning.slice().sort((a, b) => this._dueOf(a) - this._dueOf(b));
    const order = [...dueLearning, ...this.review, ...this.fresh, ...ahead];
    const id = order.find((x) => x !== this.last) ?? order[0];
    return id ? this.itemsById.get(id) : null;
  }

  remaining() {
    return { learning: this.learning.length, review: this.review.length, new: this.fresh.length };
  }

  get finished() {
    return !this.learning.length && !this.review.length && !this.fresh.length;
  }

  /** Note l'item courant. Renvoie {itemId, srs, log, wasNew}. */
  answer(itemId, grade, now = new Date(), ms = 0) {
    this.seen.add(itemId);
    this.last = itemId;
    const before = this.srs[itemId] ? { ...this.srs[itemId] } : null;
    const wasNew = !before || before.state === SrsState.New;
    const { srs, log } = this.scheduler.review(before, grade, now);
    this.srs[itemId] = srs;
    this.learning = this.learning.filter((x) => x !== itemId);
    this.review = this.review.filter((x) => x !== itemId);
    this.fresh = this.fresh.filter((x) => x !== itemId);
    const stillLearning =
      (srs.state === SrsState.Learning || srs.state === SrsState.Relearning) &&
      new Date(srs.due).getTime() <= now.getTime() + LEARN_AHEAD_MS;
    if (stillLearning) this.learning.push(itemId);
    else this.done++;
    this.history.push({ itemId, before });
    return { itemId, srs, log: { ...log, item: itemId, mode: 'srs', ms }, wasNew };
  }
}
