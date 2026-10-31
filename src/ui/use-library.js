// Cycle de vie de la bibliothèque : ouverture (dossier mémorisé ou navigateur), première ouverture,
// fusion des copies en conflit, relecture au retour au premier plan, réglages.
import { useCallback, useEffect, useState } from 'preact/hooks';
import { openLibrary } from './boot.js';
import { firstRun } from './first-run.js';
import { getLang, setLang } from './i18n.js';

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
      try {
        await firstRun(opened.lib);
      } catch (e) {
        console.warn("Jeux d'exemple non importés (nouvel essai à la prochaine ouverture)", e);
      }
      setSettings(opened.lib.settings);
      setLang(opened.lib.settings.lang);
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

  const saveSettings = useCallback(
    async (next) => {
      setSettings(next);
      if (next.lang !== getLang()) setLang(next.lang);
      await lib.saveSettings(next);
    },
    [lib],
  );

  return { lib, meta, settings, version, fatal, refresh, open, saveSettings };
}
