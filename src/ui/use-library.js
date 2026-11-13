// Cycle de vie de la bibliothèque : ouverture (dossier mémorisé ou navigateur), première ouverture,
// fusion des copies en conflit, relecture au retour au premier plan, réglages.
import { useCallback, useEffect, useState } from 'preact/hooks';
import { SHARED_PATH } from '../storage/library.js';
import { openLibrary } from './boot.js';
import { firstRun } from './first-run.js';
import { getLang, setLang } from './i18n.js';
import { langNoticeSeen } from './lang-notice.jsx';

export function useLibrary() {
  const [lib, setLib] = useState(null);
  const [meta, setMeta] = useState({}); // { kind: 'idb' | 'fsa', folderName, needsPermission }
  const [settings, setSettings] = useState(null);
  const [version, setVersion] = useState(0); // incrémentée quand les fichiers ont pu changer
  const [fatal, setFatal] = useState(null);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  /** Bascule sur une bibliothèque ouverte (démarrage, changement de dossier ou de stockage). */
  const open = useCallback(
    async (opened) => {
      setLib(opened.lib);
      setMeta({ kind: opened.kind, folderName: opened.folderName, needsPermission: opened.needsPermission });
      // stockage du navigateur : demander qu'il soit gardé (sinon Safari peut l'effacer après 7 jours sans visite)
      if (opened.kind === 'idb') navigator.storage?.persist?.().catch(() => {});
      try {
        await firstRun(opened.lib);
      } catch (e) {
        console.warn("Jeux d'exemple non importés (nouvel essai à la prochaine ouverture)", e);
      }
      await setLang(opened.lib.settings.lang); // dictionnaire chargé avant le premier affichage
      setSettings(opened.lib.settings);
      try {
        await opened.lib.resolveConflicts();
      } catch (e) {
        console.warn('Résolution des conflits impossible', e);
      }
      refresh();
    },
    [refresh],
  );

  useEffect(() => {
    openLibrary().then(open, setFatal);
  }, [open]);

  // Retour au premier plan : un autre appareil a pu modifier les fichiers (iCloud, Syncthing…).
  useEffect(() => {
    if (!lib) return;
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        if ((await lib.resolveConflicts()) > 0) refresh();
      } catch (e) {
        console.warn('Résolution des conflits impossible', e);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [lib, refresh]);

  // réglages partagés apportés par la synchronisation : relus et appliqués
  useEffect(() => {
    if (!lib) return;
    return lib.onExternalChange(async (path) => {
      if (path !== SHARED_PATH) return;
      lib.settings = await lib.loadSettings();
      setSettings(lib.settings);
    });
  }, [lib]);

  const saveSettings = useCallback(
    async (next) => {
      setSettings(next);
      if (next.lang !== getLang()) {
        langNoticeSeen();
        await setLang(next.lang);
      }
      await lib.saveSettings(next);
    },
    [lib],
  );

  return { lib, meta, settings, version, fatal, refresh, open, saveSettings };
}
