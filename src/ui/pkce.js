// Connexion OAuth 2 sans serveur ni bibliothèque : « code d'autorisation + PKCE » (RFC 7636) dans une
// fenêtre qui revient sur le site. Sert à OneDrive et Dropbox, qui délivrent un jeton de rafraîchissement
// aux applications sans secret : l'accès se renouvelle ensuite sans clic.
import { AppError } from '../core/errors.js';

const MESSAGE = 'flashcard-auth';

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

/**
 * Client d'un fournisseur.
 * @param {{name:string, storageKey:string, clientId:()=>string, authorizeUrl:string, tokenUrl:string,
 *          authorizeParams?:Record<string,string>, tokenParams?:Record<string,string>}} o
 */
export function pkceClient({
  name,
  storageKey,
  clientId,
  authorizeUrl,
  tokenUrl,
  authorizeParams = {},
  tokenParams = {},
}) {
  const load = () => {
    try {
      return JSON.parse(localStorage.getItem(storageKey)) || null;
    } catch {
      return null;
    }
  };
  const store = (r) => {
    const t = {
      access: r.access_token,
      exp: Date.now() + r.expires_in * 1000,
      refresh: r.refresh_token || load()?.refresh,
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(t));
    } catch {
      /* stockage local indisponible : jeton gardé pour cette page seulement */
    }
    return t.access;
  };
  const tokenRequest = async (params) => {
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId(), ...tokenParams, ...params }),
    });
    const r = await res.json().catch(() => ({}));
    if (!res.ok || !r.access_token)
      throw new AppError('syncAuth', `Connexion ${name} refusée (${r.error || res.status})`);
    return store(r);
  };

  /** Fenêtre de connexion (depuis un clic) ; `handleAuthRedirect` y renvoie la réponse puis la ferme. */
  const signIn = async () => {
    const popup = window.open('', 'flashcard-auth', 'width=480,height=680');
    if (!popup) throw new AppError('syncAuth', 'Fenêtre de connexion bloquée par le navigateur');
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
          reject(new AppError('syncAuth', `Connexion ${name} interrompue`));
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
      throw new AppError('syncAuth', `Connexion ${name} refusée (${p.get('error') || 'réponse invalide'})`);
    return tokenRequest({
      grant_type: 'authorization_code',
      code: p.get('code'),
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    });
  };

  return {
    /** Jeton : en cache, sinon rafraîchi sans clic, sinon (`interactive`, depuis un clic) nouvelle connexion. */
    async token({ interactive = false, force = false } = {}) {
      const t = load();
      if (!force && t?.access && t.exp > Date.now() + 60_000) return t.access;
      if (!force && t?.refresh) {
        try {
          return await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh });
        } catch {
          try {
            localStorage.setItem(storageKey, JSON.stringify({ ...t, refresh: null }));
          } catch {
            /* rien à oublier */
          }
        }
      }
      if (interactive) return signIn();
      throw new AppError('syncAuth', `Connexion à ${name} à renouveler`);
    },
    forget() {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* rien à oublier */
      }
    },
  };
}

/**
 * Au démarrage : dans une fenêtre de connexion revenue sur le site (?code=… ou ?error=…), transmet la
 * réponse à la page qui l'a ouverte et ferme la fenêtre. Renvoie vrai si c'est le cas.
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
