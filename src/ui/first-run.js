// Première ouverture d'une bibliothèque vide : langue de l'interface d'après le navigateur (anglais par
// défaut), langues des nouveaux jeux, et visite guidée (examples/<langue>/, préchargée dans sw.js).
import { importBundle } from '../io/bundle.js';

/** Langue d'interface proposée : français si le navigateur est en français, anglais par défaut. */
export const browserLang = (nav = globalThis.navigator) =>
  /^fr\b/i.test(nav?.language || nav?.languages?.[0] || 'en') ? 'fr' : 'en';

async function readIndexBundles(lang, { fetchImpl = globalThis.fetch, base = './examples/' } = {}) {
  const get = async (file) => {
    const res = await fetchImpl(`${base}${lang}/${file}`);
    if (!res.ok) throw new Error(`${base}${lang}/${file} : ${res.status}`);
    return res;
  };
  const out = [];
  for (const file of await (await get('index.json')).json()) {
    out.push(await importBundle(new Uint8Array(await (await get(file)).arrayBuffer())));
  }
  return out;
}

const isUntouched = (p) =>
  !Object.keys(p.items).length &&
  !Object.keys(p.starred).length &&
  !Object.keys(p.flags).length &&
  !Object.keys(p.suspended).length;

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
  for (const b of await readIndexBundles(lang, { fetchImpl, base })) {
    await lib.addSets(b.sets, b.media);
  }
  // valeurs initiales de cet appareil : elles ne remplacent pas celles déjà choisies sur un autre (synchronisation)
  await lib.saveSettings(
    { ...lib.settings, lang, language: { term: lang, definition: lang }, initialized: true },
    { initial: true },
  );
  return true;
}

/**
 * Remplace la visite guidée initiale de `fromLang` par celle de `toLang` si elle n'a pas encore été étudiée
 * ni modifiée (appelé quand l'utilisateur change de langue depuis l'invite de première ouverture).
 * @returns {Promise<boolean>} vrai si un remplacement a eu lieu
 */
export async function switchFirstRunTour(
  lib,
  fromLang,
  toLang,
  { fetchImpl = globalThis.fetch, base = './examples/' } = {},
) {
  if (!fromLang || !toLang || fromLang === toLang) return false;
  const fromBundles = await readIndexBundles(fromLang, { fetchImpl, base });
  const toBundles = await readIndexBundles(toLang, { fetchImpl, base });
  const oldIds = fromBundles.flatMap((b) => b.sets.map((s) => s.id));
  let replaced = false;
  for (const id of oldIds) {
    const existing = await lib.loadSet(id);
    if (!existing) continue;
    const p = await lib.loadProgress(id);
    if (!isUntouched(p)) continue;
    await lib.deleteSet(id);
    replaced = true;
  }
  if (!replaced) return false;
  for (const b of toBundles) await lib.addSets(b.sets, b.media);
  return true;
}
