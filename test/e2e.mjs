// Test de bout en bout dans un vrai Chromium : `npm run build && node test/e2e.mjs [dossier-captures]`
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = (() => {
  try {
    return require('playwright');
  } catch {
    return require('playwright-core');
  }
})();
const shots = process.argv[2];
if (shots) await mkdir(shots, { recursive: true });
const PORT = 8099;
const base = `http://localhost:${PORT}/`;

const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1100, height: 800 },
  locale: 'fr-FR',
  reducedMotion: 'no-preference',
});
// le parcours part d'une bibliothèque vide : pas de jeux d'exemple (vérifiés à part, en fin de test)
await ctx.route('**/examples/*/index.json', (r) => r.fulfill({ json: [] }));
// annonce des jeux d'exemple déjà vue : le bandeau de la bibliothèque est le rappel de sauvegarde
await ctx.addInitScript(() => localStorage.setItem('flashcard.examplesNotice', 'seen'));
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
page.on(
  'console',
  (m) => (m.type() === 'error' || m.text().startsWith('i18n')) && problems.push('console: ' + m.text()),
);
page.on('requestfailed', (r) => problems.push('requestfailed: ' + r.url()));

const shot = async (name) => shots && page.screenshot({ path: `${shots}/${name}.png`, fullPage: false });
const step = async (name, fn) => {
  try {
    await fn();
    console.log('✓', name);
  } catch (e) {
    console.log('✗', name, '\n   ', process.env.E2E_FULL ? e.stack : e.message.split('\n')[0]);
    await shot('FAIL-' + name.replace(/\W+/g, '-'));
    process.exitCode = 1;
  }
};

try {
  await step('bibliothèque vide', async () => {
    await page.goto(base);
    // le service worker s'installe : l'application fonctionnera hors ligne
    await page.waitForFunction(
      async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated',
      null,
      { timeout: 15000 },
    );
    await page.getByText('Votre bibliothèque est vide').waitFor();
    await shot('01-vide');
  });

  let setUrl;
  await step('créer un jeu et saisir des cartes', async () => {
    await page.getByRole('button', { name: 'Créer un jeu' }).click();
    await page.getByLabel('Titre').fill('Espagnol — cuisine');
    const terms = page.locator('.ed-card textarea').first();
    await terms.fill('la mesa');
    await page.locator('.ed-card textarea').nth(1).fill('la table');
    await page.keyboard.press('Control+Enter');
    await page.locator('.ed-card').nth(1).locator('textarea').first().fill('la silla');
    await page.locator('.ed-card').nth(1).locator('textarea').nth(1).fill('la chaise');
    await page.getByRole('button', { name: /Coller plusieurs cartes/ }).click();
    await page
      .locator('textarea.bulk')
      .fill(
        "el cuchillo\tle couteau\nel tenedor\tla fourchette\nla cuchara\tla cuillère\nel plato\tl'assiette\nel vaso\tle verre",
      );
    await page.getByRole('button', { name: /Ajouter 5 cartes/ }).click();
    await page.waitForFunction(() => document.querySelectorAll('.ed-card').length === 7);
    await shot('02-editeur');
    await page.waitForFunction(() => document.querySelector('.save-state')?.textContent.includes('Enregistré'));
    setUrl = page.url().replace('/edit', '');
  });

  await step('page du jeu', async () => {
    await page.getByRole('link', { name: 'Terminer' }).first().click();
    await page.getByText("7 cartes pour aujourd'hui").waitFor();
    await shot('03-jeu');
  });

  await step('fiches : retourner et noter', async () => {
    await page.goto(setUrl + '/study/flashcards');
    await page.locator('.flip').waitFor();
    await shot('04-fiche-recto');
    // chaque face dit ce qu'elle est ; le verso rappelle la question
    assert.equal(await page.locator('.face-front .face-label').innerText(), 'QUESTION');
    await page
      .getByRole('button', { name: /^Retourner/ })
      .first()
      .click();
    await page.getByRole('button', { name: /Je sais/ }).waitFor();
    await page.waitForTimeout(700);
    assert.match(await page.locator('.face-back .face-label').innerText(), /RÉPONSE/);
    assert.equal(await page.locator('.face-back .face-recall').innerText(), 'la mesa');
    await shot('05-fiche-verso');
    await page.getByRole('button', { name: /Je sais/ }).click();
    await page.getByText('2 / 7').waitFor();
  });

  await step('révision espacée', async () => {
    await page.goto(setUrl + '/study/review');
    await page.getByRole('button', { name: /Afficher la réponse/ }).click();
    await page.getByRole('button', { name: /Bien/ }).waitFor();
    await shot('06-revision');
    await page.getByRole('button', { name: /Bien/ }).click();
    await page.getByRole('button', { name: /Afficher la réponse/ }).waitFor();
    // « À revoir » : la carte est vue mais pas terminée ; la carte suivante s'affiche au recto
    const caption = () => page.locator('.bar-caption').innerText();
    const before = await caption();
    await page.getByRole('button', { name: /Afficher la réponse/ }).click();
    await page.getByRole('button', { name: /^À revoir/ }).click();
    await page.getByRole('button', { name: /Afficher la réponse/ }).waitFor();
    const [d0, s0, t0] = before.match(/\d+/g).map(Number);
    assert.deepEqual((await caption()).match(/\d+/g).map(Number), [d0, s0 + 1, t0]);
  });

  await step('apprendre', async () => {
    await page.goto(setUrl + '/study/learn');
    await page.locator('.question').waitFor();
    await shot('07-apprendre');
    if (await page.locator('.choice').count()) {
      await page.locator('.choice').first().click();
      await shot('08-apprendre-feedback');
    }
  });

  await step('écrire', async () => {
    await page.goto(setUrl + '/study/write');
    await page.locator('input.answer').fill('la table');
    await page.keyboard.press('Enter');
    await shot('09-ecrire');
  });

  await step('test', async () => {
    await page.goto(setUrl + '/study/test');
    await page.getByRole('button', { name: 'Commencer le test' }).click();
    await page.locator('.test-q').first().waitFor();
    await shot('10-test');
    await page.getByRole('button', { name: 'Corriger le test' }).click();
    await page.locator('.finish').waitFor();
    await shot('11-test-corrige');
  });

  await step('association', async () => {
    await page.goto(setUrl + '/study/match');
    await page.locator('.tile').first().waitFor();
    await shot('12-association');
  });

  await step('gravité', async () => {
    await page.goto(setUrl + '/study/gravity');
    await page.locator('.sky').waitFor();
    await page.waitForTimeout(2500);
    await shot('13-gravite');
  });

  await step("personnalisation : style du jeu et d'une carte", async () => {
    await page.goto(setUrl + '/edit');
    await page.getByText('Apparence des cartes de ce jeu').click();
    const setStyle = page.locator('.ed-meta details.appearance');
    await setStyle.locator('.swatch[aria-label="#FFF3A3"]').first().click();
    await setStyle.locator('select').nth(4).selectOption('grid');
    // centrage vertical proposé, comme l'alignement horizontal
    assert.deepEqual(await setStyle.locator('select').nth(3).locator('option').allInnerTexts(), [
      'Comme les réglages',
      'Centré',
      'En haut',
    ]);
    await setStyle.locator('select').first().selectOption('lexend');
    await page.locator('.ed-card').first().getByText('Apparence de cette carte').click();
    await page.locator('.ed-card').first().locator('.swatch[aria-label="#1B2A41"]').first().click();
    // Carte 2 : papier « Lignée » explicite, malgré le quadrillage du jeu.
    await page.locator('.ed-card').nth(1).getByText('Apparence de cette carte').click();
    await page.locator('.ed-card').nth(1).locator('.style-panel select').nth(4).selectOption('ruled');
    await shot('14-style-editeur');
    // Navigation immédiate : l'enregistrement en cours doit être relu par la page suivante.
    await page.goto(setUrl + '/study/flashcards');
    await page.locator('.flip').waitFor();
    const front = page.locator('.face-front').first();
    const cls = await front.getAttribute('class');
    if (!/paper-grid/.test(cls) || !/is-dark/.test(cls)) throw new Error('style non appliqué à la fiche : ' + cls);
    // police de lecture choisie pour le jeu, l'interface gardant la sienne
    assert.match(await front.evaluate((el) => getComputedStyle(el).fontFamily), /^"?Lexend/);
    assert.doesNotMatch(
      await page
        .locator('h1, .brand')
        .first()
        .evaluate((el) => getComputedStyle(el).fontFamily),
      /Lexend/,
    );
    await page.waitForFunction(() => [...document.fonts].some((f) => f.family === 'Lexend' && f.status === 'loaded'));
    await shot('15-style-fiche');
    await page
      .getByRole('button', { name: /^Retourner/ })
      .first()
      .click();
    await page.getByRole('button', { name: /Je sais/ }).click();
    await page.getByText('2 / 7').waitFor();
    const cls2 = await page.locator('.face-front').first().getAttribute('class');
    if (!/paper-ruled/.test(cls2)) throw new Error('papier explicite de la carte ignoré : ' + cls2);
  });

  await step('pied de fiche (indice, exemple) ; réinitialiser une carte rend le style du jeu', async () => {
    await page.goto(setUrl + '/edit');
    const first = page.locator('.ed-card').first();
    await first.getByText(/^Indice, exemple, images/).click();
    await first.getByLabel('Indice').fill('un meuble');
    await first.getByLabel('Exemple').fill('La mesa es grande.');
    await first.getByText('Apparence de cette carte').click();
    await first.getByRole('button', { name: "Revenir à l'apparence du jeu" }).click();
    assert.ok(await first.getByRole('button', { name: "Revenir à l'apparence du jeu" }).isDisabled());
    await page.goto(setUrl + '/study/flashcards');
    const front = page.locator('.face-front').first();
    await front.locator('.face-foot').waitFor();
    assert.match(await front.locator('.face-foot').innerText(), /Indice\s*:\s*un meuble/i);
    assert.doesNotMatch(await front.getAttribute('class'), /is-dark/, 'style de la carte réinitialisé');
    assert.match(await front.getAttribute('class'), /paper-grid/, 'style du jeu rendu');
    await page
      .getByRole('button', { name: /^Retourner/ })
      .first()
      .click();
    assert.match(await page.locator('.face-back .face-foot').first().innerText(), /Exemple\s*:\s*La mesa es grande/i);
    await shot('15b-pied-de-fiche');
    // aperçu d'une carte, depuis l'éditeur puis depuis la page du jeu
    await page.goto(setUrl + '/edit');
    await page.locator('.ed-card').first().getByRole('button', { name: 'Aperçu' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.locator('.face-front', { hasText: 'la mesa' }).waitFor();
    await dlg.getByRole('button', { name: 'Retourner', exact: true }).click();
    await dlg.locator('.flip.is-flipped').waitFor();
    assert.match(await dlg.locator('.face-back').innerText(), /la table[\s\S]*Exemple\s*:\s*La mesa es grande/i);
    await dlg.getByRole('checkbox', { name: /Sens inverse/ }).check();
    await dlg.locator('.face-front', { hasText: 'la table' }).waitFor();
    await shot('15c-apercu');
    await dlg.getByRole('button', { name: 'Fermer' }).click();
    await page.goto(setUrl);
    await page.locator('.card-list li').first().getByRole('button', { name: 'Aperçu' }).click();
    await page.getByRole('dialog').locator('.face-front', { hasText: 'la mesa' }).waitFor();
    await page.getByRole('dialog').getByRole('button', { name: 'Fermer' }).click();
  });

  await step('étiquettes : plusieurs, séparées par des espaces tapés au clavier', async () => {
    await page.goto(setUrl + '/edit');
    const setTags = page.getByLabel('Étiquettes (séparées par des espaces)').first();
    await setTags.click();
    await setTags.pressSequentially('espagnol cuisine ');
    assert.equal(await setTags.inputValue(), 'espagnol cuisine ', "l'espace final reste");
    await setTags.pressSequentially('vocabulaire');
    const card = page.locator('.ed-card').first();
    await card.getByText(/^Indice, exemple, images/).click();
    const cardTags = card.getByLabel('Étiquettes (séparées par des espaces)');
    await cardTags.pressSequentially('nom meuble');
    assert.equal(await cardTags.inputValue(), 'nom meuble');
    await page.waitForFunction(() => document.querySelector('.save-state')?.textContent.includes('Enregistré'));
    await page.reload();
    assert.equal(
      await page.getByLabel('Étiquettes (séparées par des espaces)').first().inputValue(),
      'espagnol cuisine vocabulaire',
    );
  });

  await step('cartes et jeux à apparence propre : signalés, remis au niveau du dessus', async () => {
    // la carte 2 garde un papier « Lignée » explicite : le jeu le signale et propose de l'effacer
    await page.goto(setUrl + '/edit');
    await page.getByText('Apparence des cartes de ce jeu').click();
    const setStyle = page.locator('.ed-meta details.appearance');
    await setStyle.getByText('1 carte de ce jeu a sa propre apparence').waitFor();
    await setStyle.getByRole('button', { name: "Les remettre à l'apparence du jeu" }).click();
    assert.equal(await setStyle.locator('.own-style').count(), 0);
    await page.goto(setUrl + '/study/flashcards');
    await page.locator('.flip').waitFor();
    await page
      .getByRole('button', { name: /^Retourner/ })
      .first()
      .click();
    await page.getByRole('button', { name: /Je sais/ }).click();
    await page.getByText('2 / 7').waitFor();
    assert.match(await page.locator('.face-front').first().getAttribute('class'), /paper-grid/, 'papier du jeu');
    // couleur de texte du jeu (bleu) sur son fond jaune : appliquée à la fiche
    await page.goto(setUrl + '/edit');
    await page.getByText('Apparence des cartes de ce jeu').click();
    await page.locator('.ed-meta details.appearance .swatch[aria-label="#1F4FD0"]').first().click();
    await page.goto(setUrl + '/study/flashcards');
    await page.locator('.flip').waitFor();
    assert.equal(
      await page
        .locator('.face-front .face-content')
        .first()
        .evaluate((e) => getComputedStyle(e).color),
      'rgb(31, 79, 208)',
    );
    // réglages : le jeu, qui a sa propre apparence, est signalé
    await page.goto(base + '#/settings/cards');
    await page.locator('.settings .own-style', { hasText: '1 jeu a sa propre apparence' }).waitFor();
  });

  await step('image masquée : dessin des masques et étude', async () => {
    // image de test : un schéma rendu par le navigateur lui-même
    const tmp = await ctx.newPage();
    await tmp.setViewportSize({ width: 600, height: 400 });
    await tmp.setContent(
      '<body style="margin:0"><div style="width:600px;height:400px;background:linear-gradient(90deg,#9cc 50%,#c9c 50%)"><b style="position:absolute;left:60px;top:60px;font:40px sans-serif">Os</b></div></body>',
    );
    const png = await tmp.screenshot({ type: 'png' });
    await tmp.close();
    await page.goto(setUrl + '/edit');
    await page
      .getByRole('button', { name: /Ajouter une carte/ })
      .first()
      .click();
    const card = page.locator('.ed-card').last();
    await card.getByRole('button', { name: 'Image masquée' }).click();
    await card
      .locator('.ed-occ input[type=file]')
      .setInputFiles({ name: 'schema.png', mimeType: 'image/png', buffer: png });
    const stage = card.locator('.occ-stage svg');
    await stage.waitFor();
    const drag = async (x0, y0, x1, y1) => {
      await stage.scrollIntoViewIfNeeded();
      const box = await stage.boundingBox();
      await page.mouse.move(box.x + box.width * x0, box.y + box.height * y0);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * x1, box.y + box.height * y1, { steps: 4 });
      await page.mouse.up();
    };
    await drag(0.08, 0.1, 0.3, 0.3);
    await card.getByPlaceholder('ex. fémur').fill('os');
    await drag(0.6, 0.6, 0.85, 0.85);
    assert.equal(await card.locator('.occ-edit').count(), 2);
    await card.locator('textarea').first().fill('Schéma');
    await card.scrollIntoViewIfNeeded();
    await shot('16e-occlusion-editeur');
    await page.goto(setUrl + '/study/review');
    await page
      .locator('.occ-view svg')
      .first()
      .waitFor({ timeout: 10000 })
      .catch(() => {});
    // l'image masquée est en fin de file : on passe les autres cartes
    for (let i = 0; i < 20 && !(await page.locator('.occ-view').count()); i++) {
      await page.keyboard.press('Space');
      await page.keyboard.press('3');
      await page.waitForTimeout(80);
    }
    await page.locator('.occ-view svg .occ-mask.active').first().waitFor();
    await page.waitForTimeout(700);
    await shot('16f-occlusion-question');
    await page.keyboard.press('Space');
    await page.locator('.occ-mask.reveal').first().waitFor();
    await page.waitForTimeout(700);
    await shot('16g-occlusion-reponse');
    // Écrire : seul le groupe étiqueté (« os ») est proposé parmi les images masquées
    await page.goto(base + '#/browse/is:occlusion');
    await page.locator('.btable tbody tr').first().waitFor();
    assert.equal(await page.locator('.btable tbody tr').count(), 1);
  });

  await step('navigateur de cartes', async () => {
    await page.goto(base + '#/browse'); // depuis #/browse/is:occlusion : la requête doit se vider
    await page.waitForFunction(() => document.querySelectorAll('.btable tbody tr').length === 8);
    assert.equal(await page.getByRole('searchbox').inputValue(), '');
    await page.getByRole('searchbox').fill('mesa');
    await page.waitForFunction(() => document.querySelectorAll('.btable tbody tr').length === 1);
    assert.match(await page.evaluate(() => location.hash), /^#\/browse\/mesa$/);
    // menu « Jeu » : ajoute un seul filtre set:"…" à la requête, sans toucher au reste ; « Tous les jeux » le retire
    const setMenu = page.locator('.set-filter select');
    await setMenu.selectOption({ label: 'Espagnol — cuisine' });
    assert.equal(await page.getByRole('searchbox').inputValue(), 'mesa set:"Espagnol — cuisine"');
    await page.waitForFunction(() => document.querySelectorAll('.btable tbody tr').length === 1);
    await setMenu.selectOption('');
    assert.equal(await page.getByRole('searchbox').inputValue(), 'mesa');
    await page.locator('.row-open').first().click();
    await page.locator('.card-info').waitFor();
    await page.locator('.card-info').getByRole('button', { name: 'Drapeau Rouge' }).click();
    await page.locator('.card-info .history li').first().waitFor();
    // aperçu de la carte depuis le panneau
    await page.locator('.card-info').getByRole('button', { name: 'Aperçu' }).click();
    await page.getByRole('dialog').locator('.face-front').waitFor();
    await page.getByRole('dialog').getByRole('button', { name: 'Fermer' }).click();
    await shot('16c-navigateur');
    await page.getByRole('searchbox').fill('flag:1 or is:dupe');
    await page.waitForFunction(() => decodeURIComponent(location.hash).includes('flag:1'));
    assert.equal(await page.locator('.btable tbody tr').count(), 1);
    // le drapeau est enregistré : il survit au rechargement
    await page.reload();
    await page.locator('.btable tbody tr').first().waitFor();
    assert.equal(await page.locator('.btable tbody tr').count(), 1);
    assert.equal(await page.getByRole('searchbox').inputValue(), 'flag:1 or is:dupe');
    await page.locator('.row-open').first().click();
    await page
      .locator('.card-info')
      .getByRole('link', { name: /Modifier/ })
      .click();
    await page.waitForFunction(() => document.activeElement?.value === 'la mesa');
  });

  await step('statistiques', async () => {
    await page.goto(base + '#/stats');
    await page.locator('.kpis').waitFor();
    assert.ok((await page.locator('.chart').count()) >= 7);
    await page.locator('.chart-svg .hit').nth(29).hover();
    await page.locator('.tooltip').waitFor();
    await page.getByLabel('Portée').selectOption({ label: 'Espagnol — cuisine' });
    await page.waitForFunction(() => /#\/stats\/[0-9A-Z]{26}$/.test(location.hash));
    await page.locator('.kpis').waitFor();
    await shot('16d-statistiques');
  });

  await step('réglages', async () => {
    await page.goto(base + '#/settings');
    await page.getByRole('heading', { name: 'Réglages' }).waitFor();
    // rubriques repliées par défaut ; un clic en déplie une, les autres restent repliées
    assert.equal(await page.locator('.settings-section[open]').count(), 0);
    await page.locator('#settings-study > summary').click();
    assert.deepEqual(await page.locator('.settings-section[open]').evaluateAll((els) => els.map((e) => e.id)), [
      'settings-study',
    ]);
    assert.match(
      await page.getByRole('link', { name: 'La répétition espacée sur Wikipédia' }).getAttribute('href'),
      /^https:\/\/fr\.wikipedia\.org\/wiki\/R%C3%A9p%C3%A9tition_espac%C3%A9e$/,
    );
    assert.deepEqual(await page.locator('.settings h2').allInnerTexts(), [
      'Apparence',
      'Apparence par défaut des cartes',
      'Étude',
      'Synchronisation Bêta',
      'Sauvegarde et restauration',
      'Intelligence artificielle',
    ]);
    // apparence globale, repliée par défaut : très grande taille pour les cartes, papier pointillé que le jeu
    // (quadrillé) remplace
    // déplier une autre rubrique replie la précédente
    await page.locator('#settings-cards > summary').click();
    await page.waitForFunction(() => !document.getElementById('settings-study').open);
    assert.deepEqual(await page.locator('.settings-section[open]').evaluateAll((els) => els.map((e) => e.id)), [
      'settings-cards',
    ]);
    const global = page.locator('.settings .appearance');
    assert.equal(await global.evaluate((el) => el.tagName), 'DIV', 'toujours visible, sans repli');
    // mots révélés : l'aperçu montre un mot révélé, dans la couleur choisie
    const clozeRow = global.locator('.style-controls .row').nth(3);
    await clozeRow.locator('.swatch[aria-label="#C62828"]').click();
    assert.equal(
      await global
        .locator('.index-card.mini mark.cloze')
        .first()
        .evaluate((e) => getComputedStyle(e).color),
      'rgb(198, 40, 40)',
    );
    await clozeRow.locator('.swatch.none').click();
    await global.locator('select').nth(1).selectOption('xl');
    await global.locator('select').nth(4).selectOption('dots');
    await shot('16-reglages');
    await page.goto(setUrl + '/study/flashcards');
    const cls = await page.locator('.face-front').first().getAttribute('class');
    assert.match(cls, /size-xl/);
    assert.match(cls, /paper-grid/);
    // l'adresse #/settings/<rubrique> la déplie
    await page.goto(base + '#/settings/appearance');
    await page.getByLabel(/^Langue(?! des)/).selectOption('en');
    await page
      .getByRole('heading', { name: 'Settings' })
      .waitFor()
      .catch(() => {});
    await page
      .getByLabel(/^Language/)
      .selectOption('fr')
      .catch(() => {});
  });

  await step('export Anki', async () => {
    await page.goto(setUrl);
    await page.getByRole('button', { name: /Exporter/ }).click();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Anki (.apkg)' }).click(),
    ]);
    assert.match(dl.suggestedFilename(), /^\d{4}-\d{2}-\d{2}-espagnol-cuisine\.apkg$/);
  });

  await step('export PDF : fiches recto verso et liste', async () => {
    await page.goto(setUrl);
    await page.getByRole('button', { name: /Exporter/ }).click();
    await page.getByRole('button', { name: 'PDF', exact: true }).click();
    await page.locator('.print-cards').first().waitFor();
    const n = await page.locator('.print-cards.prompt .print-face').count();
    assert.ok(n > 0);
    const sheets = Math.ceil(n / 8);
    assert.equal(await page.locator('.print-cards').count(), sheets * 2);
    // verso en miroir : la 1re fiche du recto est en 2e colonne au verso
    const first = (side, i) => page.locator(`.print-cards.${side} .print-cell`).nth(i).innerText();
    assert.equal((await first('prompt', 0)).length > 0, true);
    assert.equal((await first('answer', 0)) === '' ? (await first('answer', 1)).length > 0 : true, true);
    await shot('18-pdf-fiches');
    const pdf = await page.pdf({ preferCSSPageSize: true });
    if (shots) await import('node:fs/promises').then((fs) => fs.writeFile(`${shots}/18-fiches.pdf`, pdf));
    assert.equal(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g).length, sheets * 2);
    // papier et marges imposés par le navigateur ou l'imprimante (Safari, Letter) : une page par planche
    const sheet = await page.addStyleTag({ content: '@page { size: letter; margin: 12.7mm; }' });
    const letter = await page.pdf({ preferCSSPageSize: true });
    assert.equal(letter.toString('latin1').match(/\/Type\s*\/Page\b/g).length, sheets * 2, 'planches coupées');
    await sheet.evaluate((el) => el.remove());
    await page.getByLabel('Mise en page').selectOption('list');
    await page.locator('.print-list tr').first().waitFor();
    assert.equal(await page.locator('.print-list tr').count(), n);
    await shot('18b-pdf-liste');
    if (shots) await page.pdf({ preferCSSPageSize: true, path: `${shots}/18b-liste.pdf` });
  });

  await step('partage : téléchargement sans Web Share', async () => {
    await page.goto(setUrl);
    await page.getByRole('button', { name: /Partager/ }).click();
    await shot('16b-partage');
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Télécharger le fichier/ }).click(),
    ]);
    assert.match(dl.suggestedFilename(), /^espagnol-cuisine\.flashcard\.zip$/);
  });

  await step('partage : menu natif (Web Share simulé)', async () => {
    await page.evaluate(() => {
      window.__shared = null;
      navigator.canShare = (d) => !!d?.files?.length;
      navigator.share = async (d) => {
        const f = d.files[0];
        const head = new Uint8Array(await f.slice(0, 2).arrayBuffer());
        window.__shared = {
          name: f.name,
          type: f.type,
          size: f.size,
          zip: head[0] === 0x50 && head[1] === 0x4b,
          title: d.title,
        };
      };
    });
    await page.goto(setUrl);
    await page.getByRole('button', { name: /Partager/ }).click();
    await page.getByRole('button', { name: /Partager le fichier/ }).click();
    await page.waitForFunction(() => window.__shared);
    const r = await page.evaluate(() => window.__shared);
    assert.equal(r.name, 'espagnol-cuisine.flashcard.zip');
    assert.ok(r.zip && r.size > 200, JSON.stringify(r));
    assert.equal(r.title, 'Espagnol — cuisine');
    await page.reload(); // retire le Web Share simulé ; l'étape suivante navigue pendant le démarrage
  });

  await step('images allégées : import Anki et éditeur', async () => {
    // « photo » de 2400 × 1600 en PNG (dégradé bruité, plusieurs Mo), encodée par le navigateur
    const heavy = Buffer.from(
      await page.evaluate(async () => {
        const c = Object.assign(document.createElement('canvas'), { width: 2400, height: 1600 });
        const x = c.getContext('2d');
        const img = x.createImageData(c.width, c.height);
        for (let i = 0; i < img.data.length; i += 4) {
          const p = i / 4,
            n = Math.random() * 16;
          img.data.set([(p % c.width) / 10 + n, p / c.width / 7 + n, 160 + n, 255], i);
        }
        x.putImageData(img, 0, 0);
        const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
        return new Promise((r) => {
          const f = new FileReader();
          f.onload = () => r(f.result.split(',')[1]);
          f.readAsDataURL(blob);
        });
      }),
      'base64',
    );
    assert.ok(heavy.length > 2e6, 'image de test trop légère : ' + heavy.length);
    const stored = (field) =>
      field.locator('img').evaluate(async (img) => {
        await img.decode();
        const b = await (await fetch(img.src)).blob();
        return { w: img.naturalWidth, h: img.naturalHeight, size: b.size, type: b.type };
      });
    const check = (r) => {
      assert.deepEqual([r.w, r.h, r.type], [1600, 1067, 'image/webp']);
      assert.ok(r.size < heavy.length / 4, `image peu allégée : ${r.size} octets pour ${heavy.length}`);
    };
    // import Anki : l'image est allégée et le chemin de la carte suit
    const { exportApkg } = await import('../src/io/apkg-export.js');
    const { newCard, newSet } = await import('../src/core/format.js');
    const apkg = await exportApkg(
      [
        newSet({
          title: 'Photos',
          cards: [newCard({ term: 'Photo', definition: 'lourde', image: 'media/photo.png' })],
        }),
      ],
      { getMedia: async () => heavy },
    );
    await page.goto(base);
    await page.getByRole('button', { name: 'Importer' }).first().click();
    await page
      .locator('input[type=file][accept*=apkg]')
      .setInputFiles({ name: 'photos.apkg', mimeType: 'application/octet-stream', buffer: Buffer.from(apkg) });
    await page.getByRole('button', { name: /^Importer 1 cartes?$/ }).click();
    await page.waitForFunction(() => location.hash.startsWith('#/set/'));
    await page.goto(page.url() + '/edit');
    const card = page.locator('.ed-card').first();
    await card.getByText(/^Indice, exemple, images/).click();
    check(await stored(card.locator('.media-field', { hasText: 'Image de la définition' })));
    // éditeur : même réduction ; une image déjà légère serait gardée telle quelle
    const term = card.locator('.media-field', { hasText: 'Image du terme' });
    await term.locator('input[type=file]').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: heavy });
    check(await stored(term));
  });

  await step('IA sans clé : copier-coller avec un assistant en ligne', async () => {
    await ctx.route('https://chatgpt.com/**', (r) =>
      r.fulfill({ contentType: 'text/html', body: '<title>ChatGPT simulé</title>' }),
    );
    await page.goto(base);
    await page.getByRole('button', { name: /Créer avec l'IA/ }).click();
    assert.equal(
      await page.getByRole('tab', { name: /Avec mon compte/ }).getAttribute('aria-selected'),
      'true',
      'sans clé configurée : copier-coller par défaut',
    );
    // onglet « Avec une clé d'API » sans fournisseur : l'explication seule, pas de formulaire
    await page.getByRole('tab', { name: /Avec une clé d'API/ }).click();
    await page
      .getByRole('dialog')
      .getByText(/Aucun fournisseur d'IA n'est configuré/)
      .waitFor();
    assert.equal(
      await page
        .getByRole('dialog')
        .getByLabel(/Titre du jeu/)
        .count(),
      0,
    );
    await page
      .getByRole('dialog')
      .locator('.notice')
      .getByRole('button', { name: /Avec mon compte/ })
      .click();
    await page.getByLabel(/Titre du jeu/).fill('Planètes');
    await page.getByLabel(/Un sujet, vos notes/).fill('Les planètes du système solaire');
    const [popup] = await Promise.all([
      ctx.waitForEvent('page'),
      page.getByRole('button', { name: /^ChatGPT/ }).click(),
    ]);
    await popup.waitForLoadState();
    const q = new URL(popup.url()).searchParams.get('q');
    assert.match(q, /Sujet : <source>Les planètes du système solaire<\/source>/);
    await popup.close();
    await page
      .getByLabel("Réponse de l'assistant")
      .fill(
        'Voici :\n```json\n[{"type":"basic","term":"Mars","definition":"la planète rouge"},{"type":"cloze","term":"{{c1::Jupiter}} est la plus grande planète."}]\n```',
      );
    await shot('19-ia-copier-coller');
    await page.getByRole('button', { name: 'Lire la réponse' }).click();
    await page.locator('.gen-list li').nth(1).waitFor();
    await page.getByRole('button', { name: /Créer le jeu \(2 cartes\)/ }).click();
    await page.getByRole('heading', { name: 'Planètes' }).waitFor();
  });

  await step('thème sombre', async () => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(setUrl + '/study/flashcards');
    await page.locator('.flip').waitFor();
    await shot('17-sombre');
  });

  await step('thèmes : choix, conservation, retour au thème automatique', async () => {
    const state = () =>
      page.evaluate(() => [
        document.documentElement.dataset.theme,
        getComputedStyle(document.documentElement).getPropertyValue('--desk').trim(),
      ]);
    await page.goto(base + '#/settings/appearance');
    await page.locator('.theme-opt', { hasText: /^Sépia$/ }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    assert.deepEqual(await state(), ['light', '#ece0c8']);
    await page.reload();
    await page.locator('.theme-opt.on', { hasText: /^Sépia$/ }).waitFor();
    assert.deepEqual(await state(), ['light', '#ece0c8']);
    await shot('17b-theme-sepia');
    await page.locator('.theme-opt', { hasText: /^Automatique$/ }).click();
    await page.waitForFunction(() => !document.documentElement.dataset.theme);
    assert.equal((await state())[1], '#0e1723'); // système sombre émulé
  });

  await step('police des réglages : interface et cartes sans police choisie ; police du jeu respectée', async () => {
    const font = (sel) =>
      page
        .locator(sel)
        .first()
        .evaluate((el) => getComputedStyle(el).fontFamily);
    const setFont = async () => {
      await page.goto(setUrl + '/edit');
      await page.getByText('Apparence des cartes de ce jeu').click();
      return page.locator('.ed-meta details.appearance select').first();
    };
    await page.goto(base + '#/settings/appearance');
    await page.locator('.font-opt', { hasText: 'OpenDyslexic' }).click();
    await page.locator('.font-opt.on', { hasText: 'OpenDyslexic' }).waitFor();
    // l'écriture de settings.json suit celle de l'étape précédente : on l'attend avant de recharger
    await page.waitForFunction(
      () =>
        new Promise((resolve) => {
          const open = indexedDB.open('flashcard-library');
          open.onsuccess = () => {
            const get = open.result.transaction('files').objectStore('files').get('settings.json');
            get.onsuccess = () => {
              resolve(!!get.result && new TextDecoder().decode(get.result).includes('"opendyslexic"'));
              open.result.close();
            };
          };
        }),
    );
    await page.reload();
    await page.locator('.font-opt.on', { hasText: 'OpenDyslexic' }).waitFor();
    assert.match(await font('h1'), /^'?"?OpenDyslexic/);
    // fichier réellement chargé (mis en cache à sa première utilisation)
    await page.waitForFunction(() =>
      [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'OpenDyslexic' && f.status === 'loaded'),
    );
    // le thème Terminal impose sa chasse fixe : la police des réglages l'emporte
    await page.locator('.theme-opt', { hasText: /^Terminal$/ }).click();
    await page.waitForFunction(() => document.getElementById('theme-vars'));
    assert.match(await font('h1'), /^'?"?OpenDyslexic/);
    await page.locator('.font-opt.on').scrollIntoViewIfNeeded();
    await shot('17c-police-opendyslexic');
    // le jeu a choisi Lexend (étape « personnalisation ») : il la garde
    await page.goto(setUrl + '/study/flashcards');
    await page.locator('.flip').waitFor();
    assert.match(await font('.face-front'), /^"?Lexend/);
    // remis sur « Par défaut », qui annonce la police des réglages : ses cartes la prennent
    let sel = await setFont();
    assert.equal(await sel.locator('option[value="default"]').innerText(), 'Par défaut (OpenDyslexic)');
    await sel.selectOption('default');
    await page.goto(setUrl + '/study/flashcards');
    await page.locator('.flip').waitFor();
    assert.match(await page.locator('.face-front').first().getAttribute('class'), /font-default/);
    assert.match(await font('.face-front'), /^'?"?OpenDyslexic/);
    // réglages sur « Par défaut » : polices du thème pour l'interface, manuscrite pour les cartes
    await page.goto(base + '#/settings/appearance');
    await page.locator('.font-opt', { hasText: 'Par défaut' }).click();
    await page.waitForFunction(() => !document.documentElement.style.getPropertyValue('--font-ui'));
    assert.match(await font('h1'), /monospace|Menlo/);
    await page.locator('.theme-opt', { hasText: /^Automatique$/ }).click();
    await page.waitForFunction(() => !document.documentElement.dataset.theme);
    sel = await setFont();
    assert.equal(await sel.locator('option[value="default"]').innerText(), 'Par défaut (Manuscrite)');
  });

  await step("première ouverture : jeux d'exemple et langues des nouveaux jeux", async () => {
    const fresh = await browser.newContext({ locale: 'fr-FR' });
    const p = await fresh.newPage();
    await p.goto(base);
    await p.getByText('Visite guidée : découvrir Flashcard', { exact: true }).waitFor();
    // un seul bandeau : d'abord les jeux d'exemple, puis, une fois l'annonce fermée, le rappel de sauvegarde
    assert.equal(await p.locator('.examples-notice').count(), 1);
    assert.equal(await p.locator('.backup-notice').count(), 0);
    await p.locator('.examples-notice').getByRole('button', { name: 'Masquer ce message' }).click();
    assert.match(await p.locator('.backup-notice').innerText(), /Configurez la synchronisation Dropbox/);
    assert.equal(await p.locator('.set-row').count(), 1);
    // nouveau jeu : langues des réglages (termes et définitions en français après la première ouverture)
    await p.getByRole('button', { name: /Nouveau jeu/ }).click();
    await p.getByLabel('Langue des définitions').waitFor();
    assert.equal(await p.getByLabel('Langue des définitions').inputValue(), 'fr');
    assert.equal(await p.getByLabel('Langue des termes').inputValue(), 'fr');
    // limite du jour à 0 nouvelle carte : « Étudier quand même » ajoute 10 nouvelles cartes
    await p.goto(base + '#/settings/study');
    await p.getByLabel(/Nouvelles cartes par jour/).evaluate((el) => {
      el.value = '0';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await p.getByText('Nouvelles cartes par jour : 0').waitFor();
    await p.goto(base);
    await p.locator('.set-row', { hasText: 'Visite guidée' }).click();
    await p.getByText(/Limite du jour atteinte : \d+ nouvelles/).waitFor();
    await p.getByRole('link', { name: 'Étudier quand même' }).click();
    await p.locator('.flip').waitFor();
    assert.equal(await p.locator('.counts .pill.new').innerText(), '10 nouvelles');
    // remise à zéro : le jeu créé disparaît, les exemples reviennent
    await p.goto(base + '#/settings/backup');
    await p.getByRole('button', { name: /Tout supprimer et réinitialiser/ }).click();
    const del = p.getByRole('button', { name: 'Tout supprimer', exact: true });
    assert.equal(await del.isDisabled(), true, 'confirmation obligatoire');
    await p.getByLabel(/Je comprends/).check();
    await Promise.all([p.waitForEvent('load'), del.click()]);
    await p.getByText('Visite guidée : découvrir Flashcard', { exact: true }).waitFor();
    const rows = await p.locator('.set-row').allInnerTexts();
    assert.equal(rows.length, 1, rows.join(' | '));
    assert.ok(!rows.some((r) => r.includes('Nouveau jeu')));
    await fresh.close();
  });

  await step("jeux d'exemple : annonce à la première ouverture, ajout depuis la galerie", async () => {
    const fresh = await browser.newContext({ locale: 'fr-FR' });
    const p = await fresh.newPage();
    await p.goto(base);
    await p.getByText('Visite guidée : découvrir Flashcard', { exact: true }).waitFor();
    // seule la visite guidée est importée d'office ; l'annonce propose les autres
    assert.equal(await p.locator('.set-row').count(), 1);
    await p.locator('.examples-notice').getByRole('button', { name: "Voir les jeux d'exemple" }).click();
    const dlg = p.getByRole('dialog');
    await dlg.locator('.example-card').first().waitFor();
    assert.ok((await dlg.locator('.example-card').count()) >= 10);
    await shot('24-jeux-exemple');
    await dlg.getByRole('button', { name: 'Ajouter : Anatomie : premières planches' }).click();
    await dlg.getByRole('button', { name: 'Mettre à jour : Anatomie : premières planches' }).waitFor();
    await dlg.getByRole('button', { name: 'Fermer' }).first().click();
    await p.getByText('Anatomie : premières planches', { exact: true }).waitFor();
    assert.equal(await p.locator('.examples-notice').count(), 0, "l'annonce ne revient plus");
    // une planche s'étudie : image masquée avec ses masques
    await p.getByText('Anatomie : premières planches', { exact: true }).click();
    await p.locator('.card-list li').first().getByRole('button', { name: 'Aperçu' }).click();
    await p.getByRole('dialog').locator('.occ-face').first().waitFor();
    await shot('25-planche-anatomie');
    await fresh.close();
  });

  await step('archivage proposé : jeu jamais étudié depuis plus de 3 mois', async () => {
    const fresh = await browser.newContext({ locale: 'fr-FR' });
    const p = await fresh.newPage();
    await p.goto(base);
    await p.getByText('Visite guidée : découvrir Flashcard', { exact: true }).waitFor();
    assert.equal(await p.locator('.archive-suggest').count(), 0, 'jeu récent : rien à proposer');
    // quatre mois plus tard
    await p.clock.install({ time: new Date(Date.now() + 120 * 86400000) });
    // bandeaux prioritaires déjà traités : annonce des exemples vue, rappel de sauvegarde masqué
    await p.evaluate(() => {
      localStorage.setItem('flashcard.examplesNotice', 'seen');
      localStorage.setItem('flashcard.backupNoticeSnooze', new Date().toISOString());
    });
    await p.reload();
    await p.locator('.archive-suggest').getByRole('button', { name: 'Voir' }).click();
    const dlg = p.getByRole('dialog');
    await dlg.getByText(/jamais étudié, créé il y a \d+ mois/).waitFor();
    await dlg.getByRole('button', { name: 'Archiver 1 jeu' }).click();
    await p.getByText('1 jeu archivé').waitFor();
    await p.waitForFunction(() => !document.querySelector('.set-row'));
    await fresh.close();
  });

  await step('anglais : navigateur en anglais, interface et exemples en anglais', async () => {
    const fresh = await browser.newContext({ locale: 'en-US' });
    const p = await fresh.newPage();
    await p.goto(base);
    await p.getByText('Guided tour: discover Flashcard', { exact: true }).waitFor();
    await p.getByRole('heading', { name: 'Library' }).waitFor();
    assert.equal(await p.evaluate(() => document.documentElement.lang), 'en');
    await p.goto(base + '#/settings/study');
    await p.getByRole('heading', { name: 'Appearance', exact: true }).waitFor();
    assert.match(await p.locator('body').innerText(), /Target retention: \d+%/);
    await fresh.close();
  });

  await step('aide et crédits', async () => {
    await page.goto(base);
    await page.getByRole('link', { name: 'Aide et crédits' }).click();
    await page.getByRole('heading', { name: 'Vos données restent chez vous' }).waitFor();
    await page.getByRole('link', { name: 'ts-fsrs' }).waitFor();
    await page.getByRole('heading', { name: 'Raccourcis clavier' }).waitFor();
    await page.getByRole('heading', { name: "Installer sur l'écran d'accueil" }).waitFor();
    assert.equal(
      await page.getByRole('link', { name: 'La révision espacée' }).getAttribute('href'),
      'https://fr.wikipedia.org/wiki/R%C3%A9p%C3%A9tition_espac%C3%A9e',
    );
    assert.match(
      await page.locator('.help-intro').innerText(),
      /Version \d+\.\d+\.\d+ \(build \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\)/,
    );
    // nouvelle version activée par le service worker : la page propose de recharger
    await page.evaluate(() => dispatchEvent(new Event('flashcard-update')));
    await page.getByRole('button', { name: 'Recharger' }).waitFor();
    await shot('20-aide');
  });

  await step("import d'un jeu déjà présent : copie renommée ou mise à jour", async () => {
    const c = await browser.newContext({ locale: 'fr-FR' });
    const p = await c.newPage();
    await p.goto(base);
    await p.getByText('Visite guidée : découvrir Flashcard', { exact: true }).waitFor();
    const importTour = async () => {
      await p.getByRole('button', { name: 'Importer' }).first().click();
      await p.locator('input[type=file][accept*=apkg]').setInputFiles('examples/fr/visite-guidee.flashcard.zip');
      await p.locator('.import-set input').waitFor();
    };
    // par défaut : copie, titre proposé « … (copie) », modifiable
    await importTour();
    assert.equal(await p.locator('.import-set input').inputValue(), 'Visite guidée : découvrir Flashcard (copie)');
    await p.locator('.import-set input').fill('Ma visite');
    await p.getByRole('button', { name: /^Importer \d+ cartes/ }).click();
    await p.waitForFunction(() => location.hash.startsWith('#/set/'));
    await p.goto(base);
    await p.getByText('Ma visite', { exact: true }).waitFor();
    assert.equal(await p.locator('.set-row').count(), 2);
    // mise à jour : pas de nouveau jeu
    await importTour();
    await p.getByLabel('Ce jeu existe déjà dans votre bibliothèque').selectOption('update');
    assert.equal(await p.locator('.import-set input').inputValue(), 'Visite guidée : découvrir Flashcard');
    await p.getByRole('button', { name: /^Importer \d+ cartes/ }).click();
    await p.waitForFunction(() => location.hash.startsWith('#/set/'));
    await p.goto(base);
    await p.locator('.set-row').first().waitFor();
    assert.equal(await p.locator('.set-row').count(), 2);
    await c.close();
  });

  await step('synchronisation Dropbox (connexion PKCE et API simulées) entre deux appareils', async () => {
    const files = new Map(); // /chemin → { bytes, rev }
    let n = 0;
    const api = async (route) => {
      const req = route.request();
      const u = new URL(req.url());
      const args = req.headers()['dropbox-api-arg'] && JSON.parse(req.headers()['dropbox-api-arg']);
      const json = (body) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
      if (u.pathname === '/2/files/list_folder' && !JSON.parse(req.postData()).recursive) {
        const top = new Set([...files.keys()].map((p) => p.split('/').slice(0, 2).join('/')));
        return json({ entries: [...top].map((p) => ({ '.tag': 'folder', path_display: p })), has_more: false });
      }
      if (u.pathname === '/2/files/list_folder')
        return json({
          entries: [...files].map(([p, f]) => ({ '.tag': 'file', path_display: p, rev: f.rev })),
          has_more: false,
        });
      if (u.pathname === '/2/files/upload') {
        files.set(args.path, { bytes: req.postDataBuffer(), rev: `r${++n}` });
        return json({ rev: files.get(args.path).rev });
      }
      if (u.pathname === '/2/files/download') return route.fulfill({ body: files.get(args.path).bytes });
      if (u.pathname === '/2/files/delete_v2') {
        const path = JSON.parse(req.postData()).path;
        for (const p of [...files.keys()]) if (p === path || p.startsWith(path + '/')) files.delete(p);
        return json({});
      }
      return route.fulfill({ status: 400, body: 'requête inattendue' });
    };
    const device = async () => {
      const c = await browser.newContext({ locale: 'fr-FR' });
      await c.addInitScript(() => localStorage.setItem('flashcard.dropboxAppKey', 'cle-test'));
      await c.route('https://www.dropbox.com/oauth2/authorize?*', (r) => {
        const q = new URL(r.request().url()).searchParams;
        assert.equal(q.get('token_access_type'), 'offline');
        assert.equal(q.get('code_challenge_method'), 'S256');
        const back = `${q.get('redirect_uri')}?code=code-ok&state=${encodeURIComponent(q.get('state'))}`;
        return r.fulfill({
          contentType: 'text/html',
          body: `<script>location.replace(${JSON.stringify(back)})</script>`,
        });
      });
      await c.route('https://api.dropboxapi.com/oauth2/token', (r) => {
        assert.ok(new URLSearchParams(r.request().postData()).get('code_verifier'));
        return r.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ access_token: 'jeton', expires_in: 14400, refresh_token: 'durable' }),
        });
      });
      await c.route('https://api.dropboxapi.com/2/**', api);
      await c.route('https://content.dropboxapi.com/2/**', api);
      const p = await c.newPage();
      const errs = [];
      p.on('pageerror', (e) => errs.push(e.message));
      await p.goto(base);
      await p.locator('.set-row').first().waitFor();
      return { c, p, errs };
    };
    const connect = async (p) => {
      await p.goto(base + '#/settings/sync');
      await p.getByRole('button', { name: 'Connecter Dropbox' }).click();
      await p.locator('.sync-status.idle').waitFor();
    };
    const a = await device();
    await a.p.getByRole('button', { name: /Nouveau jeu/ }).click();
    await a.p.getByLabel('Titre', { exact: true }).fill('Jeu Dropbox de A');
    await a.p.getByText('Enregistré').waitFor();
    // réglage d'étude choisi sur A avant la connexion : il sera partagé
    await a.p.goto(base + '#/settings/study');
    await a.p.getByLabel(/Nouvelles cartes par jour/).evaluate((el) => {
      el.value = '35';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await a.p.getByText('Nouvelles cartes par jour : 35').waitFor();
    await connect(a.p);
    assert.ok([...files.keys()].some((k) => k.startsWith('/sets/')));
    assert.ok(files.has('/shared/settings.json'));
    const b = await device();
    await connect(b.p);
    await b.p.goto(base);
    await b.p.getByText('Jeu Dropbox de A', { exact: true }).waitFor();
    assert.equal(await b.p.locator('.set-row').count(), 2);
    // B reçoit le réglage d'étude de A, appliqué sans recharger la page
    await b.p.goto(base + '#/settings/study');
    await b.p.getByText('Nouvelles cartes par jour : 35').waitFor();
    // « Tout supprimer » sur A : seule la bibliothèque de A est effacée, la copie Dropbox reste ;
    // reconnecté, A retrouve ses jeux
    const before = [...files.keys()].filter((k) => k.startsWith('/sets/')).sort();
    await a.p.goto(base + '#/settings/backup');
    await a.p.getByRole('button', { name: /Tout supprimer et réinitialiser/ }).click();
    const wipe = a.p.getByRole('dialog');
    await wipe.getByText(/Votre copie Dropbox n'est pas touchée/).waitFor();
    await wipe.getByRole('checkbox').check();
    await Promise.all([
      a.p.waitForEvent('load'),
      wipe.getByRole('button', { name: 'Tout supprimer', exact: true }).click(),
    ]);
    await a.p.locator('.set-row').first().waitFor();
    assert.equal(await a.p.getByText('Jeu Dropbox de A', { exact: true }).count(), 0, 'effacé sur A');
    await a.p.waitForTimeout(5000); // délai de synchronisation après écriture : rien ne doit partir
    assert.deepEqual([...files.keys()].filter((k) => k.startsWith('/sets/')).sort(), before, 'Dropbox intact');
    await a.p.evaluate(() => localStorage.setItem('flashcard.dropboxAppKey', 'cle-test'));
    await connect(a.p);
    await a.p.goto(base);
    await a.p.getByText('Jeu Dropbox de A', { exact: true }).waitFor();
    // nettoyage : un fichier étranger au dossier en ligne est supprimé, la bibliothèque reste
    files.set('/sets/notes.txt', { bytes: Buffer.from('x'), rev: `r${++n}` });
    await b.p.goto(base + '#/settings/backup');
    await b.p.getByRole('button', { name: 'Nettoyer Dropbox' }).click();
    await b.p.getByText(/Dropbox nettoyé : \d+ médias inutilisés, 1 fichiers étrangers supprimés/).waitFor();
    assert.ok(!files.has('/sets/notes.txt'));
    assert.ok([...files.keys()].some((k) => k.startsWith('/sets/')));
    // purge : dossier en ligne vidé et synchronisation déconnectée, bibliothèque locale intacte
    await b.p.getByRole('button', { name: /Purger le stockage en ligne/ }).click();
    const purge = b.p.getByRole('dialog');
    // purge impossible avant l'export complet de précaution
    assert.ok(await purge.getByRole('checkbox').isDisabled());
    assert.ok(await purge.getByRole('button', { name: /Purger le stockage en ligne/ }).isDisabled());
    const saved = b.p.waitForEvent('download');
    await purge.getByRole('button', { name: /Exporter toute la bibliothèque/ }).click();
    assert.match((await saved).suggestedFilename(), /flashcard-bibliotheque\.flashcard\.zip$/);
    await purge.getByText('Export téléchargé').waitFor();
    await purge.getByRole('checkbox').check();
    await purge.getByRole('button', { name: /Purger le stockage en ligne/ }).click();
    await b.p.getByText(/Dropbox purgé : \d+ fichiers supprimés/).waitFor();
    assert.deepEqual([...files.keys()], ['/purged.json']);
    await b.p.goto(base + '#/settings/sync');
    await b.p.getByRole('button', { name: 'Connecter Dropbox' }).waitFor();
    await b.p.goto(base);
    await b.p.getByText('Jeu Dropbox de A', { exact: true }).waitFor();
    assert.equal(await b.p.locator('.set-row').count(), 2);
    assert.deepEqual([...a.errs, ...b.errs], []);
    await a.c.close();
    await b.c.close();
  });

  await step('carte suspendue : exclue du jour, réactivable', async () => {
    await page.goto(setUrl);
    const today = page.locator('.today .big');
    const before = await today.innerText();
    const first = page.locator('.card-list li').first();
    await first.getByRole('button', { name: 'Suspendre' }).click();
    await first.locator('.badge', { hasText: 'Suspendue' }).waitFor();
    await page.waitForFunction((b) => document.querySelector('.today .big').innerText !== b, before);
    await shot('22-carte-suspendue');
    await first.getByRole('button', { name: 'Suspendre' }).click();
    await page.waitForFunction((b) => document.querySelector('.today .big').innerText === b, before);
    assert.equal(await first.locator('.badge').count(), 0);
  });

  await step('archiver un jeu, le restaurer depuis les réglages ; bandeau de sauvegarde', async () => {
    await page.goto(setUrl);
    await page.getByRole('button', { name: 'Archiver' }).click();
    await page.getByText(/archivé : restaurable/).waitFor();
    await page.locator('.set-row').first().waitFor();
    assert.equal(await page.getByText('Espagnol — cuisine', { exact: true }).count(), 0);
    await page.goto(base + '#/settings/backup');
    const item = page.locator('.archive-list li', { hasText: 'Espagnol — cuisine' });
    await item.waitFor();
    await shot('23-archives');
    await item.getByRole('button', { name: 'Restaurer' }).click();
    await page.getByText(/est de retour dans la bibliothèque/).waitFor();
    await page.goto(base);
    await page.getByText('Espagnol — cuisine', { exact: true }).waitFor();
    // sauvegarde complète récente : plus de bandeau
    assert.equal(await page.locator('.backup-notice').count(), 1);
    await page.goto(base + '#/settings/backup');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Exporter toute la bibliothèque/ }).click();
    await download;
    await page.goto(base);
    await page.locator('.set-row').first().waitFor();
    assert.equal(await page.locator('.backup-notice').count(), 0);
  });

  await step('hors ligne : application, jeux et police déjà utilisée disponibles sans réseau', async () => {
    const fresh = await browser.newContext({ locale: 'fr-FR' });
    const p = await fresh.newPage();
    await p.goto(base);
    await p.getByText('Visite guidée : découvrir Flashcard', { exact: true }).waitFor();
    await p.waitForFunction(
      async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated',
    );
    await p.reload(); // page désormais servie par le service worker
    // police de lecture : téléchargée à sa première utilisation, gardée pour plus tard
    await p.goto(base + '#/settings/appearance');
    await p.locator('.font-opt', { hasText: 'Lexend' }).click();
    await p.waitForFunction(() =>
      [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Lexend' && f.status === 'loaded'),
    );
    await p.waitForFunction(async () =>
      (await (await caches.open('flashcard-lazy')).keys()).some((r) => r.url.includes('fonts/Lexend')),
    );
    // le lecteur PDF n'a pas été téléchargé : il ne l'est qu'à la demande
    assert.equal(
      await p.evaluate(async () => (await caches.keys()).length && !(await caches.match('./pdf.worker.min.mjs'))),
      true,
    );
    await fresh.setOffline(true);
    await p.goto(base);
    await p.getByText('Visite guidée : découvrir Flashcard', { exact: true }).waitFor();
    await p.waitForFunction(() =>
      [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Lexend' && f.status === 'loaded'),
    );
    await fresh.close();
  });

  await step('mobile', async () => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(setUrl);
    await page.getByText("cartes pour aujourd'hui").waitFor();
    await shot('18-mobile-jeu');
    await page.goto(setUrl + '/study/learn');
    await page.locator('.question').waitFor();
    await shot('19-mobile-apprendre');
    // aucune page ne doit défiler horizontalement sur un petit téléphone
    const set = setUrl.split('#')[1];
    const wide = [];
    for (const p of [
      '/',
      set,
      set + '/edit',
      set + '/study/review',
      set + '/study/match',
      set + '/print',
      '/browse',
      '/stats',
      '/settings',
      '/help',
    ]) {
      await page.goto(base + '#' + p);
      await page.waitForTimeout(400);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) wide.push(p);
    }
    assert.deepEqual(wide, [], 'défilement horizontal sur mobile');
  });
} finally {
  await browser.close();
  server.kill();
}
if (problems.length) {
  console.log('\nProblèmes console/réseau :');
  for (const p of [...new Set(problems)]) console.log(' -', p);
  process.exitCode = 1;
}
