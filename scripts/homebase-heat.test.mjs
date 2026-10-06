import test from 'node:test';
import assert from 'node:assert/strict';
import heat from '../dist/homebase-heat.js';

test('heat intensity rises independently with local demand strength', () => {
  assert.equal(heat.areaIntensity(0), 0);
  assert.ok(heat.areaIntensity(1) > heat.areaIntensity(.25));
  assert.ok(heat.areaIntensity(3) > heat.areaIntensity(1));
});

test('heat opacity matches the stronger map treatment while retaining a clear zero', () => {
  const input = .1;
  const prior = heat.areaIntensity(input) * 1.42;
  assert.ok(Math.abs(heat.compositeOpacity(input) / prior - 1.2) < 1e-10);
  assert.equal(heat.compositeOpacity(0), 0);
});

test('heat raster grid follows its projected geographic anchor during pan', () => {
  const step = 2.5, position = 412.7, anchor = 103.2, pan = -87.4;
  const original = heat.anchoredGridOrigin(position, anchor, step);
  const panned = heat.anchoredGridOrigin(position + pan, anchor + pan, step);
  assert.ok(Math.abs((panned - original) - pan) < 1e-9);
});

test('heat palette includes green, amber, red, and magenta demand levels', () => {
  const green = heat.colorAt(.08), amber = heat.colorAt(.52), red = heat.colorAt(.84), magenta = heat.colorAt(1);
  assert.ok(green[1] > green[0]);
  assert.ok(amber[0] > amber[1] && amber[1] > amber[2]);
  assert.ok(red[0] > red[1]);
  assert.ok(magenta[0] > magenta[1] && magenta[2] > magenta[1]);
});

test('the heat map exposes distinct persistent color patterns without changing demand strength', () => {
  const classic = heat.colorAt(.7);
  assert.deepEqual(heat.paletteNames, ['classic', 'purple_blue_white', 'ocean', 'sunset', 'ember', 'mint', 'ice', 'aurora', 'violet_rose', 'blue_gold', 'coral_sand', 'teal_lime', 'royal_ice', 'custom', 'monochrome']);
  assert.equal(heat.setPalette('ocean'), 'ocean');
  assert.notDeepEqual(heat.colorAt(.7), classic);
  assert.equal(heat.getPalette(), 'ocean');
  assert.equal(heat.setPalette('unknown'), 'ocean');
  heat.setPalette('classic');
});

test('purple blue white palette reaches the requested three-color family', () => {
  heat.setPalette('purple_blue_white');
  const low = heat.colorAt(.08), middle = heat.colorAt(.55), high = heat.colorAt(1);
  assert.ok(low[0] > low[1] && low[2] > low[1], 'low demand reads purple');
  assert.ok(middle[2] > middle[0], 'mid demand reads blue');
  assert.deepEqual(high, [255,255,255], 'highest demand reads white');
  heat.setPalette('classic');
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
  assert.equal(live, 1.25);
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

test('provider and community footprint sizes reflect their current source classes', () => {
  const provider = heat.sourceFootprintKm({ cat: 'neighborhood', tags: { providerSignal: true } });
  const baseline = heat.sourceFootprintKm({ cat: 'neighborhood', tags: { metroBaseline: true } });
  assert.equal(provider, 1.35);
  assert.equal(baseline, 1.25);
  assert.notEqual(
    heat.sourceFootprintKm({ cat: 'transit', tags: { metroBaseline: true } }),
    heat.sourceFootprintKm({ cat: 'restaurant', tags: { metroBaseline: true } }),
    'community categories retain different geographic footprints'
  );
});

test('heat opacity remains capped while retaining transparent edges', () => {
  assert.ok(heat.compositeOpacity(100) <= .9);
  assert.ok(heat.compositeOpacity(.1) < heat.compositeOpacity(10));
});

test('custom colors cover low, medium and high demand without changing scores or opacity', () => {
  const original = heat.getCustomColors();
  const strength = heat.sourceStrength({tags:{}}, new Date(), () => 7);
  const opacity = heat.compositeOpacity(.35);
  assert.deepEqual(heat.setCustomColors(['#123456','#AB7890','#fedcba']), ['#123456','#ab7890','#fedcba']);
  heat.setPalette('custom');
  assert.deepEqual(heat.colorAt(0), [18,52,86]);
  assert.deepEqual(heat.colorAt(.5), [171,120,144]);
  assert.deepEqual(heat.colorAt(1), [254,220,186]);
  assert.deepEqual(heat.colorAt(.25), [95,86,115]);
  assert.equal(heat.sourceStrength({tags:{}}, new Date(), () => 7), strength);
  assert.equal(heat.compositeOpacity(.35), opacity);
  for(const value of [null, {}, ['#ffffff'], ['red','#ffffff','#000000'], ['#000000','#ffffff','#12345g']]){
    assert.equal(heat.setCustomColors(value), null);
    assert.deepEqual(heat.getCustomColors(), ['#123456','#ab7890','#fedcba']);
  }
  const copy = heat.getCustomColors(); copy[0] = '#000000';
  assert.equal(heat.getCustomColors()[0], '#123456');
  heat.setCustomColors(original);
  heat.setPalette('classic');
});
