// Génère les icônes PNG de la PWA à partir de public/icon.svg (nécessite Playwright + Chromium).
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = (() => {
  try {
    return require('playwright');
  } catch {
    return require('playwright-core');
  }
})();
const svg = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad] of [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['icon-maskable-512.png', 512, 0.12],
]) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  await page.setContent(
    `<body style="margin:0;background:#1b2a41;display:grid;place-items:center;width:${size}px;height:${size}px"><div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body>`,
  );
  await page.screenshot({ path: new URL(`../public/${name}`, import.meta.url).pathname, omitBackground: false });
}
await browser.close();
console.log('icônes générées');
