// Synchronisation automatique de la bibliothèque avec un stockage en ligne (Google Drive, OneDrive) :
// à l'ouverture, au retour au premier plan, quelques secondes après chaque modification, toutes les 5 minutes.
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { AppError } from '../core/errors.js';
import { GDriveRemote } from '../storage/gdrive.js';
import { OneDriveRemote } from '../storage/onedrive.js';
import { syncLibrary } from '../storage/sync.js';
import { cachedToken, forgetToken, googleClientId, requestToken } from './google-auth.js';
import { forgetMs, msClientId, msToken } from './microsoft-auth.js';

const KEY = 'flashcard.sync';
const AFTER_WRITE_MS = 4000;
const EVERY_MS = 5 * 60 * 1000;

/** Services proposés : jeton (silencieux si possible, sinon depuis un clic), dossier distant, oubli. */
export const PROVIDERS = {
  gdrive: {
    name: 'Google Drive',
    available: () => !!googleClientId(),
    token: async ({ interactive }) => {
      const token = cachedToken();
      if (token) return token;
      if (interactive) return requestToken();
      throw new AppError('syncAuth', 'Connexion à Google Drive à renouveler');
    },
    signIn: () => requestToken({ consent: true }),
    remote: (getToken, cfg) => new GDriveRemote(getToken, { folderId: cfg.folderId ?? null }),
    forget: forgetToken,
  },
  onedrive: {
    name: 'OneDrive',
    available: () => !!msClientId(),
    token: ({ interactive }) => msToken({ interactive }),
    signIn: () => msToken({ interactive: true, force: true }),
    remote: (getToken) => new OneDriveRemote(getToken),
    forget: forgetMs,
  },
};

function loadConfig() {
  try {
    return { provider: null, auto: true, files: {}, ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    return { provider: null, auto: true, files: {} };
  }
}
function saveConfig(cfg) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* stockage local indisponible : la synchronisation repartira de zéro (fusion, sans perte) */
  }
}

/**
 * État et commandes de la synchronisation. `status` : 'off' | 'idle' | 'syncing' | 'paused' (connexion
 * à renouveler d'un clic) | 'error'.
 */
export function useSync(lib, refresh) {
  const cfg = useRef(loadConfig());
  const [view, setView] = useState(() => ({
    provider: PROVIDERS[cfg.current.provider] ? cfg.current.provider : null,
    auto: cfg.current.auto,
    lastSync: cfg.current.lastSync ?? null,
    status: PROVIDERS[cfg.current.provider] ? 'idle' : 'off',
    error: null,
  }));
  const running = useRef(null);

  const update = useCallback((patch) => {
    cfg.current = { ...cfg.current, ...patch };
    saveConfig(cfg.current);
    setView((v) => ({
      ...v,
      provider: cfg.current.provider,
      auto: cfg.current.auto,
      lastSync: cfg.current.lastSync ?? null,
    }));
  }, []);

  /** Une synchronisation (une seule à la fois) ; `interactive` : appelée d'un clic, peut ouvrir la connexion. */
  const run = useCallback(
    ({ interactive = false } = {}) => {
      const provider = PROVIDERS[cfg.current.provider];
      if (!lib || !provider) return Promise.resolve();
      if (running.current) return running.current;
      setView((v) => ({ ...v, status: 'syncing', error: null }));
      running.current = (async () => {
        try {
          const remote = provider.remote(() => provider.token({ interactive }), cfg.current);
          const r = await syncLibrary(lib, remote, { files: cfg.current.files });
          update({ files: r.state.files, folderId: remote.folderId ?? null, lastSync: new Date().toISOString() });
          if (r.pulled || r.merged || r.removed) refresh();
          setView((v) => ({ ...v, status: 'idle' }));
        } catch (e) {
          setView((v) => ({ ...v, status: e.code === 'syncAuth' ? 'paused' : 'error', error: e }));
        } finally {
          running.current = null;
        }
      })();
      return running.current;
    },
    [lib, refresh, update],
  );

  // déclencheurs automatiques
  useEffect(() => {
    if (!lib || !view.provider || !view.auto) return;
    run();
    let timer = null;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(run, AFTER_WRITE_MS);
    };
    const off = lib.onWrite(soon);
    const onVisible = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVisible);
    const every = setInterval(() => document.visibilityState === 'visible' && run(), EVERY_MS);
    return () => {
      off();
      clearTimeout(timer);
      clearInterval(every);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [lib, view.provider, view.auto, run]);

  /** Connexion (depuis un clic) puis première synchronisation : fusion des deux côtés, sans perte. */
  const connect = useCallback(
    async (id) => {
      await PROVIDERS[id].signIn();
      update({ provider: id, files: {}, folderId: null });
      setView((v) => ({ ...v, status: 'idle' }));
      await run({ interactive: true });
    },
    [run, update],
  );

  /** Déconnexion : les données restent ici et en ligne ; seul le lien entre les deux est oublié. */
  const disconnect = useCallback(() => {
    PROVIDERS[cfg.current.provider]?.forget();
    update({ provider: null, files: {}, folderId: null, lastSync: null });
    setView((v) => ({ ...v, status: 'off', error: null }));
  }, [update]);

  return useMemo(
    () => ({
      ...view,
      service: PROVIDERS[view.provider]?.name ?? '',
      syncNow: () => run({ interactive: true }),
      setAuto: (auto) => update({ auto }),
      connect,
      disconnect,
    }),
    [view, run, update, connect, disconnect],
  );
}
