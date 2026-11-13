// Jeux qu'il serait utile d'archiver : plus étudiés depuis longtemps, jamais étudiés, ou terminés.
import { activeItems } from './items.js';

const DAY = 86400000;
/** Plus étudié (ou, jamais étudié, créé) depuis ce nombre de jours. */
export const IDLE_DAYS = 90;
/** Terminé : toutes les cartes connues, prochaine révision au-delà de ce nombre de jours. */
export const DONE_DAYS = 180;

/** Date (ISO) de la dernière révision du jeu, ou null s'il n'a jamais été étudié. */
export function lastStudied(progress) {
  let last = null;
  for (const it of Object.values(progress?.items || {})) {
    const t = it?.srs?.last_review;
    if (t && (!last || t > last)) last = t;
  }
  return last;
}

/**
 * Raison de proposer l'archivage d'un jeu, ou null.
 * @param {object} set jeu complet
 * @param {Array} items éléments d'étude du jeu (expandSet)
 * @param {object} progress progression du jeu
 * @returns {{reason: 'idle' | 'never' | 'done', last: string | null} | null}
 */
export function archiveSuggestion(set, items, progress, now = new Date()) {
  if (set?.inactive) return null;
  const last = lastStudied(progress);
  if (!last) {
    const created = Date.parse(set.created);
    return Number.isFinite(created) && now - created > IDLE_DAYS * DAY ? { reason: 'never', last: null } : null;
  }
  if (now - Date.parse(last) > IDLE_DAYS * DAY) return { reason: 'idle', last };
  const active = activeItems(items, progress);
  const horizon = now.getTime() + DONE_DAYS * DAY;
  const done =
    active.length > 0 &&
    active.every((i) => {
      const due = progress.items?.[i.id]?.srs?.due;
      return due && Date.parse(due) > horizon;
    });
  return done ? { reason: 'done', last } : null;
}
