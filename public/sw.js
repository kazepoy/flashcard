// Service worker Flashcard : l'application fonctionne hors ligne une fois chargée.
// Les marqueurs de version et de listes de fichiers sont remplacés par build.mjs.
// - PRECACHE : téléchargés à l'installation (ce qui sert à chaque lancement), dans le cache de la version ;
// - ON_DEMAND : lecteur PDF, moteur Anki, polices de lecture, jeux d'exemple, autre langue… mis en cache à leur
//   première utilisation, dans un cache durable qui survit aux mises à jour (une police déjà utilisée reste
//   disponible hors ligne) ; ce qui n'existe plus dans la version courante y est supprimé à l'activation.
const VERSION = '__VERSION__';
const CACHE = `flashcard-${VERSION}`;
const LAZY_CACHE = 'flashcard-lazy';
const PRECACHE = __PRECACHE__;
const ON_DEMAND = new Set(__ON_DEMAND__.map((p) => new URL(p, self.registration.scope).href));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys())
        if (k.startsWith('flashcard-') && k !== CACHE && k !== LAZY_CACHE) await caches.delete(k);
      const lazy = await caches.open(LAZY_CACHE);
      for (const req of await lazy.keys()) if (!ON_DEMAND.has(req.url.split('?')[0])) await lazy.delete(req);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // API d'IA, etc. : jamais interceptées
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(async (hit) => {
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) {
          const name = ON_DEMAND.has(url.origin + url.pathname) ? LAZY_CACHE : CACHE;
          (await caches.open(name)).put(req, res.clone());
        }
        return res;
      } catch (e) {
        if (req.mode === 'navigate') return (await caches.match('./index.html')) || Response.error();
        throw e;
      }
    }),
  );
});
