// Mise à jour de la progression (pure : opère sur l'objet passé).
import { localDay } from './srs.js';

export function getItem(progress, id) {
  return progress.items[id] || (progress.items[id] = {});
}

export function bumpDaily(progress, now = new Date(), delta = {}) {
  const day = localDay(now);
  const d = progress.daily[day] || (progress.daily[day] = { new: 0, reviews: 0, answers: 0, ms: 0 });
  for (const [k, v] of Object.entries(delta)) d[k] = (d[k] || 0) + v;
  return d;
}

/** Enregistre le résultat d'une question hors FSRS (Apprendre, Test, Écrire…). */
export function recordAnswer(progress, itemId, correct, { now = new Date(), ms = 0 } = {}) {
  const it = getItem(progress, itemId);
  it.correct = (it.correct || 0) + (correct ? 1 : 0);
  it.wrong = (it.wrong || 0) + (correct ? 0 : 1);
  bumpDaily(progress, now, { answers: 1, ms });
}

/** Applique les niveaux de maîtrise d'une session Apprendre. */
export function applyMastery(progress, snapshot) {
  for (const [id, level] of Object.entries(snapshot)) {
    const it = getItem(progress, id);
    it.mastery = level;
  }
}

export function toggleStar(progress, cardId) {
  if (progress.starred[cardId]) delete progress.starred[cardId];
  else progress.starred[cardId] = true;
  return !!progress.starred[cardId];
}

/** Applique le résultat d'une révision FSRS et les compteurs quotidiens. */
export function applySrsResult(progress, result, now = new Date(), ms = 0) {
  const it = getItem(progress, result.itemId);
  it.srs = result.srs;
  bumpDaily(progress, now, {
    [result.wasNew ? 'new' : 'reviews']: 1,
    answers: 1,
    ms,
  });
}

/** Suspend ou réactive une carte : suspendue, elle n'est plus étudiée ni comptée (comme dans Anki).
 *  La date départage deux appareils lors d'une fusion. */
export function setSuspended(progress, cardId, on, now = new Date()) {
  progress.suspended ||= {};
  progress.suspended[cardId] = { s: !!on, t: now.toISOString() };
}

export const isSuspended = (progress, cardId) => !!progress?.suspended?.[cardId]?.s;
