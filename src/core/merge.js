// Fusion de progressions et de journaux : résout les conflits de synchronisation
// (iCloud Drive, Syncthing, Nextcloud… créent des copies « en conflit » quand deux appareils
// modifient le même fichier). L'algorithme est commutatif, associatif et idempotent.

const time = (s) => (s ? new Date(s).getTime() : 0);

/** Garde l'état FSRS le plus récent (dernière révision, puis nombre de révisions). */
function newerSrs(a, b) {
  if (!a) return b;
  if (!b) return a;
  const ta = time(a.last_review);
  const tb = time(b.last_review);
  if (ta !== tb) return ta > tb ? a : b;
  if ((a.reps || 0) !== (b.reps || 0)) return (a.reps || 0) > (b.reps || 0) ? a : b;
  return time(a.due) >= time(b.due) ? a : b;
}

export function mergeProgress(a, b) {
  if (!a) return b;
  if (!b) return a;
  const out = { ...a, ...b, items: {}, starred: {}, flags: {}, suspended: {}, daily: {}, games: {} };
  for (const id of new Set([...Object.keys(a.items || {}), ...Object.keys(b.items || {})])) {
    const x = a.items?.[id] || {};
    const y = b.items?.[id] || {};
    const it = {};
    const srs = newerSrs(x.srs, y.srs);
    if (srs) it.srs = srs;
    if (x.mastery != null || y.mastery != null) it.mastery = Math.max(x.mastery ?? 0, y.mastery ?? 0);
    if (x.correct != null || y.correct != null) it.correct = Math.max(x.correct ?? 0, y.correct ?? 0);
    if (x.wrong != null || y.wrong != null) it.wrong = Math.max(x.wrong ?? 0, y.wrong ?? 0);
    out.items[id] = it;
  }
  Object.assign(out.starred, a.starred, b.starred);
  // drapeaux : le plus récent l'emporte (à égalité, le plus grand numéro, pour rester commutatif)
  for (const id of new Set([...Object.keys(a.flags || {}), ...Object.keys(b.flags || {})])) {
    const [x, y] = [a.flags?.[id], b.flags?.[id]];
    out.flags[id] = !x ? y : !y ? x : (x.t || '') > (y.t || '') || ((x.t || '') === (y.t || '') && x.f >= y.f) ? x : y;
  }
  // suspension : la plus récente l'emporte (à égalité, suspendue)
  for (const id of new Set([...Object.keys(a.suspended || {}), ...Object.keys(b.suspended || {})])) {
    const [x, y] = [a.suspended?.[id], b.suspended?.[id]];
    out.suspended[id] = !x ? y : !y ? x : (x.t || '') > (y.t || '') || ((x.t || '') === (y.t || '') && x.s) ? x : y;
  }
  for (const day of new Set([...Object.keys(a.daily || {}), ...Object.keys(b.daily || {})])) {
    const x = a.daily?.[day] || {};
    const y = b.daily?.[day] || {};
    const d = {};
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) d[k] = Math.max(x[k] || 0, y[k] || 0);
    out.daily[day] = d;
  }
  for (const g of new Set([...Object.keys(a.games || {}), ...Object.keys(b.games || {})])) {
    const x = a.games?.[g] || {};
    const y = b.games?.[g] || {};
    const r = { ...x, ...y };
    if (x.bestMs != null || y.bestMs != null) r.bestMs = Math.min(x.bestMs ?? Infinity, y.bestMs ?? Infinity);
    if (x.best != null || y.best != null) r.best = Math.max(x.best ?? 0, y.best ?? 0);
    out.games[g] = r;
  }
  // l'examen : le plus récemment défini gagne ; à défaut, celui qui existe
  out.exam = b.exam ?? a.exam ?? null;
  return out;
}

/** Fusion de deux journaux JSONL : union des lignes, triées par date, sans doublon. */
export function mergeLogs(a = '', b = '') {
  const seen = new Set();
  const lines = [];
  for (const raw of `${a}\n${b}`.split('\n')) {
    const l = raw.trim();
    if (!l || seen.has(l)) continue;
    seen.add(l);
    lines.push(l);
  }
  lines.sort((x, y) => {
    try {
      return time(JSON.parse(x).t) - time(JSON.parse(y).t);
    } catch {
      return 0;
    }
  });
  return lines.join('\n') + (lines.length ? '\n' : '');
}

/** Fusion de deux jeux (contenu) : le plus récent par `updated` l'emporte, cartes des deux côtés conservées. */
export function mergeSets(a, b) {
  if (!a) return b;
  if (!b) return a;
  const [newer, older] = time(a.updated) >= time(b.updated) ? [a, b] : [b, a];
  // suppressions des deux côtés (date la plus récente) : une carte supprimée ne revient pas
  const deleted = { ...older.deleted };
  for (const [id, at] of Object.entries(newer.deleted || {})) if (!deleted[id] || at > deleted[id]) deleted[id] = at;
  // une carte restaurée (« Annuler ») après sa suppression l'emporte sur la marque de suppression
  const restored = {};
  for (const c of [...older.cards, ...newer.cards])
    if (c.restoredAt > (restored[c.id] || '')) restored[c.id] = c.restoredAt;
  const gone = (id) => deleted[id] && !(restored[id] > deleted[id]);
  const ids = new Set(newer.cards.map((c) => c.id));
  // cartes présentes uniquement dans l'ancienne version : conservées, sauf si supprimées
  const extra = older.cards.filter((c) => !ids.has(c.id));
  const cards = [...newer.cards, ...extra].filter((c) => !gone(c.id));
  return Object.keys(deleted).length ? { ...newer, cards, deleted } : { ...newer, cards };
}
