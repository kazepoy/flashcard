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
    // identifiant OAuth Google de ce site (synchronisation Google Drive) ; vide : option indisponible
    __GOOGLE_CLIENT_ID__: JSON.stringify(process.env.GOOGLE_CLIENT_ID || ''),
    // identifiant d'application Microsoft (synchronisation OneDrive) ; vide : option indisponible
    __MS_CLIENT_ID__: JSON.stringify(process.env.MS_CLIENT_ID || ''),
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
await cp('node_modules/sql.js/dist/sql-wasm-browser.wasm', join(out, 'sql-wasm-browser.wasm'));
await cp('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', join(out, 'pdf.worker.min.mjs'));
// Jeux d'exemple importés à la première ouverture (examples/<langue>/index.json + archives)
await cp('examples', join(out, 'examples'), { recursive: true, filter: (f) => !f.endsWith('.md') });

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
  const pre = files.filter((f) => f !== 'sw.js' && !f.endsWith('.map')).sort();
  const hash = createHash('sha256');
  for (const f of pre) hash.update(f).update(await readFile(join(out, f)));
  const sw = (await readFile('public/sw.js', 'utf8'))
    .replaceAll('__VERSION__', hash.digest('hex').slice(0, 12))
    .replaceAll('__PRECACHE__', JSON.stringify(['./', ...pre.map((f) => './' + f)]));
  await writeFile(join(out, 'sw.js'), sw);
  console.log(`dist/ prêt : ${pre.length} fichiers`);
}

if (watch) {
  const ctx = await context({ ...options, plugins: [{ name: 'finish', setup: (b) => b.onEnd(finish) }] });
  await ctx.watch();
  console.log('Surveillance… (dist/ est reconstruit à chaque modification)');
} else {
  await build(options);
  await finish();
}
