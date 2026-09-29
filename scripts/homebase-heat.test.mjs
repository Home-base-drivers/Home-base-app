import test from 'node:test';
import assert from 'node:assert/strict';
import heat from '../dist/homebase-heat.js';

test('heat intensity rises independently with local demand strength', () => {
  assert.equal(heat.areaIntensity(0), 0);
  assert.ok(heat.areaIntensity(1) > heat.areaIntensity(.25));
  assert.ok(heat.areaIntensity(3) > heat.areaIntensity(1));
});

test('heat palette includes green, amber, red, and magenta demand levels', () => {
  const green = heat.colorAt(.08), amber = heat.colorAt(.52), red = heat.colorAt(.84), magenta = heat.colorAt(1);
  assert.ok(green[1] > green[0]);
  assert.ok(amber[0] > amber[1] && amber[1] > amber[2]);
  assert.ok(red[0] > red[1]);
  assert.ok(magenta[0] > magenta[1] && magenta[2] > magenta[1]);
});

test('forecast-only sources are more subdued than equivalent live signals', () => {
  const live = heat.sourceStrength({ tags: {} }, new Date(), () => 13);
  const forecast = heat.sourceStrength({ tags: { forecast: true } }, new Date(), () => 13);
  assert.equal(live, 1);
  assert.ok(forecast < live);
});

test('hotspot footprint changes by source category', () => {
  assert.ok(heat.sourceRadiusKm('transit') > heat.sourceRadiusKm('restaurant'));
  assert.notEqual(heat.sourceRadiusKm('event'), heat.sourceRadiusKm('school'));
});

test('public place density stays subordinate to live demand signals', () => {
  const live = heat.sourceStrength({ tags: {} }, new Date(), () => 13);
  const publicVenue = heat.sourceStrength({ tags: { publicVenue: true } }, new Date(), () => 13);
  const baseline = heat.sourceStrength({ tags: { metroBaseline: true } }, new Date(), () => 13);
  assert.ok(publicVenue < baseline);
  assert.ok(baseline < live);
});

test('provider samples remain local while baseline communities feather wider', () => {
  const provider = heat.sourceFootprintKm({ cat: 'neighborhood', tags: { providerSignal: true } });
  const baseline = heat.sourceFootprintKm({ cat: 'neighborhood', tags: { metroBaseline: true } });
  assert.ok(provider > baseline);
  assert.ok(provider < heat.sourceRadiusKm('transit'));
});
