// Service worker Flashcard : l'application fonctionne hors ligne une fois chargée.
// Les marqueurs de version et de liste de préchargement sont remplacés par build.mjs.
const VERSION = '__VERSION__';
const CACHE = `flashcard-${VERSION}`;
const PRECACHE = __PRECACHE__;

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
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('flashcard-') && k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
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
        if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
        return res;
      } catch (e) {
        if (req.mode === 'navigate') return (await caches.match('./index.html')) || Response.error();
        throw e;
      }
    }),
  );
});
