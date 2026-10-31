// Première ouverture d'une bibliothèque vide : langue de l'interface d'après le navigateur, langues
// des nouveaux jeux, et jeux d'exemple (examples/<langue>/, copiés dans dist/ par build.mjs).
import { importBundle } from '../io/bundle.js';

/** Langue d'interface proposée : français si le navigateur est en français, anglais sinon. */
export const browserLang = (nav = globalThis.navigator) => (/^fr\b/i.test(nav?.language || 'fr') ? 'fr' : 'en');

/**
 * Ne fait rien si la première ouverture a déjà été traitée. Une bibliothèque qui contient déjà des
 * jeux est seulement marquée ; en cas d'échec (hors ligne…), rien n'est marqué : nouvel essai la
 * fois suivante (réimporter un exemple le met à jour sans le dupliquer).
 * @returns {Promise<boolean>} vrai si la bibliothèque était vide et a reçu les exemples
 */
export async function firstRun(lib, { lang = browserLang(), fetchImpl = globalThis.fetch, base = './examples/' } = {}) {
  if (lib.settings.initialized) return false;
  if ((await lib.listSets()).sets.length > 0) {
    await lib.saveSettings({ ...lib.settings, initialized: true });
    return false;
  }
  const get = async (file) => {
    const res = await fetchImpl(`${base}${lang}/${file}`);
    if (!res.ok) throw new Error(`${base}${lang}/${file} : ${res.status}`);
    return res;
  };
  for (const file of await (await get('index.json')).json()) {
    const b = await importBundle(new Uint8Array(await (await get(file)).arrayBuffer()));
    await lib.addSets(b.sets, b.media);
  }
  await lib.saveSettings({ ...lib.settings, lang, language: { term: lang, definition: lang }, initialized: true });
  return true;
}
