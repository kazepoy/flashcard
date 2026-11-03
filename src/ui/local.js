// Préférences propres à ce navigateur (bandeaux vus, rappels repoussés…) dans le stockage local.
// Le stockage local peut être indisponible (navigation privée, quota) : on lit alors null, l'écriture est perdue.

export function readLocal(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* indisponible : oublié à la fermeture */
  }
}

/** Vrai si la date (ISO) enregistrée sous `key` date de moins de `days` jours. */
export const recentLocal = (key, days, now = Date.now()) => now - Date.parse(readLocal(key) || '') < days * 86400000;

/** Valeur JSON enregistrée sous `key`, ou null (absente, illisible, stockage indisponible). */
export function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? null;
  } catch {
    return null;
  }
}

/** Enregistre `value` en JSON sous `key` ; null l'efface. Stockage indisponible : oublié à la fermeture. */
export function writeJson(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* indisponible */
  }
}
