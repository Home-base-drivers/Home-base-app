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

test('a strong local source fades in opacity without creating green and yellow rings', () => {
  const strongShade = heat.sourceShade(1);
  const center = heat.compositeLevel(1, strongShade);
  const featheredEdge = heat.compositeLevel(.05, strongShade * .05);
  assert.ok(center > featheredEdge);
  assert.ok(featheredEdge > .5, 'the edge retains the source shade instead of becoming a low-demand ring');
  assert.ok(heat.compositeOpacity(.05) < heat.compositeOpacity(1), 'the retained shade still feathers through transparency');
  assert.ok(heat.sourceShade(.22) < .35, 'a separate lower-demand source can remain independently green/yellow');
});

test('the same geographic area can change shade when its time-based score changes', () => {
  const area = { tags: {} };
  const quietStrength = heat.sourceStrength(area, new Date('2026-09-28T10:00:00Z'), () => 3);
  const eventStrength = heat.sourceStrength(area, new Date('2026-09-28T23:00:00Z'), () => 12);
  assert.ok(heat.sourceShade(eventStrength) > heat.sourceShade(quietStrength));
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
  assert.ok(provider < baseline);
  assert.ok(baseline >= 3, 'county community anchors cover a meaningful neighborhood area');
  assert.notEqual(
    heat.sourceFootprintKm({ cat: 'transit', tags: { metroBaseline: true } }),
    heat.sourceFootprintKm({ cat: 'restaurant', tags: { metroBaseline: true } }),
    'community categories retain different geographic footprints'
  );
});

test('heat opacity remains transparent enough to keep satellite streets visible', () => {
  assert.ok(heat.compositeOpacity(100) <= .48);
  assert.ok(heat.compositeOpacity(.1) < heat.compositeOpacity(10));
});
