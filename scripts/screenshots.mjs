// Captures du README : `npm run build && node scripts/screenshots.mjs` → docs/screenshots/<langue>-*.jpg.
// Bibliothèque en thème clair, image masquée (anatomie), révision espacée FSRS (formules sur papier quadrillé),
// mode Apprendre avec correction immédiate.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { buildCatalog } from './catalog.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const PORT = Number(process.env.PORT || 18090);
const base = `http://127.0.0.1:${PORT}/`;
const out = new URL('../docs/screenshots/', import.meta.url);

// Réponses exactes des jeux de démonstration, sans dupliquer catalog.mjs
const cat = buildCatalog({ makeSet: (_n, f, cards) => ({ ...f, cards }), addSvg: () => '' });
const answersFor = (list, idx) => new Map(list[idx][1].cards.map((c) => [c.term, c.definition]));

const TEXT = {
  fr: {
    import: 'Importer',
    tab: "Jeux d'exemple",
    close: 'Fermer',
    light: 'Clair',
    sets: [
      'Drapeaux et capitales du monde',
      'Le système solaire',
      'Espagnol de voyage',
      'Grandes dates de l’histoire',
      'Tables de multiplication (2 à 9)',
      'Éléments chimiques (1 à 30)',
      'Formules de maths et de physique',
      'Anatomie : premières planches',
    ],
    spanish: answersFor(cat.fr, 2),
  },
  en: {
    import: 'Import',
    tab: 'Example sets',
    close: 'Close',
    light: 'Light',
    sets: [
      'Flags and capitals of the world',
      'The solar system',
      'Spanish for travellers',
      'Key dates in history',
      'Times tables (2 to 9)',
      'Chemical elements (1 to 30)',
      'Maths and physics formulas',
      'Anatomy: first diagrams',
    ],
    spanish: answersFor(cat.en, 2),
  },
};

const server = spawn('node', ['scripts/serve.mjs'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve) => {
  server.stdout.once('data', resolve);
  setTimeout(resolve, 1000);
});
const browser = await chromium.launch();
try {
  for (const [lang, T] of Object.entries(TEXT)) {
    const ctx = await browser.newContext({
      viewport: { width: 1000, height: 800 },
      deviceScaleFactor: 2,
      colorScheme: 'light',
      locale: lang === 'fr' ? 'fr-FR' : 'en-US',
    });
    // bandeaux d'accueil déjà vus : captures sans message
    await ctx.addInitScript(() => {
      const now = new Date().toISOString();
      localStorage.setItem('flashcard.examplesNotice', 'seen');
      localStorage.setItem('flashcard.installNoticeSnooze', now);
      localStorage.setItem('flashcard.backupNoticeSnooze', now);
      localStorage.setItem('flashcard.archiveSuggestSnooze', now);
    });
    const p = await ctx.newPage();
    const shot = (name) =>
      p.screenshot({ path: new URL(`${lang}-${name}.jpg`, out).pathname, type: 'jpeg', quality: 92 });
    const openSet = async (title) => {
      await p.goto(base);
      await p.getByText(title, { exact: true }).click();
      await p.locator('.set-actions').waitFor();
      return p.url();
    };

    await p.goto(base);
    await p.locator('.set-row').first().waitFor();
    // thème clair explicite
    await p.goto(base + '#/settings/appearance');
    await p.locator('.theme-opt', { hasText: new RegExp(`^${T.light}$`) }).click();
    await p.waitForFunction(() => document.documentElement.dataset.theme === 'light');

    await p.goto(base);
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

    // quelques révisions (Facile) sur le système solaire pour varier les compteurs dans la bibliothèque
    let url = await openSet(T.sets[1]);
    await p.goto(url + '/study/review');
    for (let i = 0; i < 5; i++) {
      await p.locator('.stage-actions.grades .btn.primary').click();
      await p.locator('.stage-actions.grades .grade.g4').click();
      await p.locator('.stage-actions.grades .grade.g4').waitFor({ state: 'detached' });
    }
    await p.waitForTimeout(1000); // laisse l'enregistrement différé écrire la progression

    await p.goto(base);
    await p.reload(); // sans les notifications d'ajout
    await p.locator('.set-row').nth(T.sets.length).waitFor();
    await shot('bibliotheque');

    // planche d'anatomie (le squelette, 12e élément après les 11 du cœur) en thème clair (1000×800)
    url = await openSet(T.sets[7]);
    await p.goto(url + '/study/flashcards');
    for (let i = 0; i < 11; i++) {
      await p.locator('.stage-actions .btn.primary').click();
      await p.locator('.stage-actions .btn.ok').click();
    }
    await p.locator('.flip:not(.is-flipped) .occ-face').first().waitFor();
    await p.waitForTimeout(400);
    await shot('planche');

    // rangée du bas : cadrage plus resserré (1000×680) sans vide en bas de fenêtre
    await p.setViewportSize({ width: 1000, height: 680 });

    // fiche retournée en révision espacée FSRS : papier quadrillé, police serif, 4 notes
    url = await openSet(T.sets[6]);
    await p.goto(url + '/study/review');
    await p.locator('.stage-actions.grades .btn.primary').click();
    await p.locator('.flip.is-flipped').waitFor();
    await p.locator('.stage-actions.grades .grade.g4').waitFor();
    await p.waitForTimeout(600);
    await shot('fiche');

    // mode Apprendre : choix multiple avec bonne réponse sélectionnée et bandeau de confirmation
    url = await openSet(T.sets[2]);
    await p.goto(url + '/study/learn');
    for (let step = 0; step < 12; step++) {
      await p.locator('.choices button, #answer').first().waitFor();
      const prompt = (await p.locator('.learn .question .md').first().innerText()).trim();
      const ans = T.spanish.get(prompt);
      const isChoice = (await p.locator('.choices button').count()) > 0;
      if (isChoice) {
        const btns = p.locator('.choices button');
        const count = await btns.count();
        for (let i = 0; i < count; i++) {
          const label = (await btns.nth(i).locator('.md').innerText()).trim();
          if (label === ans) {
            await btns.nth(i).click();
            break;
          }
        }
      } else {
        await p.locator('#answer').fill(ans);
        await p.locator('.answer-form button[type=submit]').click();
      }
      await p.locator('.feedback.ok').waitFor();
      const hasExtra = (await p.locator('.feedback.ok .extra').count()) > 0;
      if (isChoice && hasExtra) break;
      await p.locator('.feedback.ok .btn.primary').click();
      await p.locator('.feedback.ok').waitFor({ state: 'detached' });
    }
    await shot('apprendre');

    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
