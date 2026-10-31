// Connexion à OneDrive : plateforme d'identité Microsoft, PKCE (ui/pkce.js). Le jeton de rafraîchissement
// d'une application monopage dure environ 24 h ; ensuite, un clic rouvre la connexion.
import { appId, pkceClient } from './pkce.js';

const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const SCOPES = 'Files.ReadWrite.AppFolder offline_access';

/** Identifiant d'application Microsoft : MS_CLIENT_ID au build, ou `flashcard.msClientId`. */
export const msClientId = () =>
  appId('flashcard.msClientId', typeof __MS_CLIENT_ID__ === 'string' ? __MS_CLIENT_ID__ : '');

const client = pkceClient({
  name: 'Microsoft',
  storageKey: 'flashcard.onedriveToken',
  clientId: msClientId,
  authorizeUrl: `${AUTHORITY}/authorize`,
  tokenUrl: `${AUTHORITY}/token`,
  authorizeParams: { scope: SCOPES, prompt: 'select_account' },
  tokenParams: { scope: SCOPES },
});

export const msToken = (o) => client.token(o);
export const forgetMs = () => client.forget();
