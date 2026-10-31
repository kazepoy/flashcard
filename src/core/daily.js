// File du jour d'un jeu : limites des réglages, rythme imposé par une date d'examen, « étudier plus ».
// Seule source de ces règles pour la bibliothèque, la page d'un jeu et la révision.
import { activeItems } from './items.js';
import { buildQueue, studyMore } from './srs.js';
import { examPlan } from './stats.js';

/** Limites du jour : nouvelles cartes et révisions des réglages ; un examen à venir impose son rythme. */
export function dailyLimits(items, progress, settings, now = new Date()) {
  const plan = examPlan(items, progress, progress.exam?.date, now);
  return {
    now,
    newPerDay: settings.newPerDay,
    reviewsPerDay: settings.reviewsPerDay,
    newOverride: plan && !plan.passed ? plan.perDay : null,
  };
}

/** File du jour (cartes suspendues exclues) ; `boost` : options « étudier plus » de buildQueue (moreNew, moreReviews, aheadDays). */
export function todayQueue(items, progress, settings, boost = null, now = new Date()) {
  const active = activeItems(items, progress);
  return buildQueue(active, progress, { ...dailyLimits(active, progress, settings, now), ...boost });
}

/** Ce que « étudier plus » peut encore proposer aujourd'hui. */
export function todayMore(items, progress, settings, now = new Date()) {
  const active = activeItems(items, progress);
  return studyMore(active, progress, dailyLimits(active, progress, settings, now));
}
