import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCard, newSet, normalizeSet } from '../src/core/format.js';
import { expandSet, usableFor } from '../src/core/items.js';
import {
  compactGroups,
  groupAnswer,
  groupsOf,
  imageSize,
  maskState,
  masksFromAnki,
  masksToAnki,
  normalizeMasks,
  parseAnkiShape,
} from '../src/core/occlusion.js';
import { buildTest } from '../src/core/test.js';

const IMG = 'media/' + 'b'.repeat(64) + '.png';

test('normalizeMasks : bornes, tailles nulles, polygones, étiquettes', () => {
  const m = normalizeMasks([
    { n: 2, shape: 'rect', x: 0.9, y: -0.1, w: 0.5, h: 0.2, label: ' fémur ' },
    { n: 1, shape: 'ellipse', x: 0.1, y: 0.1, w: 0, h: 0.1 },
    { n: '3', shape: 'zigzag', x: '0.2', y: 0.2, w: 0.1, h: 0.1, angle: 360 },
    {
      n: 1,
      shape: 'polygon',
      points: [
        [0.1, 0.1],
        [0.5, 0.1],
        [0.3, 0.6],
      ],
    },
    {
      n: 1,
      shape: 'polygon',
      points: [
        [0, 0],
        [1, 1],
      ],
    },
    null,
  ]);
  assert.equal(m.length, 3);
  assert.deepEqual(m[0], { n: 2, shape: 'rect', x: 0.9, y: 0, w: 0.1, h: 0.2, label: ' fémur ' });
  assert.deepEqual(m[1], { n: 3, shape: 'rect', x: 0.2, y: 0.2, w: 0.1, h: 0.1 });
  assert.deepEqual([m[2].x, m[2].y, m[2].w, m[2].h], [0.1, 0.1, 0.4, 0.5]);
  assert.deepEqual(groupsOf(m), [1, 2, 3]);
  assert.equal(groupAnswer(m, 2), 'fémur');
  assert.deepEqual(
    compactGroups([{ n: 2 }, { n: 5 }, { n: 2 }]).map((x) => x.n),
    [1, 2, 1],
  );
});

test('états des masques selon le mode', () => {
  const a = { n: 1 };
  const b = { n: 2 };
  assert.equal(maskState(a, 1, 'all', 'prompt'), 'active');
  assert.equal(maskState(a, 1, 'all', 'answer'), 'reveal');
  assert.equal(maskState(b, 1, 'all', 'prompt'), 'cover');
  assert.equal(maskState(b, 1, 'all', 'answer'), 'cover');
  assert.equal(maskState(b, 1, 'one', 'prompt'), 'none');
});

test('format Anki : lecture (normalisé, pixels, groupes, échappements) et écriture', () => {
  assert.deepEqual(parseAnkiShape('rect:left=.1:top=.2:width=.3:height=.1:oi=1'), {
    shape: 'rect',
    props: { left: '.1', top: '.2', width: '.3', height: '.1', oi: '1' },
  });
  assert.deepEqual(parseAnkiShape('text:text=a\\:b:left=.1').props, { text: 'a:b', left: '.1' });
  const field =
    '{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.1:oi=1}}<br>' +
    '{{c2::image-occlusion:ellipse:left=.5:top=.5:width=.2:height=.2:oi=1}}<br>' +
    '{{c2::image-occlusion:polygon:points=.1,.1 .2,.1 .15,.3:oi=1}}<br>' +
    '{{c3::image-occlusion:text:text=Légende:left=.1:top=.9}}';
  const r = masksFromAnki(field);
  assert.equal(r.mode, 'all');
  assert.equal(r.skipped, 1, 'le texte est ignoré');
  assert.deepEqual(
    r.masks.map((m) => [m.n, m.shape]),
    [
      [1, 'rect'],
      [2, 'ellipse'],
      [2, 'polygon'],
    ],
  );
  assert.equal(masksFromAnki('{{c1::image-occlusion:rect:left=.1:top=.1:width=.2:height=.2}}').mode, 'one');
  // ancienne note en pixels : convertie si la taille de l'image est connue, ignorée sinon
  const px = '{{c1::image-occlusion:rect:left=100:top=50:width=200:height=100}}';
  assert.deepEqual(masksFromAnki(px, { width: 1000, height: 500 }).masks[0], {
    n: 1,
    shape: 'rect',
    x: 0.1,
    y: 0.1,
    w: 0.2,
    h: 0.2,
  });
  assert.equal(masksFromAnki(px).masks.length, 0);
  // aller-retour
  const out = masksToAnki(r.masks, 'all');
  assert.match(out, /^\{\{c1::image-occlusion:rect:left=\.1:top=\.2:width=\.3:height=\.1:oi=1\}\}/);
  assert.deepEqual(masksFromAnki(out).masks, r.masks);
  assert.doesNotMatch(masksToAnki(r.masks, 'one'), /oi=1/);
});

test("dimensions d'image : PNG, GIF, JPEG, WebP", () => {
  const png = new Uint8Array(32);
  png.set([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x03, 0x20, 0, 0, 0x02,
    0x58,
  ]);
  assert.deepEqual(imageSize(png), { width: 800, height: 600 });
  const gif = new Uint8Array(32);
  gif.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x40, 0x01, 0xf0, 0x00]);
  assert.deepEqual(imageSize(gif), { width: 320, height: 240 });
  const jpg = new Uint8Array(40);
  jpg.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80]);
  assert.deepEqual(imageSize(jpg), { width: 640, height: 480 });
  const webp = new Uint8Array(32);
  webp.set([
    0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 0, 0, 0, 0, 0, 0, 0, 0, 0x1f,
    0x03, 0x00, 0x57, 0x02, 0x00,
  ]);
  assert.deepEqual(imageSize(webp), { width: 800, height: 600 });
  assert.equal(imageSize(new Uint8Array(30)), null);
});

test("cartes : normalisation, éléments d'étude, modes utilisables, types inconnus conservés", () => {
  const s = newSet();
  s.cards.push(newCard({ term: 'chien', definition: 'dog' }));
  s.cards.push(
    newCard({
      type: 'occlusion',
      image: IMG,
      term: 'Squelette',
      masks: [
        { n: 1, x: 0.1, y: 0.1, w: 0.1, h: 0.1, label: 'crâne' },
        { n: 2, x: 0.5, y: 0.5, w: 0.1, h: 0.1 },
      ],
      occlusion: 'bizarre',
    }),
  );
  s.cards.push(newCard({ type: 'futur', term: 'x', definition: 'y', extra: 42 }));
  const n = normalizeSet(JSON.parse(JSON.stringify(s)));
  assert.equal(n.cards[1].occlusion, 'all');
  assert.equal(n.cards[2].type, 'futur', 'type inconnu conservé');
  assert.equal(n.cards[2].extra, 42);
  const items = expandSet(n, 'both');
  const occ = items.filter((i) => i.kind === 'occlusion');
  assert.deepEqual(
    occ.map((i) => i.id),
    [`${n.cards[1].id}#o1`, `${n.cards[1].id}#o2`],
  );
  assert.equal(occ[0].answer, 'crâne');
  assert.equal(occ[1].occlusion.n, 2);
  assert.equal(items.length, 4, '2 sens du basique + 2 groupes ; le type inconnu est ignoré');
  assert.equal(usableFor(items, 'text').length, 3);
  assert.equal(usableFor(items, 'plain').length, 2);
  // face sans texte (image seule) : ni réponse écrite, ni Association / Gravité
  const flag = expandSet(newSet({ cards: [newCard({ term: '', termImage: IMG, definition: 'France' })] }), 'both');
  assert.deepEqual([flag.length, usableFor(flag, 'text').length, usableFor(flag, 'plain').length], [2, 1, 0]);
  const t = buildTest(
    [...usableFor(items, 'text'), ...usableFor(items, 'text')].map((x, i) => ({ ...x, id: x.id + i })),
    { types: { matching: true } },
  );
  assert.ok(t.every((q) => q.type !== 'matching' || q.pairs.every((p) => !p.itemId.includes('#o'))));
});
