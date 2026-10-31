import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { expandSet, usableFor } from '../core/items.js';
import { mergeProgress } from '../core/merge.js';
import { useApp } from './ctx.js';
import { errorText, t } from './i18n.js';

/**
 * Charge un jeu et sa progression. La progression est immuable : `update(fn)` applique `fn` à une
 * copie, publie la nouvelle version et l'enregistre en différé avec les lignes de journal (`log`).
 * Un échec d'enregistrement est signalé à l'utilisateur.
 */
export function useSetData(setId) {
  const { lib, toast } = useApp();
  const [state, setState] = useState({ loading: true, set: null, error: null, progress: null });
  const progress = useRef(null); // dernière version, pour l'enregistrement et les mises à jour en rafale
  const logBuf = useRef([]);
  const timer = useRef(null);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    timer.current = null;
    const lines = logBuf.current.splice(0);
    try {
      if (progress.current) await lib.saveProgress(progress.current);
      if (lines.length) await lib.appendLog(setId, lines);
    } catch (e) {
      logBuf.current.unshift(...lines); // nouvel essai au prochain enregistrement
      toast(t('common.progressSaveFailed', { m: errorText(e) }), 'bad');
    }
  }, [lib, setId, toast]);

  const update = useCallback(
    (fn) => {
      const next = structuredClone(progress.current);
      fn(next);
      progress.current = next;
      setState((s) => ({ ...s, progress: next }));
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 400);
    },
    [flush],
  );

  const log = useCallback((line) => {
    logBuf.current.push(line);
  }, []);

  // la synchronisation a modifié ce jeu ou sa progression : on recharge et on fusionne, sans rien écraser
  useEffect(
    () =>
      lib.onExternalChange(async (path) => {
        if (path === `progress/${setId}.json` && progress.current) {
          progress.current = mergeProgress(await lib.loadProgress(setId), progress.current);
          setState((s) => ({ ...s, progress: progress.current }));
        } else if (path === `sets/${setId}.json`) {
          const set = await lib.loadSet(setId);
          if (set) setState((s) => ({ ...s, set }));
        }
      }),
    [lib, setId],
  );

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [set, p] = await Promise.all([lib.loadSet(setId), lib.loadProgress(setId)]);
        if (!live) return;
        progress.current = p;
        setState({ loading: false, set, progress: p, error: set ? null : new Error(t('common.setNotFound')) });
      } catch (error) {
        if (live) setState({ loading: false, set: null, progress: null, error });
      }
    })();
    const onVis = () => document.visibilityState === 'hidden' && flush();
    addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      live = false;
      removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
      flush();
    };
  }, [lib, setId, flush]);

  return { ...state, update, log };
}

/** Items d'étude mémoïsés selon le sens et le filtre « étoilées » ; cartes suspendues exclues. */
export function useItems(set, progress, { direction = 'term', starredOnly = false, need = null } = {}) {
  // clé de valeur (et non d'identité) : chaque mise à jour de la progression en crée une copie
  const starredKey = starredOnly && progress ? Object.keys(progress.starred).sort().join() : '';
  const suspendedKey = Object.entries(progress?.suspended || {})
    .filter(([, v]) => v.s)
    .map(([id]) => id)
    .sort()
    .join();
  return useMemo(() => {
    if (!set) return [];
    const off = new Set(suspendedKey.split(','));
    const all = usableFor(expandSet(set, direction), need).filter((i) => !off.has(i.cardId));
    if (!starredOnly) return all;
    const starred = new Set(starredKey.split(','));
    return all.filter((i) => starred.has(i.cardId));
  }, [set, direction, starredOnly, need, starredKey, suspendedKey]);
}
