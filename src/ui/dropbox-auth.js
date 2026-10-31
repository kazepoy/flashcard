// Connexion à Dropbox : PKCE (ui/pkce.js) avec accès « hors ligne » : le jeton de rafraîchissement ne
// périme pas (jusqu'à révocation), la synchronisation reste connectée sans clic.
import { appId, pkceClient } from './pkce.js';

/** Clé d'application Dropbox : DROPBOX_APP_KEY au build, ou `flashcard.dropboxAppKey`. */
export const dropboxAppKey = () =>
  appId('flashcard.dropboxAppKey', typeof __DROPBOX_APP_KEY__ === 'string' ? __DROPBOX_APP_KEY__ : '');

const client = pkceClient({
  name: 'Dropbox',
  storageKey: 'flashcard.dropboxToken',
  clientId: dropboxAppKey,
  authorizeUrl: 'https://www.dropbox.com/oauth2/authorize',
  tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
  authorizeParams: { token_access_type: 'offline' },
});

export const dropboxToken = (o) => client.token(o);
export const forgetDropbox = () => client.forget();
