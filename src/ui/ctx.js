import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

// ---- routage par hash : #/ , #/set/ID , #/set/ID/edit , #/set/ID/study/MODE , #/settings
export function parseRoute(hash = location.hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return parts;
}
/**
 * Adresse découpée (useRoute) → page nommée et ses paramètres :
 * #/set/<id>[/edit[/<carte>] | /print | /study/<mode>[/more]], #/browse[/<requête>], #/stats[/<id>],
 * #/settings, #/help ; tout le reste → bibliothèque.
 */
export function routeOf(parts) {
  const [a, b, c, d, e] = parts;
  if (a === 'set' && b) {
    if (c === 'edit') return { page: 'edit', setId: b, cardId: d };
    if (c === 'print') return { page: 'print', setId: b };
    if (c === 'study' && d) return { page: 'study', setId: b, mode: d, variant: e };
    return { page: 'set', setId: b };
  }
  if (a === 'browse') return { page: 'browse', query: parts.slice(1).join('/') };
  if (a === 'stats') return { page: 'stats', setId: b || null };
  if (a === 'settings' && b === 'sync') return { page: 'sync' };
  if (a === 'settings' || a === 'help') return { page: a };
  return { page: 'library' };
}

export function useRoute() {
  const [r, setR] = useState(() => parseRoute());
  useEffect(() => {
    const f = () =>
      setR((prev) => {
        const next = parseRoute();
        return next.join('/') === prev.join('/') ? prev : next;
      });
    addEventListener('hashchange', f);
    f(); // un changement survenu entre le rendu et l'abonnement serait sinon perdu
    return () => removeEventListener('hashchange', f);
  }, []);
  return r;
}
export const go = (path) => {
  location.hash = '#/' + path.replace(/^\/+/, '');
};
export const href = (path) => '#/' + path.replace(/^\/+/, '');

/** Charge une ressource asynchrone : {data, error, loading, reload}. */
export function useAsync(fn, deps) {
  const [st, setSt] = useState({ data: null, error: null, loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setSt((s) => ({ ...s, loading: true }));
    Promise.resolve()
      .then(fn)
      .then((data) => live && setSt({ data, error: null, loading: false }))
      .catch((error) => live && setSt({ data: null, error, loading: false }));
    return () => {
      live = false;
    };
    // dépendances fournies par l'appelant (comme useEffect) : invérifiables statiquement
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { ...st, reload: () => setN((x) => x + 1) };
}
