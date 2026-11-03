// Installation de l'application (écran d'accueil, Dock, bureau) et protection du stockage contre l'effacement.
// Un navigateur peut effacer les données d'un site : Safari après 7 jours sans visite si le site n'est pas
// installé, les autres quand la place manque, sauf stockage « persistant ». Installée, l'application est à
// l'abri ; à défaut, on demande la persistance (sans question à l'utilisateur, sauf Firefox : depuis un clic).

/**
 * Famille d'appareil et de navigateur, pour dire comment installer :
 * 'ios' (iPhone, iPad : tout navigateur, moteur Safari) | 'mac-safari' | 'firefox-android' | 'firefox-desktop' |
 * 'chromium' (Chrome, Edge, Samsung Internet… : invite d'installation possible) | 'other'.
 */
export function installPlatform(ua = navigator.userAgent, touchPoints = navigator.maxTouchPoints || 0) {
  // iPadOS se présente comme un Mac, mais tactile
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return 'ios';
  if (/Firefox\//.test(ua)) return /Android/.test(ua) ? 'firefox-android' : 'firefox-desktop';
  if (/Chrome\/|Chromium\/|Edg\//.test(ua)) return 'chromium';
  if (/Macintosh/.test(ua) && /Safari\//.test(ua)) return 'mac-safari';
  return 'other';
}

/** Safari (iPhone, iPad, Mac) : données d'un site non installé effacées après 7 jours sans visite. */
export const weeklyWipe = (platform) => platform === 'ios' || platform === 'mac-safari';

/** L'application installée a ses propres données, distinctes de celles du navigateur (iPhone, iPad, Mac Safari). */
export const separateStorage = weeklyWipe;

/**
 * Ouverte comme une application installée (et non dans un onglet). Pas « fullscreen » : un onglet en plein
 * écran (F11) le serait aussi.
 */
export function isInstalled() {
  if (typeof navigator !== 'undefined' && navigator.standalone === true) return true;
  return ['standalone', 'minimal-ui', 'window-controls-overlay'].some(
    (m) => typeof matchMedia === 'function' && matchMedia(`(display-mode: ${m})`).matches,
  );
}

// Invite d'installation des navigateurs Chromium, gardée pour un bouton « Installer » ; prévenir à son arrivée
let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((f) => f());
if (typeof addEventListener === 'function') {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // pas de mini-barre du navigateur : l'application propose l'installation à sa façon
    deferred = e;
    notify();
  });
  addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

/** Abonnement aux changements (invite disponible, application installée) ; renvoie le désabonnement. */
export function onInstallChange(f) {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Le navigateur peut afficher son invite d'installation. */
export const canPromptInstall = () => !!deferred;

/** Invite d'installation (depuis un clic) ; vrai si l'utilisateur l'a acceptée. */
export async function promptInstall() {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  await e.prompt();
  const choice = await e.userChoice.catch(() => null);
  notify();
  return choice?.outcome === 'accepted';
}

/** Stockage persistant accordé : le navigateur n'effacera pas les données faute de place. */
export async function isPersisted() {
  try {
    return (await navigator.storage?.persisted?.()) === true;
  } catch {
    return false;
  }
}

/**
 * Demande la persistance du stockage. Chromium et Safari décident seuls, sans question ; Firefox pose la
 * question : seulement si `fromClick`. Renvoie vrai si elle est accordée.
 */
export async function requestPersistence({ fromClick = false } = {}) {
  if (!navigator.storage?.persist) return false;
  if (await isPersisted()) return true;
  if (!fromClick && installPlatform().startsWith('firefox')) return false;
  try {
    return (await navigator.storage.persist()) === true;
  } catch {
    return false;
  }
}

let startup = null;
/** Au démarrage, une fois par page : persistance demandée sans question (voir requestPersistence). */
export const ensurePersistence = () => (startup ||= requestPersistence());

/**
 * Risque d'effacement des données de cet appareil : 'weekly' (Safari, application non installée), 'space'
 * (stockage non persistant), ou null (installée, ou stockage protégé).
 */
export async function storageRisk(platform = installPlatform()) {
  await ensurePersistence();
  if (isInstalled()) return null;
  if (weeklyWipe(platform)) return 'weekly';
  return (await isPersisted()) ? null : 'space';
}
