// Captures du README : `npm run build && node scripts/screenshots.mjs` → docs/screenshots/<langue>-*.jpg.
// Bibliothèque garnie de jeux d'exemple, planche d'anatomie (thème sombre), fiche retournée, mode Apprendre.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const PORT = 8090;
const base = `http://localhost:${PORT}/`;
const out = new URL('../docs/screenshots/', import.meta.url);

const TEXT = {
  fr: {
    import: 'Importer',
    tab: "Jeux d'exemple",
    close: 'Fermer',
    sets: [
      'Drapeaux et capitales du monde',
      'Anatomie : premières planches',
      'Espagnol de voyage',
      'Grandes dates de l’histoire',
      'Formules de maths et de physique',
      'Tables de multiplication (2 à 9)',
    ],
    dark: 'Sombre',
    auto: 'Automatique',
  },
  en: {
    import: 'Import',
    tab: 'Example sets',
    close: 'Close',
    sets: [
      'Flags and capitals of the world',
      'Anatomy: first diagrams',
      'Spanish for travellers',
      'Key dates in history',
      'Maths and physics formulas',
      'Times tables (2 to 9)',
    ],
    dark: 'Dark',
    auto: 'Automatic',
  },
};

const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch();
try {
  for (const [lang, T] of Object.entries(TEXT)) {
    const ctx = await browser.newContext({
      viewport: { width: 1200, height: 760 },
      locale: lang === 'fr' ? 'fr-FR' : 'en-US',
    });
    // bandeaux d'accueil déjà vus : captures sans message
    await ctx.addInitScript(() => {
      localStorage.setItem('flashcard.examplesNotice', 'seen');
      localStorage.setItem('flashcard.backupNoticeSnooze', new Date().toISOString());
    });
    const p = await ctx.newPage();
    const shot = (name) =>
      p.screenshot({ path: new URL(`${lang}-${name}.jpg`, out).pathname, type: 'jpeg', quality: 82 });
    const openSet = async (title) => {
      await p.goto(base);
      await p.getByText(title, { exact: true }).click();
      await p.locator('.set-actions').waitFor();
      return p.url();
    };

    await p.goto(base);
    await p.locator('.set-row').first().waitFor();
    await p.getByRole('button', { name: T.import }).first().click();
    const dlg = p.getByRole('dialog');
    await dlg.getByRole('tab', { name: T.tab }).click();
    for (const title of T.sets) {
      const card = dlg.locator('.example-card', { hasText: title });
      await card.getByRole('button').click();
      await p.waitForFunction(
        (t) =>
          [...document.querySelectorAll('.example-card')].some(
            (c) => c.textContent.includes(t) && !c.querySelector('.btn.primary'),
          ),
        title,
      );
    }
    await dlg.getByRole('button', { name: T.close }).first().click();
    await p.reload(); // sans les notifications d'ajout
    await p.locator('.set-row').nth(T.sets.length).waitFor();
    await shot('bibliotheque');

    // fiche retournée : drapeau, réponse et pied (exemple)
    let url = await openSet(T.sets[0]);
    await p.goto(url + '/study/flashcards');
    await p.locator('.flip').waitFor();
    await p.keyboard.press('Space');
    await p.locator('.flip.is-flipped').waitFor();
    await p.waitForTimeout(700);
    await shot('fiche');

    // mode Apprendre : choix multiple
    url = await openSet(T.sets[2]);
    await p.goto(url + '/study/learn');
    await p.locator('.choices button, .choice').first().waitFor();
    await shot('apprendre');

    // planche d'anatomie en thème sombre, une étiquette demandée
    await p.goto(base + '#/settings/appearance');
    await p.locator('.theme-opt', { hasText: new RegExp(`^${T.dark}$`) }).click();
    await p.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    url = await openSet(T.sets[1]);
    await p.goto(url + '/study/flashcards');
    await p.locator('.flip .occ-face').first().waitFor();
    await p.waitForTimeout(500);
    await shot('planche');
    await p.goto(base + '#/settings/appearance');
    await p.locator('.theme-opt', { hasText: new RegExp(`^${T.auto}$`) }).click();
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
