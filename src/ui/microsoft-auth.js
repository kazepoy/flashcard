// Connexion à OneDrive sans serveur ni bibliothèque : OAuth 2 « code d'autorisation + PKCE » de la
// plateforme d'identité Microsoft, dans une fenêtre. Le jeton de rafraîchissement (environ 24 h pour une
// application monopage) renouvelle l'accès sans clic ; ensuite, un clic rouvre la connexion.
import { AppError } from '../core/errors.js';

const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const SCOPES = 'Files.ReadWrite.AppFolder offline_access';
const KEY = 'flashcard.onedriveToken'; // { access, exp, refresh }
const MESSAGE = 'flashcard-auth';

/** Identifiant d'application Microsoft : MS_CLIENT_ID au build, ou `flashcard.msClientId` (tests, hébergement personnel). */
export function msClientId() {
  try {
    const local = localStorage.getItem('flashcard.msClientId');
    if (local) return local;
  } catch {
    /* stockage local indisponible */
  }
  return typeof __MS_CLIENT_ID__ === 'string' ? __MS_CLIENT_ID__ : '';
}

/** Adresse de retour déclarée dans l'inscription de l'application (page d'accueil du site). */
const redirectUri = () => location.origin + location.pathname;

const base64url = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** PKCE (RFC 7636) : défi S256 d'un vérificateur. */
export async function pkceChallenge(verifier) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}
const randomString = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}
function store(r) {
  const t = {
    access: r.access_token,
    exp: Date.now() + r.expires_in * 1000,
    refresh: r.refresh_token || load()?.refresh,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    /* stockage local indisponible : jeton gardé pour cette page seulement */
  }
  return t.access;
}

async function tokenRequest(params) {
  const res = await fetch(`${AUTHORITY}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: msClientId(), scope: SCOPES, ...params }),
  });
  const r = await res.json().catch(() => ({}));
  if (!res.ok || !r.access_token)
    throw new AppError('syncAuth', `Connexion Microsoft refusée (${r.error || res.status})`);
  return store(r);
}

/**
 * Fenêtre de connexion Microsoft (à ouvrir depuis un clic). La fenêtre revient sur le site avec
 * ?code=… : `handleAuthRedirect` (au démarrage) transmet la réponse à cette page et ferme la fenêtre.
 */
async function signIn() {
  const popup = window.open('', 'flashcard-microsoft', 'width=480,height=640');
  if (!popup) throw new AppError('syncAuth', 'Fenêtre de connexion bloquée par le navigateur');
  const verifier = randomString();
  const state = randomString();
  const url = new URL(`${AUTHORITY}/authorize`);
  url.search = new URLSearchParams({
    client_id: msClientId(),
    response_type: 'code',
    redirect_uri: redirectUri(),
    scope: SCOPES,
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  popup.location.href = url.href;
  const search = await new Promise((resolve, reject) => {
    const onMessage = (e) => {
      if (e.origin !== location.origin || e.data?.type !== MESSAGE) return;
      done();
      resolve(e.data.search);
    };
    const closed = setInterval(() => {
      if (popup.closed) {
        done();
        reject(new AppError('syncAuth', 'Connexion Microsoft interrompue'));
      }
    }, 500);
    const done = () => {
      clearInterval(closed);
      removeEventListener('message', onMessage);
    };
    addEventListener('message', onMessage);
  });
  const p = new URLSearchParams(search);
  if (p.get('state') !== state || !p.get('code'))
    throw new AppError('syncAuth', `Connexion Microsoft refusée (${p.get('error') || 'réponse invalide'})`);
  return tokenRequest({
    grant_type: 'authorization_code',
    code: p.get('code'),
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  });
}

/**
 * Jeton d'accès : en cache, sinon rafraîchi sans clic, sinon (`interactive`, depuis un clic) nouvelle
 * connexion. `force` : toujours ouvrir la connexion (premier branchement).
 */
export async function msToken({ interactive = false, force = false } = {}) {
  const t = load();
  if (!force && t?.access && t.exp > Date.now() + 60_000) return t.access;
  if (!force && t?.refresh) {
    try {
      return await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh });
    } catch {
      try {
        localStorage.setItem(KEY, JSON.stringify({ ...t, refresh: null }));
      } catch {
        /* rien à oublier */
      }
    }
  }
  if (interactive) return signIn();
  throw new AppError('syncAuth', 'Connexion à OneDrive à renouveler');
}

export function forgetMs() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* rien à oublier */
  }
}

/**
 * À appeler au démarrage : dans la fenêtre de connexion revenue sur le site (?code=… ou ?error=…),
 * transmet la réponse à la page qui l'a ouverte et ferme la fenêtre. Renvoie vrai si c'est le cas.
 */
export function handleAuthRedirect() {
  if (!window.opener || !/[?&](code|error)=/.test(location.search)) return false;
  try {
    window.opener.postMessage({ type: MESSAGE, search: location.search }, location.origin);
  } finally {
    window.close();
  }
  return true;
}
