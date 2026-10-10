import test from 'node:test';
import assert from 'node:assert/strict';
import heat from '../dist/homebase-heat.js';

test('faint surge or event evidence fades in without a visible jump', () => {
  // Stepping the evidence up in small increments never changes color or
  // opacity abruptly (the old rule flipped to purple at any surge > 0).
  for (const key of ['surge', 'event']) {
    let prev = heat.composeFields(.002, .001, .1, .05, { [key]: 0 });
    for (let e = .005; e <= 1; e += .005) {
      const next = heat.composeFields(.002 + e * .3, (.002 + e * .3) * .8, .1, .05, { [key]: e });
      assert.ok(Math.abs(next.level - prev.level) < .06, `${key} level jump at ${e.toFixed(3)}`);
      assert.ok(Math.abs(next.opacity - prev.opacity) < .06, `${key} opacity jump at ${e.toFixed(3)}`);
      prev = next;
    }
  }
  assert.ok(heat.evidenceLevel(10, 10, { surge: .95 }) >= .9, 'strong surge is still purple');
});

test('a weak signal tail blends into the background layer', () => {
  const background = heat.composeFields(0, 0, .3, .15, {});
  const tail = heat.composeFields(.001, .0005, .3, .15, {});
  assert.ok(Math.abs(tail.opacity - background.opacity) < .01 && Math.abs(tail.level - background.level) < .01);
});

test('edge noise is deterministic, bounded and smooth', () => {
  assert.equal(heat.fractalNoise(12.3, 45.6), heat.fractalNoise(12.3, 45.6));
  let max = 0;
  for (let i = 0; i < 400; i++) {
    const x = i * .37, y = i * .21, v = heat.fractalNoise(x, y);
    assert.ok(v >= 0 && v <= 1);
    max = Math.max(max, Math.abs(heat.fractalNoise(x + .01, y) - v));
  }
  assert.ok(max < .05, 'neighbouring samples stay close (no speckle)');
});

test('blur spreads heat without creating or losing it', () => {
  const w = 21, h = 21, data = new Float32Array(w * h);
  data[10 * w + 10] = 1;
  heat.boxBlur(data, w, h, 2);
  const total = data.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-5);
  assert.ok(data[10 * w + 10] < 1 && data[10 * w + 12] > 0 && data[10 * w + 13] === 0);
});
