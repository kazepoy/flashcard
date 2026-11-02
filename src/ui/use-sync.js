// Synchronisation automatique de la bibliothèque avec un stockage en ligne (Dropbox) : à l'ouverture, au
// retour au premier plan, quelques secondes après chaque modification, toutes les 5 minutes.
// Google Drive et OneDrive ont été retirés (connexions qui expirent sans serveur : 1 h, ~24 h) ; leur code
// est dans l'historique git (version 0.2.7), voir docs/SYNC.md.
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DropboxRemote } from '../storage/dropbox.js';
import { clearRemote, removeStrayFiles, syncLibrary } from '../storage/sync.js';
import { dropboxAppKey, dropboxToken, forgetDropbox } from './dropbox-auth.js';

const KEY = 'flashcard.sync';
const AFTER_WRITE_MS = 4000;
const EVERY_MS = 5 * 60 * 1000;

/** Services proposés : jeton (silencieux si possible, sinon depuis un clic), dossier distant, oubli. */
export const PROVIDERS = {
  dropbox: {
    name: 'Dropbox',
    available: () => !!dropboxAppKey(),
    token: ({ interactive }) => dropboxToken({ interactive }),
    signIn: () => dropboxToken({ interactive: true, force: true }),
    remote: (getToken) => new DropboxRemote(getToken),
    forget: forgetDropbox,
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
  // fichiers écrits ici depuis la dernière synchronisation ; `verified` : une vérification complète a eu lieu
  // depuis l'ouverture ou le dernier retour au premier plan (un autre onglet ou logiciel a pu écrire entre-temps)
  const dirty = useRef(new Set());
  const verified = useRef(false);
  useEffect(() => {
    dirty.current = new Set();
    verified.current = false;
    if (!lib) return;
    const off = lib.onWrite((path) => dirty.current.add(path));
    const onVisible = () => document.visibilityState === 'visible' && (verified.current = false);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      off();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [lib]);

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

  /**
   * Une synchronisation : recopie, fusion et suppressions dans les deux sens. Après une vérification complète,
   * seuls les fichiers écrits depuis sont relus (les autres gardent leur empreinte de la fois précédente).
   */
  const syncWith = useCallback(
    async (remote) => {
      const written = dirty.current;
      dirty.current = new Set();
      const full = !verified.current;
      let r;
      try {
        r = await syncLibrary(
          lib,
          remote,
          { files: cfg.current.files },
          { unchanged: full ? null : (p) => !written.has(p) },
        );
      } catch (e) {
        for (const p of written) dirty.current.add(p); // à relire à la prochaine
        throw e;
      }
      verified.current = true;
      update({ files: r.state.files, lastSync: new Date().toISOString() });
      if (r.pulled || r.merged || r.removed) refresh();
    },
    [lib, refresh, update],
  );

  /**
   * Une opération sur le dossier distant, une seule à la fois (une synchronisation en cours est attendue) ;
   * `interactive` : appelée d'un clic, peut ouvrir la connexion. Renvoie le résultat de `fn` ; une erreur
   * est affichée dans l'état et relancée si `rethrow`.
   */
  const exclusive = useCallback(async (fn, { interactive = false, rethrow = false } = {}) => {
    while (running.current) await running.current.catch(() => {});
    const provider = PROVIDERS[cfg.current.provider];
    if (!provider) return undefined;
    setView((v) => ({ ...v, status: 'syncing', error: null }));
    const op = (async () => {
      const remote = provider.remote(() => provider.token({ interactive }));
      return fn(remote);
    })();
    running.current = op;
    try {
      const out = await op;
      setView((v) => ({ ...v, status: 'idle' }));
      return out;
    } catch (e) {
      setView((v) => ({ ...v, status: e.code === 'syncAuth' ? 'paused' : 'error', error: e }));
      if (rethrow) throw e;
      return undefined;
    } finally {
      running.current = null;
    }
  }, []);

  /** Une synchronisation (une seule à la fois ; un appel pendant une synchronisation la rejoint). */
  const run = useCallback(
    ({ interactive = false } = {}) => {
      if (!lib || !PROVIDERS[cfg.current.provider]) return Promise.resolve();
      if (running.current) return running.current.catch(() => {});
      return exclusive(syncWith, { interactive });
    },
    [lib, exclusive, syncWith],
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
      update({ provider: id, files: {} });
      setView((v) => ({ ...v, status: 'idle' }));
      await run({ interactive: true });
    },
    [run, update],
  );

  /** Déconnexion : les données restent ici et en ligne ; seul le lien entre les deux est oublié. */
  const disconnect = useCallback(() => {
    PROVIDERS[cfg.current.provider]?.forget();
    update({ provider: null, files: {}, lastSync: null });
    setView((v) => ({ ...v, status: 'off', error: null }));
  }, [update]);

  /**
   * Arrêt avant d'effacer la bibliothèque de cet appareil : déconnexion, puis fin de la synchronisation en cours.
   * Aucune synchronisation ne peut ensuite prendre les fichiers effacés pour des suppressions à propager.
   */
  const halt = useCallback(async () => {
    disconnect();
    while (running.current) await running.current.catch(() => {});
  }, [disconnect]);

  /**
   * Nettoyage du stockage en ligne : médias inutilisés supprimés ici puis, par la synchronisation, en ligne ;
   * fichiers distants étrangers à la bibliothèque supprimés. Renvoie `{ media, stray }` (nombres de fichiers).
   */
  const clean = useCallback(
    () =>
      exclusive(
        async (remote) => {
          const media = await lib.gcMedia();
          await syncWith(remote);
          return { media, stray: await removeStrayFiles(remote) };
        },
        { interactive: true, rethrow: true },
      ),
    [lib, exclusive, syncWith],
  );

  /**
   * Purge : vide le dossier en ligne puis déconnecte (une synchronisation suivante prendrait ce dossier vide
   * pour des suppressions à propager ici). La bibliothèque de cet appareil n'est pas touchée.
   */
  const purge = useCallback(async () => {
    const n = await exclusive(clearRemote, { interactive: true, rethrow: true });
    disconnect();
    return n;
  }, [exclusive, disconnect]);

  return useMemo(
    () => ({
      ...view,
      service: PROVIDERS[view.provider]?.name ?? '',
      syncNow: () => run({ interactive: true }),
      setAuto: (auto) => update({ auto }),
      connect,
      disconnect,
      clean,
      purge,
      halt,
    }),
    [view, run, update, connect, disconnect, clean, purge, halt],
  );
}
