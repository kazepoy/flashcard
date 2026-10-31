// Ajoute ou remplace des traductions : `node scripts/i18n-add.mjs fichier.json`
// où fichier.json vaut { "clé": ["français", "english"] | null, … } (null supprime la clé) ;
// réécrit locales/fr.js et en.js triés.
import { readFile, writeFile } from 'node:fs/promises';

const LOCALES = { fr: 0, en: 1 };
const HEAD = {
  fr: '// Français (langue de référence). Clés « espace.nom » ; pluriels { one, other } selon Intl.PluralRules.',
  en: '// English. Mêmes clés que fr.js (vérifié par test/i18n.test.js).',
};
const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
const fmt = (v) => (typeof v === 'string' ? q(v) : `{ one: ${q(v.one)}, other: ${q(v.other)} }`);

const add = JSON.parse(await readFile(process.argv[2], 'utf8'));
for (const [lang, i] of Object.entries(LOCALES)) {
  const url = new URL(`../src/ui/locales/${lang}.js`, import.meta.url);
  const dict = { ...(await import(url)).default };
  for (const [k, v] of Object.entries(add)) {
    if (v === null) delete dict[k];
    else dict[k] = v[i];
  }
  let out = `${HEAD[lang]}\nexport default {\n`;
  let prev = '';
  for (const k of Object.keys(dict).sort()) {
    const ns = k.split('.')[0];
    if (prev && ns !== prev) out += '\n';
    prev = ns;
    out += `  ${q(k)}: ${fmt(dict[k])},\n`;
  }
  await writeFile(url, out + '};\n');
}
console.log(`${Object.keys(add).length} clé(s) ajoutée(s)`);
