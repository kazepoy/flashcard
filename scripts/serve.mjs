// Serveur statique minimal pour dist/ : `npm run serve` puis http://localhost:8080
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
};
const root = new URL('../dist/', import.meta.url).pathname;
const port = Number(process.env.PORT || 8080);

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(root, path.endsWith('/') ? path + 'index.html' : path);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    res
      .writeHead(200, {
        'content-type': types[extname(file)] || 'application/octet-stream',
        'cache-control': 'no-cache',
      })
      .end(await readFile(file));
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`Flashcard : http://localhost:${port}`));
