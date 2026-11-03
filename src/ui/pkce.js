// Connexion OAuth 2 sans serveur ni bibliothèque : « code d'autorisation + PKCE » (RFC 7636). Sert à Dropbox,
// qui délivre un jeton de rafraîchissement aux applications sans secret : l'accès se renouvelle ensuite sans clic.
// La connexion s'ouvre dans une fenêtre qui revient sur le site ; si le navigateur la bloque (ou dans
// l'application installée sur iPhone et iPad, sans lien avec une telle fenêtre), la page elle-même part chez
// le fournisseur et la réponse est traitée à son retour (completeRedirectSignIn).
import { AppError } from '../core/errors.js';
import { readJson as readLocal, writeJson as writeLocal } from './local.js';

const MESSAGE = 'flashcard-auth';
/** Connexion par redirection en cours : { key, state, verifier, intent, back, at }. */
const PENDING = 'flashcard.authPending';
const PENDING_MAX_MS = 30 * 60 * 1000;
/** Clients créés, par clé de stockage : la réponse d'une redirection revient au bon. */
const clients = new Map();

/** Adresse de retour déclarée chez le fournisseur : la page d'accueil du site, barre finale comprise. */
export const redirectUri = () => location.origin + location.pathname;

const base64url = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** Défi S256 d'un vérificateur PKCE. */
export async function pkceChallenge(verifier) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}
const randomString = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

/** Identifiant d'application : valeur du build, ou `localKey` dans le stockage local (tests, hébergement personnel). */
export function appId(localKey, built) {
  try {
    const local = localStorage.getItem(localKey);
    if (local) return local;
  } catch {
    /* stockage local indisponible */
  }
  return built || '';
}

/** Application installée sur l'écran d'accueil d'un iPhone ou iPad : une fenêtre ouverte n'y peut pas répondre. */
const preferRedirect = () => typeof navigator !== 'undefined' && navigator.standalone === true;

/**
 * Client d'un fournisseur.
 * @param {{name:string, storageKey:string, clientId:()=>string, authorizeUrl:string, tokenUrl:string,
 *          authorizeParams?:Record<string,string>, tokenParams?:Record<string,string>,
 *          fetchImpl?: typeof fetch}} o
 */
export function pkceClient({
  name,
  storageKey,
  clientId,
  authorizeUrl,
  tokenUrl,
  authorizeParams = {},
  tokenParams = {},
  fetchImpl = (...a) => fetch(...a),
}) {
  const load = () => readLocal(storageKey);
  const store = (r) => {
    const t = {
      access: r.access_token,
      exp: Date.now() + r.expires_in * 1000,
      refresh: r.refresh_token || load()?.refresh,
    };
    writeLocal(storageKey, t); // stockage indisponible : jeton gardé pour cette page seulement
    return t.access;
  };
  /**
   * Demande de jeton. Refus du fournisseur (code ou jeton de rafraîchissement invalide, révoqué) : `syncAuth`,
   * il faut se reconnecter. Réseau absent ou service en panne : autre erreur, le jeton reste et la
   * synchronisation réessaiera.
   */
  const tokenRequest = async (params) => {
    let res;
    try {
      res = await fetchImpl(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId(), ...tokenParams, ...params }),
      });
    } catch {
      throw new AppError('syncOffline', `${name} injoignable (réseau)`, { service: name });
    }
    const r = await res.json().catch(() => ({}));
    if (res.ok && r.access_token) return store(r);
    if (res.status === 400 || res.status === 401)
      throw new AppError('syncAuth', `Connexion ${name} refusée (${r.error || res.status})`);
    throw new AppError('syncHttp', `${name} : erreur ${res.status}`, {
      service: name,
      status: res.status,
      detail: r.error || '',
    });
  };
  const exchange = (code, verifier) =>
    tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: verifier });

  /**
   * Connexion, à appeler directement dans un clic (la fenêtre doit s'ouvrir avant toute attente, sinon le
   * navigateur la bloque). `intent` : rendu par completeRedirectSignIn si la page a dû partir chez le
   * fournisseur ; la promesse ne se résout alors jamais.
   */
  const signIn = async (intent = '') => {
    const popup = preferRedirect() ? null : window.open('', 'flashcard-auth', 'width=480,height=680');
    const verifier = randomString();
    const state = randomString();
    const url = new URL(authorizeUrl);
    url.search = new URLSearchParams({
      client_id: clientId(),
      response_type: 'code',
      redirect_uri: redirectUri(),
      state,
      code_challenge: await pkceChallenge(verifier),
      code_challenge_method: 'S256',
      ...authorizeParams,
    });
    if (!popup) {
      writeLocal(PENDING, { key: storageKey, state, verifier, intent, back: location.hash, at: Date.now() });
      location.assign(url.href);
      return new Promise(() => {}); // la page s'en va
    }
    writeLocal(PENDING, null); // une redirection abandonnée plus tôt ne doit pas capter la réponse de la fenêtre
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
          reject(new AppError('syncSignIn', `Connexion ${name} interrompue`, { service: name }));
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
      throw new AppError('syncSignIn', `Connexion ${name} refusée (${p.get('error') || 'réponse invalide'})`, {
        service: name,
      });
    return exchange(p.get('code'), verifier);
  };

  const client = {
    name,
    /**
     * Jeton d'accès, sans clic : en cache, sinon rafraîchi (`renew` : rafraîchi même s'il semble valide, après
     * un refus du service). Sans jeton de rafraîchissement valable : `syncAuth` (reconnexion par signIn).
     */
    async token({ renew = false } = {}) {
      const t = load();
      if (!renew && t?.access && t.exp > Date.now() + 60_000) return t.access;
      if (t?.refresh) {
        try {
          return await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh });
        } catch (e) {
          if (e.code !== 'syncAuth') throw e; // réseau, panne : on garde le jeton, on réessaiera
          writeLocal(storageKey, { ...t, refresh: null });
        }
      }
      throw new AppError('syncAuth', `Connexion à ${name} à renouveler`);
    },
    signIn,
    exchange,
    /** Un jeton de rafraîchissement est connu : l'accès peut se renouveler sans clic. */
    canRenew: () => !!load()?.refresh,
    forget: () => writeLocal(storageKey, null),
  };
  clients.set(storageKey, client);
  return client;
}

/**
 * Au démarrage, page revenue de chez le fournisseur (?code=… ou ?error=…) sans fenêtre qui l'attende :
 * échange le code contre un jeton (connexion par redirection en cours) et rend l'adresse d'origine.
 * Renvoie `{ intent }`, ou null s'il n'y avait rien à traiter.
 */
export async function completeRedirectSignIn() {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return null;
  const pending = readLocal(PENDING);
  writeLocal(PENDING, null);
  history.replaceState(null, '', redirectUri() + (pending?.back || ''));
  const client = pending && Date.now() - pending.at < PENDING_MAX_MS && clients.get(pending.key);
  if (!client) return null; // réponse sans demande en cours (ancienne, autre onglet) : ignorée
  if (q.get('state') !== pending.state || !q.get('code'))
    throw new AppError('syncSignIn', `Connexion refusée (${q.get('error') || 'réponse invalide'})`, {
      service: client.name,
    });
  await client.exchange(q.get('code'), pending.verifier);
  return { intent: pending.intent };
}

/**
 * Au démarrage : dans une fenêtre de connexion revenue sur le site (?code=… ou ?error=…), transmet la
 * réponse à la page qui l'a ouverte et ferme la fenêtre. Renvoie vrai si c'est le cas.
 */
export function handleAuthRedirect() {
  if (!window.opener || !/[?&](code|error)=/.test(location.search)) return false;
  // la page elle-même était partie chez le fournisseur (et non une fenêtre) : même état que la demande en cours
  const state = new URLSearchParams(location.search).get('state');
  if (state && readLocal(PENDING)?.state === state) return false;
  try {
    window.opener.postMessage({ type: MESSAGE, search: location.search }, location.origin);
  } finally {
    window.close();
  }
  return true;
}
