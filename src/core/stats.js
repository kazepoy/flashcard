// Statistiques, score mémoire, prévisions et plan d'examen.
import { localDay, SrsState } from './srs.js';

const DAY = 86400000;

/**
 * `logs` : lignes du journal du jeu. Réponses d'un jour = maximum des compteurs `daily` et des lignes du
 * journal (avec la synchronisation, les compteurs se fusionnent par maximum, le journal par union).
 */
export function computeStats(items, progress, scheduler, now = new Date(), logs = []) {
  const ids = new Set(items.map((i) => i.id));
  let seen = 0;
  let mastered = 0;
  let retSum = 0;
  let retCount = 0;
  const forecast = Array.from({ length: 14 }, () => 0);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  for (const id of ids) {
    const it = progress.items[id];
    if (!it) continue;
    const s = it.srs;
    if (s && s.state !== SrsState.New) {
      seen++;
      const r = scheduler.retrievability(s, now);
      retSum += r;
      retCount++;
      if (s.state === SrsState.Review && s.stability >= 21) mastered++;
      const dueDay = Math.floor((new Date(s.due) - startOfToday) / DAY);
      if (dueDay >= 0 && dueDay < 14) forecast[dueDay]++;
      else if (dueDay < 0) forecast[0]++;
    } else if ((it.mastery ?? 0) >= 2) {
      seen++;
      mastered++;
    }
  }

  const logged = {};
  for (const l of logs) if (l.t) logged[localDay(new Date(l.t))] = (logged[localDay(new Date(l.t))] || 0) + 1;
  const answers = (k) => Math.max(progress.daily[k]?.answers || 0, logged[k] || 0);

  // Série (jours consécutifs d'étude), la journée en cours ne casse pas la série.
  let streak = 0;
  const d = new Date(now);
  if (!(answers(localDay(d)) > 0)) d.setDate(d.getDate() - 1);
  while (answers(localDay(d)) > 0) {
    streak++;
    d.setDate(d.getDate() - 1);
  }

  // Carte thermique 18 semaines.
  const heat = [];
  const h = new Date(now);
  h.setDate(h.getDate() - 7 * 18 + 1);
  for (let i = 0; i < 7 * 18; i++) {
    const k = localDay(h);
    heat.push({ day: k, n: answers(k) });
    h.setDate(h.getDate() + 1);
  }

  return {
    total: items.length,
    seen,
    mastered,
    memoryScore: retCount ? retSum / retCount : 0, // 0..1
    streak,
    forecast,
    heat,
    today: progress.daily[localDay(now)] || { new: 0, reviews: 0, answers: 0, ms: 0 },
  };
}

/** Plan d'examen : combien de nouveaux items introduire par jour pour être prêt à temps. */
export function examPlan(items, progress, examDate, now = new Date()) {
  if (!examDate) return null;
  const end = new Date(examDate + 'T00:00:00');
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const daysLeft = Math.round((end - start) / DAY);
  const unlearned = items.filter((i) => {
    const s = progress.items[i.id]?.srs;
    return !s || s.state === SrsState.New;
  }).length;
  if (daysLeft < 0) return { daysLeft, unlearned, perDay: 0, passed: true };
  // On garde au moins 1 jour de révision finale avant l'examen.
  const teachingDays = Math.max(1, daysLeft - 1);
  return { daysLeft, unlearned, perDay: Math.ceil(unlearned / teachingDays), passed: false };
}
