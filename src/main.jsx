import { start } from './ui/app.jsx';
import { handleAuthRedirect } from './ui/pkce.js';

// fenêtre de connexion (Microsoft, Dropbox) revenue sur le site : elle transmet la réponse et se ferme
if (!handleAuthRedirect()) start();

// Hors-ligne : le service worker met l'application en cache (HTTPS ou localhost uniquement).
if (
  'serviceWorker' in navigator &&
  (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')
) {
  // nouvelle version activée (le service worker prend la main) : l'application propose de recharger
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) dispatchEvent(new Event('flashcard-update'));
  });
  addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        // application restée ouverte (onglet, PWA) : chercher une nouvelle version à chaque retour au premier plan
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      })
      .catch((e) => console.warn('Service worker indisponible', e));
  });
}
