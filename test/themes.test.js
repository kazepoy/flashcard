import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { THEMES } from '../src/ui/themes.js';

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

test('thèmes : « light » et « dark » identiques aux valeurs de styles.css', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const block = (re) =>
    Object.fromEntries([...css.match(re)[1].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
  const light = block(/^:root \{([^}]*)\}/m);
  const dark = block(/^:root\[data-theme='dark'\] \{([^}]*)\}/m);
  for (const [id, ref] of [
    ['light', light],
    ['dark', dark],
  ]) {
    const th = THEMES.find((x) => x.id === id);
    for (const [k, v] of Object.entries(ref)) assert.equal(th.colors[k], v, `${id} --${k}`);
  }
});

test('thèmes : jetons complets, identifiants uniques, contrastes WCAG AA', () => {
  const keys = Object.keys(THEMES[0].colors).sort();
  assert.equal(new Set(THEMES.map((x) => x.id)).size, THEMES.length);
  for (const { id, colors: c } of THEMES) {
    assert.deepEqual(Object.keys(c).sort(), keys, id);
    const pairs = [
      ['ink', 'desk'],
      ['ink', 'surface'],
      ['ink', 'surface-2'],
      ['ink', 'warn-bg'],
      ['muted', 'surface'],
      ['muted', 'desk'],
      ['accent', 'surface'],
      ['accent', 'desk'],
      ['on-hi', 'hi'],
      ['ok', 'surface'],
      ['ok', 'ok-bg'],
      ['bad', 'surface'],
      ['bad', 'bad-bg'],
      ['paper-ink', 'paper'],
    ];
    for (const [fg, bg] of pairs)
      assert.ok(contrast(c[fg], c[bg]) >= 4.5, `${id} : --${fg} sur --${bg} = ${contrast(c[fg], c[bg]).toFixed(2)}`);
    assert.ok(contrast(c.star, c.surface) >= 3, `${id} : --star`);
  }
});
