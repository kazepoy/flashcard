import { start } from './ui/app.jsx';
import { handleAuthRedirect } from './ui/microsoft-auth.js';

// fenêtre de connexion Microsoft revenue sur le site : elle transmet la réponse et se ferme
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
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker indisponible', e));
  });
}
