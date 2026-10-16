import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import metros from '../dist/homebase-metros.js';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');

// A driver's saved home market is a label. The market that drives the route
// comes from GPS, so a profile still reading "Baltimore" must never stop a
// driver standing in Miami getting Miami.
test('position decides the metro even when the saved market says otherwise', () => {
  for (const saved of ['Baltimore', 'Local market', '', 'Chicago', undefined]) {
    assert.equal(metros.metroFor(25.7743, -80.1937, saved)?.name, 'Miami', `saved=${saved}`);
  }
  assert.equal(metros.anchorsFor(25.7743, -80.1937, 'Baltimore').length >= 10, true);
});

test('the market picker offers Miami on both screens that show it', () => {
  const lists = html.match(/\['Baltimore','Washington, DC'[^\]]*\]/g) || [];
  assert.ok(lists.length >= 2, 'launch and settings pickers should both exist');
  for (const list of lists) assert.match(list, /'Miami'/);
});

// marketPreset is stored and used to mark the selected option; it is not read
// to change behaviour. If that ever changes, this test should be revisited
// rather than silently allowing a saved label to override a live GPS fix.
test('the saved market preset is not wired into demand behaviour', () => {
  const uses = html.match(/marketPreset/g) || [];
  assert.ok(uses.length <= 4, `marketPreset is referenced ${uses.length} times; check it still only persists the picker`);
});
