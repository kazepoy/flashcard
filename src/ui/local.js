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
