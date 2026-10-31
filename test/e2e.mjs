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
    console.log('✗', name, '\n   ', e.message.split('\n')[0]);
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
    await page.getByText('Apparence par défaut des cartes de ce jeu').click();
    await page.locator('details.set-style .swatch[aria-label="#FFF3A3"]').first().click();
    await page.locator('details.set-style select').nth(3).selectOption('grid');
    await page
      .locator('.ed-card')
      .first()
      .getByRole('button', { name: /Apparence/ })
      .click();
    await page.locator('.ed-card').first().locator('.swatch[aria-label="#1B2A41"]').first().click();
    // Carte 2 : papier « Lignée » explicite, malgré le quadrillage du jeu.
    await page
      .locator('.ed-card')
      .nth(1)
      .getByRole('button', { name: /Apparence/ })
      .click();
    await page.locator('.ed-card').nth(1).locator('.style-panel select').nth(3).selectOption('ruled');
    await shot('14-style-editeur');
    // Navigation immédiate : l'enregistrement en cours doit être relu par la page suivante.
    await page.goto(setUrl + '/study/flashcards');
    await page.locator('.flip').waitFor();
    const front = page.locator('.face-front').first();
    const cls = await front.getAttribute('class');
    if (!/paper-grid/.test(cls) || !/is-dark/.test(cls)) throw new Error('style non appliqué à la fiche : ' + cls);
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
    await page.locator('.row-open').first().click();
    await page.locator('.card-info').waitFor();
    await page.locator('.card-info').getByRole('button', { name: 'Drapeau Rouge' }).click();
    await page.locator('.card-info .history li').first().waitFor();
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
    await shot('16-reglages');
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
    await card.getByRole('button', { name: /Indice, exemple, images/ }).click();
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
    await page.getByLabel(/Titre du jeu/).fill('Planètes');
    await page.getByLabel(/Un sujet, vos notes/).fill('Les planètes du système solaire');
    const [popup] = await Promise.all([
      ctx.waitForEvent('page'),
      page.getByRole('button', { name: /^ChatGPT/ }).click(),
    ]);
    await popup.waitForLoadState();
    const q = new URL(popup.url()).searchParams.get('q');
    assert.match(q, /sur le sujet suivant : Les planètes du système solaire/);
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
    await page.goto(base + '#/settings');
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

  await step("première ouverture : jeux d'exemple et langues des nouveaux jeux", async () => {
    const fresh = await browser.newContext({ locale: 'fr-FR' });
    const p = await fresh.newPage();
    await p.goto(base);
    await p.getByText('Visite guidée : les types de cartes', { exact: true }).waitFor();
    assert.equal(await p.locator('.storage-notice').count(), 1);
    assert.equal(await p.locator('.set-row').count(), 1);
    // nouveau jeu : langues des réglages (termes et définitions en français après la première ouverture)
    await p.getByRole('button', { name: /Nouveau jeu/ }).click();
    await p.getByLabel('Langue des définitions').waitFor();
    assert.equal(await p.getByLabel('Langue des définitions').inputValue(), 'fr');
    assert.equal(await p.getByLabel('Langue des termes').inputValue(), 'fr');
    // limite du jour à 0 nouvelle carte : « Étudier quand même » ajoute 10 nouvelles cartes
    await p.goto(base + '#/settings');
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
    await p.goto(base + '#/settings');
    await p.getByRole('button', { name: /Tout supprimer et réinitialiser/ }).click();
    const del = p.getByRole('button', { name: 'Tout supprimer', exact: true });
    assert.equal(await del.isDisabled(), true, 'confirmation obligatoire');
    await p.getByLabel(/Je comprends/).check();
    await Promise.all([p.waitForEvent('load'), del.click()]);
    await p.getByText('Visite guidée : les types de cartes', { exact: true }).waitFor();
    const rows = await p.locator('.set-row').allInnerTexts();
    assert.equal(rows.length, 1, rows.join(' | '));
    assert.ok(!rows.some((r) => r.includes('Nouveau jeu')));
    await fresh.close();
  });

  await step('anglais : navigateur en anglais, interface et exemples en anglais', async () => {
    const fresh = await browser.newContext({ locale: 'en-US' });
    const p = await fresh.newPage();
    await p.goto(base);
    await p.getByText('Guided tour: card types', { exact: true }).waitFor();
    await p.getByRole('heading', { name: 'Library' }).waitFor();
    assert.equal(await p.evaluate(() => document.documentElement.lang), 'en');
    await p.goto(base + '#/settings');
    await p.getByRole('heading', { name: 'Appearance and language' }).waitFor();
    assert.match(await p.locator('body').innerText(), /Target retention: \d+%/);
    await fresh.close();
  });

  await step('aide et crédits', async () => {
    await page.goto(base);
    await page.getByRole('link', { name: 'Aide et crédits' }).click();
    await page.getByRole('heading', { name: 'Vos données restent chez vous' }).waitFor();
    await page.getByRole('link', { name: 'ts-fsrs' }).waitFor();
    assert.match(
      await page.locator('.help-intro').innerText(),
      /Version \d+\.\d+\.\d+ \(build \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\)/,
    );
    // nouvelle version activée par le service worker : la page propose de recharger
    await page.evaluate(() => dispatchEvent(new Event('flashcard-update')));
    await page.getByRole('button', { name: 'Recharger' }).waitFor();
    await shot('20-aide');
  });

  await step('synchronisation Google Drive (connexion et Drive simulés) entre deux appareils', async () => {
    // faux Google Drive partagé par les deux navigateurs (requêtes REST de storage/gdrive.js)
    const { createHash } = await import('node:crypto');
    const files = new Map();
    let n = 0;
    const md5 = (b) => createHash('md5').update(b).digest('hex');
    const drive = async (route) => {
      const req = route.request();
      const u = new URL(req.url());
      const method = req.method();
      const json = (body) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
      const q = u.searchParams.get('q') || '';
      if (method === 'GET' && u.pathname === '/drive/v3/files') {
        const parent = q.match(/'([^']+)' in parents/)?.[1];
        const name = q.match(/name='([^']+)'/)?.[1];
        const list = [...files].filter(
          ([, f]) => !f.trashed && (parent ? f.parents?.includes(parent) : f.name === name),
        );
        return json({ files: list.map(([id, f]) => ({ id, name: f.name, md5Checksum: f.bytes && md5(f.bytes) })) });
      }
      if (method === 'POST' && u.pathname === '/drive/v3/files') {
        const id = `id${++n}`;
        files.set(id, JSON.parse(req.postData()));
        return json({ id });
      }
      if (method === 'POST' && u.pathname === '/upload/drive/v3/files') {
        const raw = req.postDataBuffer().toString('latin1');
        const boundary = req.headers()['content-type'].split('boundary=')[1];
        const parts = raw.split(`--${boundary}`);
        const meta = JSON.parse(parts[1].split('\r\n\r\n')[1]);
        const bytes = Buffer.from(parts[2].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, ''), 'latin1');
        const id = `id${++n}`;
        files.set(id, { ...meta, bytes });
        return json({ id, md5Checksum: md5(bytes) });
      }
      const id = u.pathname.split('/').pop();
      if (method === 'PATCH' && u.pathname.startsWith('/upload/')) {
        files.get(id).bytes = req.postDataBuffer();
        return json({ id, md5Checksum: md5(files.get(id).bytes) });
      }
      if (method === 'PATCH') {
        Object.assign(files.get(id), JSON.parse(req.postData()));
        return json({ id });
      }
      if (method === 'GET' && u.searchParams.get('alt') === 'media')
        return route.fulfill({ contentType: 'application/octet-stream', body: files.get(id).bytes });
      return route.fulfill({ status: 400, body: 'requête inattendue' });
    };
    const gis = `window.google = { accounts: { oauth2: {
      initTokenClient: (c) => ({ requestAccessToken: () => setTimeout(() => c.callback({ access_token: 'jeton', expires_in: 3600 }), 0) }),
      revoke: (t, cb) => cb && cb(),
    } } };`;
    const device = async () => {
      const c = await browser.newContext({ locale: 'fr-FR' });
      await c.addInitScript(() => localStorage.setItem('flashcard.googleClientId', 'test.apps.googleusercontent.com'));
      await c.route('https://accounts.google.com/gsi/client', (r) =>
        r.fulfill({ contentType: 'text/javascript', body: gis }),
      );
      await c.route('https://www.googleapis.com/**', drive);
      const p = await c.newPage();
      const errs = [];
      p.on('pageerror', (e) => errs.push(e.message));
      await p.goto(base);
      await p.locator('.set-row').first().waitFor();
      return { c, p, errs };
    };
    const connect = async (p) => {
      await p.goto(base + '#/settings');
      await p.getByRole('link', { name: /Configurer la synchronisation/ }).click();
      await p.getByRole('button', { name: 'Connecter Google Drive' }).click();
      await p.locator('.sync-status.idle').waitFor();
    };
    // appareil A : un jeu à lui, puis connexion
    const a = await device();
    await a.p.getByRole('button', { name: /Nouveau jeu/ }).click();
    await a.p.getByLabel('Titre', { exact: true }).fill('Jeu de l’appareil A');
    await a.p.getByText('Enregistré').waitFor();
    await connect(a.p);
    if (shots) await a.p.screenshot({ path: `${shots}/21-synchronisation.png` });
    assert.ok([...files.values()].some((f) => f.mimeType?.includes('folder') && f.name === 'Flashcard'));
    // appareil B : connexion → le jeu de A arrive, la visite guidée (commune) n'est pas dupliquée
    const b = await device();
    await connect(b.p);
    await b.p.goto(base);
    await b.p.getByText('Jeu de l’appareil A', { exact: true }).waitFor();
    assert.equal(await b.p.locator('.set-row').count(), 2);
    assert.deepEqual([...a.errs, ...b.errs], []);
    await a.c.close();
    await b.c.close();
  });

  await step('synchronisation OneDrive (connexion PKCE et Graph simulés) entre deux appareils', async () => {
    const items = new Map(); // id → { name, parent, folder, bytes, cTag }
    let n = 0;
    const tokens = [];
    const byPath = (path) => {
      const [dir, name] = path.split('/');
      const folder = [...items].find(([, i]) => i.folder && i.name === dir)?.[0];
      return name ? [...items].find(([, i]) => i.parent === folder && i.name === name)?.[0] : folder;
    };
    const graph = async (route) => {
      const req = route.request();
      const u = new URL(req.url());
      const method = req.method();
      const json = (body, status = 200) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      const m = decodeURIComponent(u.pathname).match(/approot:\/(.+?):\/(children|content)$/);
      if (method === 'GET' && m?.[2] === 'children') {
        const folder = byPath(m[1]);
        if (!folder) return json({ error: { code: 'itemNotFound' } }, 404);
        const value = [...items]
          .filter(([, i]) => i.parent === folder)
          .map(([id, i]) => ({ id, name: i.name, cTag: i.cTag, file: {} }));
        return json({ value });
      }
      if (method === 'POST' && u.pathname.endsWith('/approot/children')) {
        const { name } = JSON.parse(req.postData());
        if (byPath(name)) return json({ error: { code: 'nameAlreadyExists' } }, 409);
        items.set(`f${++n}`, { name, folder: true });
        return json({});
      }
      if (method === 'PUT' && m?.[2] === 'content') {
        const [dir, name] = m[1].split('/');
        const id = byPath(m[1]) || `i${++n}`;
        items.set(id, { name, parent: byPath(dir), bytes: req.postDataBuffer(), cTag: `c${++n}` });
        return json({ id, cTag: items.get(id).cTag });
      }
      const id = u.pathname.split('/').pop();
      if (method === 'GET' && u.searchParams.get('$select')?.includes('downloadUrl'))
        return json({ id, '@microsoft.graph.downloadUrl': `https://download.example/${id}` });
      if (method === 'DELETE') {
        items.delete(id);
        return json({});
      }
      return route.fulfill({ status: 400, body: 'requête inattendue' });
    };
    const device = async () => {
      const c = await browser.newContext({ locale: 'fr-FR' });
      await c.addInitScript(() => localStorage.setItem('flashcard.msClientId', '00000000-test'));
      // page de connexion Microsoft simulée : renvoie aussitôt sur le site avec un code
      await c.route('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?*', (r) => {
        const q = new URL(r.request().url()).searchParams;
        assert.equal(q.get('code_challenge_method'), 'S256');
        const back = `${q.get('redirect_uri')}?code=code-ok&state=${encodeURIComponent(q.get('state'))}`;
        return r.fulfill({
          contentType: 'text/html',
          body: `<script>location.replace(${JSON.stringify(back)})</script>`,
        });
      });
      await c.route('https://login.microsoftonline.com/common/oauth2/v2.0/token', (r) => {
        const body = new URLSearchParams(r.request().postData());
        tokens.push(body.get('grant_type'));
        assert.ok(body.get('code_verifier') || body.get('refresh_token'));
        return r.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ access_token: 'jeton', expires_in: 3600, refresh_token: 'rafraichir' }),
        });
      });
      await c.route('https://graph.microsoft.com/**', graph);
      await c.route('https://download.example/**', (r) =>
        r.fulfill({ body: items.get(new URL(r.request().url()).pathname.slice(1)).bytes }),
      );
      const p = await c.newPage();
      const errs = [];
      p.on('pageerror', (e) => errs.push(e.message));
      await p.goto(base);
      await p.locator('.set-row').first().waitFor();
      return { c, p, errs };
    };
    const connect = async (p) => {
      await p.goto(base + '#/settings/sync');
      await p.getByRole('button', { name: 'Connecter OneDrive' }).click();
      await p.locator('.sync-status.idle').waitFor();
    };
    const a = await device();
    await a.p.getByRole('button', { name: /Nouveau jeu/ }).click();
    await a.p.getByLabel('Titre', { exact: true }).fill('Jeu OneDrive de A');
    await a.p.getByText('Enregistré').waitFor();
    await connect(a.p);
    if (shots) await a.p.screenshot({ path: `${shots}/21b-synchronisation-onedrive.png` });
    assert.deepEqual(tokens, ['authorization_code']);
    assert.ok([...items.values()].some((i) => i.name?.endsWith('.json')));
    const b = await device();
    await connect(b.p);
    await b.p.goto(base);
    await b.p.getByText('Jeu OneDrive de A', { exact: true }).waitFor();
    assert.equal(await b.p.locator('.set-row').count(), 2);
    assert.deepEqual([...a.errs, ...b.errs], []);
    await a.c.close();
    await b.c.close();
  });

  await step("import d'un jeu déjà présent : copie renommée ou mise à jour", async () => {
    const c = await browser.newContext({ locale: 'fr-FR' });
    const p = await c.newPage();
    await p.goto(base);
    await p.getByText('Visite guidée : les types de cartes', { exact: true }).waitFor();
    const importTour = async () => {
      await p.getByRole('button', { name: 'Importer' }).first().click();
      await p.locator('input[type=file][accept*=apkg]').setInputFiles('examples/fr/visite-guidee.flashcard.zip');
      await p.locator('.import-set input').waitFor();
    };
    // par défaut : copie, titre proposé « … (copie) », modifiable
    await importTour();
    assert.equal(await p.locator('.import-set input').inputValue(), 'Visite guidée : les types de cartes (copie)');
    await p.locator('.import-set input').fill('Ma visite');
    await p.getByRole('button', { name: /^Importer \d+ cartes/ }).click();
    await p.waitForFunction(() => location.hash.startsWith('#/set/'));
    await p.goto(base);
    await p.getByText('Ma visite', { exact: true }).waitFor();
    assert.equal(await p.locator('.set-row').count(), 2);
    // mise à jour : pas de nouveau jeu
    await importTour();
    await p.getByLabel('Ce jeu existe déjà dans votre bibliothèque').selectOption('update');
    assert.equal(await p.locator('.import-set input').inputValue(), 'Visite guidée : les types de cartes');
    await p.getByRole('button', { name: /^Importer \d+ cartes/ }).click();
    await p.waitForFunction(() => location.hash.startsWith('#/set/'));
    await p.goto(base);
    await p.locator('.set-row').first().waitFor();
    assert.equal(await p.locator('.set-row').count(), 2);
    await c.close();
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
