import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fr from '../src/ui/locales/fr.js';
import en from '../src/ui/locales/en.js';

const LOCALES = { fr, en };
const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
const forms = (v) => (typeof v === 'string' ? { other: v } : v);

async function sources(dir = new URL('../src/', import.meta.url).pathname) {
  let out = '';
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out += p.endsWith('locales') ? '' : await sources(p);
    else if (/\.(jsx?|mjs)$/.test(e.name)) out += await readFile(p, 'utf8');
  }
  return out;
}

test('i18n : mêmes clés, mêmes formes de pluriel et mêmes variables dans chaque langue', () => {
  for (const [lang, dict] of Object.entries(LOCALES)) {
    assert.deepEqual(Object.keys(dict).sort(), Object.keys(fr).sort(), `clés de ${lang}`);
    for (const [k, v] of Object.entries(dict)) {
      assert.match(k, /^[a-z]+(\.[a-zA-Z0-9]+)+$/, `nom de clé « ${k} »`);
      assert.deepEqual(Object.keys(forms(v)).sort(), Object.keys(forms(fr[k])).sort(), `formes de ${lang} ${k}`);
      for (const f of Object.keys(forms(v)))
        assert.equal(vars(forms(v)[f]), vars(forms(fr[k])[f]), `variables de ${lang} ${k}`);
    }
  }
});

test('i18n : toute clé utilisée existe, toute clé existante est utilisée', async () => {
  const src = await sources();
  const used = new Set([...src.matchAll(/\btn?\(\s*'([a-z]+(?:\.[a-zA-Z0-9]+)+)'/g)].map((m) => m[1]));
  for (const k of used) assert.ok(k in fr, `clé absente des dictionnaires : ${k}`);
  // les tables (modes, langues, thèmes…) citent leurs clés hors de t() ; `stats.period.${id}` en construit
  const prefixes = [...src.matchAll(/`([a-z]+(?:\.[a-zA-Z0-9]+)*\.)\$\{/g)].map((m) => m[1]);
  const orphans = Object.keys(fr).filter((k) => !src.includes(`'${k}'`) && !prefixes.some((p) => k.startsWith(p)));
  assert.deepEqual(orphans, [], 'clés jamais utilisées');
});

test('i18n : pluriels selon la langue (CLDR)', async () => {
  const { setLang, tn, t } = await import('../src/ui/i18n.js');
  setLang('fr');
  assert.deepEqual(
    [0, 1, 2].map((n) => tn('common.nCards', n)),
    ['0 carte', '1 carte', '2 cartes'],
  );
  setLang('en');
  assert.deepEqual(
    [0, 1, 2].map((n) => tn('common.nCards', n)),
    ['0 cards', '1 card', '2 cards'],
  );
  assert.equal(t('set.exportTitle', { title: 'X' }), 'Export “X”');
  setLang('fr');
});

test("i18n : chaque code d'erreur (AppError, avertissement) a sa traduction", async () => {
  const src = await sources();
  const codes = [...src.matchAll(/\b(?:new AppError|warning)\(\s*'(\w+)'/g)].map((m) => m[1]);
  assert.ok(codes.length > 10);
  for (const c of codes) assert.ok(`error.${c}` in fr, `error.${c} manquant`);
  const { errorText, setLang } = await import('../src/ui/i18n.js');
  const { AppError } = await import('../src/core/errors.js');
  setLang('en');
  assert.equal(
    errorText(new AppError('formatUnsupported', 'Format non pris en charge : .xyz', { ext: 'xyz' })),
    'Unsupported format: .xyz',
  );
  assert.equal(errorText(new Error('brut')), 'brut');
  setLang('fr');
});
