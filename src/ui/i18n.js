// Internationalisation : clés identifiantes « espace.nom » et un dictionnaire par langue (locales/*.js).
// Une valeur est un texte, ou { one, other } pour un pluriel (catégories CLDR via Intl.PluralRules).
// Variables : {nom}, remplacées par t(clé, { nom }) ; tn(clé, n) fournit {n}.
import en from './locales/en.js';
import fr from './locales/fr.js';

const DICTS = { fr, en };
const SOURCE = 'fr'; // langue de référence : repli si une clé manque dans une traduction

let lang = SOURCE;
const listeners = new Set();
const plurals = {};

export function setLang(l) {
  lang = l in DICTS ? l : SOURCE;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  listeners.forEach((f) => f(lang));
}
export const getLang = () => lang;
export const onLang = (f) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

const warned = new Set();
function lookup(key) {
  const v = DICTS[lang][key] ?? DICTS[SOURCE][key];
  if (v !== undefined) return v;
  if (!warned.has(key)) {
    warned.add(key);
    console.warn(`i18n : clé inconnue « ${key} »`);
  }
  return key;
}

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '') : s);

/** Texte traduit : t('common.cancel'), t('set.exportTitle', { title }). */
export function t(key, vars) {
  const v = lookup(key);
  return fill(typeof v === 'string' ? v : v.other, vars);
}

/** Pluriel : tn('common.nCards', 3) → « 3 cartes » ; {n} est fourni, d'autres variables peuvent s'y ajouter. */
export function tn(key, n, vars) {
  const v = lookup(key);
  if (typeof v === 'string') return fill(v, { n, ...vars });
  const cat = (plurals[lang] ??= new Intl.PluralRules(locale())).select(n);
  return fill(v[cat] ?? v.other, { n, ...vars });
}

/** Message d'une erreur ou d'un avertissement pour l'utilisateur : traduction de son code (AppError), sinon son message. */
export function errorText(e) {
  if (e?.code && DICTS[SOURCE][`error.${e.code}`] !== undefined) return t(`error.${e.code}`, e.vars);
  return String(e?.message ?? e);
}

export const locale = () => (lang === 'en' ? 'en-US' : 'fr-FR');

/** Pourcentage typographié selon la langue : « 90 % » / « 90% ». */
export const percent = (n) => (lang === 'en' ? `${n}%` : `${n} %`);
