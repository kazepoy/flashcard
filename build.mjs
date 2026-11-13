// Construit l'application statique dans dist/ : `npm run build` (ou `node build.mjs --watch`).
import { build, context } from 'esbuild';
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));

const watch = process.argv.includes('--watch');
const out = 'dist';

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const options = {
  entryPoints: { main: 'src/main.jsx' },
  outdir: out,
  bundle: true,
  splitting: true,
  format: 'esm',
  target: ['es2022', 'chrome110', 'safari16', 'firefox110'],
  platform: 'browser',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  jsx: 'automatic',
  jsxImportSource: 'preact',
  loader: { '.js': 'jsx' },
  alias: { 'sql.js': 'sql.js/dist/sql-wasm-browser.js' },
  define: {
    'process.env.NODE_ENV': watch ? '"development"' : '"production"',
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
    // clé d'application Dropbox (synchronisation Dropbox) ; vide : option indisponible
    __DROPBOX_APP_KEY__: JSON.stringify(process.env.DROPBOX_APP_KEY || ''),
  },
  chunkNames: 'chunks/[name]-[hash]',
  logLevel: 'info',
};

// Fichiers statiques
await cp('public/index.html', join(out, 'index.html'));
await cp('public/manifest.webmanifest', join(out, 'manifest.webmanifest'));
await cp('public/icon.svg', join(out, 'icon.svg'));
for (const f of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
  try {
    await cp(join('public', f), join(out, f));
  } catch {
    /* générées par scripts/icons.mjs ; absentes = PWA installable via l'icône SVG seulement */
  }
}
// Polices de lecture des réglages et leurs licences (public/fonts/README.md : provenance)
await cp('public/fonts', join(out, 'fonts'), { recursive: true, filter: (f) => !f.endsWith('.md') });
await cp('node_modules/sql.js/dist/sql-wasm-browser.wasm', join(out, 'sql-wasm-browser.wasm'));
await cp('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', join(out, 'pdf.worker.min.mjs'));
// Jeux d'exemple importés à la première ouverture (examples/<langue>/index.json + archives)
await cp('examples', join(out, 'examples'), { recursive: true, filter: (f) => !f.endsWith('.md') });

/** Fichiers mis en cache à leur première utilisation seulement (voir finish). Les deux langues et les deux
 * visites guidées (examples/{en,fr}/index.json + archives) sont préchargées dès le premier lancement. */
const ON_DEMAND =
  /^(fonts\/|examples\/(?!(?:en|fr)\/(?:index\.json|(?:guided-tour|visite-guidee)\.flashcard\.zip)$)|pdf\.worker|sql-wasm|chunks\/(pdf|sql-wasm)[.-])/;

async function finish() {
  // CSS : esbuild le produit à côté de main.js (main.css) lorsqu'il est importé ; sinon on copie la feuille.
  try {
    await stat(join(out, 'main.css'));
  } catch {
    await cp('src/styles.css', join(out, 'main.css'));
  }
  const files = [];
  const walk = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else files.push(p.slice(out.length + 1));
    }
  };
  await walk(out);
  const all = files.filter((f) => f !== 'sw.js' && !f.endsWith('.map')).sort();
  // Préchargés à l'installation : ce qui sert à chaque lancement. Le reste (PDF, Anki, polices de lecture, jeux
  // d'exemple, autre langue) est mis en cache à sa première utilisation (sw.js : cache durable).
  const lazy = all.filter((f) => ON_DEMAND.test(f));
  const pre = all.filter((f) => !ON_DEMAND.test(f));
  const hash = createHash('sha256');
  for (const f of all) hash.update(f).update(await readFile(join(out, f)));
  const sw = (await readFile('public/sw.js', 'utf8'))
    .replaceAll('__VERSION__', hash.digest('hex').slice(0, 12))
    .replaceAll('__PRECACHE__', JSON.stringify(['./', ...pre.map((f) => './' + f)]))
    .replaceAll('__ON_DEMAND__', JSON.stringify(lazy.map((f) => './' + f)));
  await writeFile(join(out, 'sw.js'), sw);
  const size = async (list) => (await Promise.all(list.map((f) => stat(join(out, f))))).reduce((n, s) => n + s.size, 0);
  console.log(
    `dist/ prêt : ${pre.length} fichiers préchargés (${((await size(pre)) / 1024).toFixed(0)} Ko), ` +
      `${lazy.length} à la demande (${((await size(lazy)) / 1024).toFixed(0)} Ko)`,
  );
}

if (watch) {
  const ctx = await context({ ...options, plugins: [{ name: 'finish', setup: (b) => b.onEnd(finish) }] });
  await ctx.watch();
  console.log('Surveillance… (dist/ est reconstruit à chaque modification)');
} else {
  await build(options);
  await finish();
}
