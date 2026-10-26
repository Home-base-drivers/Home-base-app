import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
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

test('every market picker searches the full rideshare market list', () => {
  assert.ok((html.match(/list="homeBaseMarketList"/g) || []).length >= 3, 'launch, profile and settings pickers');
  const areas = require('../dist/homebase-service-areas.js');
  assert.ok(areas.byName('Miami') && areas.byName('Baltimore') && areas.byName('London'));
});

// The selected market now decides the driver's working area (radius, pickup states/country,
// units). Saving it in settings writes the profile market that the app reads.
test('the selected market sets the working area', () => {
  assert.match(html, /function currentServiceMarket\(\)/);
  assert.match(html, /HomeBaseServiceAreas\.driverMarket\(sel,/);
  assert.match(html, /market:saved\.marketPreset/);
});
