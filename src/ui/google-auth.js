// Connexion à Google Drive sans serveur : Google Identity Services, modèle « jeton ». Le jeton d'accès
// dure une heure ; il est gardé dans ce navigateur pour survivre à un rechargement. Ensuite, un clic
// le renouvelle (fenêtre éphémère, sans nouveau consentement).
import { AppError } from '../core/errors.js';
import { SCOPE } from '../storage/gdrive.js';

/**
 * Identifiant OAuth de ce site : variable GOOGLE_CLIENT_ID au build, ou `flashcard.googleClientId` dans le
 * stockage local (tests, hébergement personnel ; Google ne l'accepte que depuis les domaines déclarés).
 * Vide : Google Drive indisponible.
 */
export function googleClientId() {
  try {
    const local = localStorage.getItem('flashcard.googleClientId');
    if (local) return local;
  } catch {
    /* stockage local indisponible */
  }
  return typeof __GOOGLE_CLIENT_ID__ === 'string' ? __GOOGLE_CLIENT_ID__ : '';
}

const KEY = 'flashcard.gdriveToken';
let gis = null;

function loadGis() {
  gis ||= new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement('script'), {
      src: 'https://accounts.google.com/gsi/client',
      async: true,
      onload: () => resolve(window.google),
      onerror: () => {
        gis = null;
        reject(new AppError('syncLoad', 'Service de connexion Google injoignable'));
      },
    });
    document.head.append(s);
  });
  return gis;
}

/** Jeton encore valide (au moins une minute), ou null. */
export function cachedToken() {
  try {
    const t = JSON.parse(localStorage.getItem(KEY));
    return t && t.exp > Date.now() + 60_000 ? t.token : null;
  } catch {
    return null;
  }
}

/** Demande un jeton : à appeler depuis un clic (le navigateur bloque sinon la fenêtre de connexion). */
export async function requestToken({ consent = false } = {}) {
  const google = await loadGis();
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: googleClientId(),
      scope: SCOPE,
      prompt: consent ? 'consent' : '',
      callback: (r) => {
        if (r.error) return reject(new AppError('syncAuth', `Connexion Google refusée (${r.error})`));
        try {
          localStorage.setItem(KEY, JSON.stringify({ token: r.access_token, exp: Date.now() + r.expires_in * 1000 }));
        } catch {
          /* stockage local indisponible : jeton gardé pour cette page seulement */
        }
        resolve(r.access_token);
      },
      error_callback: (e) => reject(new AppError('syncAuth', `Connexion Google interrompue (${e.type})`)),
    });
    client.requestAccessToken();
  });
}

/** Oublie le jeton et le révoque auprès de Google. */
export function forgetToken() {
  const token = cachedToken();
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* rien à oublier */
  }
  if (token) window.google?.accounts?.oauth2?.revoke(token, () => {});
}
