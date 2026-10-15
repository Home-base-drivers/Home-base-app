import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import metros from '../dist/homebase-metros.js';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const sw = await readFile(new URL('../dist/sw.js', import.meta.url), 'utf8');

// Categories the app's own category()/driver copy already understands. A typo
// here would render an anchor with no icon and no plain-language reason.
const CATEGORIES = new Set(['attraction','restaurant','nightlife','neighborhood',
  'university','medical','transit','event','shopping','warehouse','k12']);

test('every anchor sits inside the metro that claims it', () => {
  for (const metro of metros.METROS) for (const [name, , lat, lon] of metro.anchors) {
    const km = metros.distanceKm(lat, lon, metro.center[0], metro.center[1]);
    assert.ok(km <= metro.radiusKm, `${metro.name}/${name} is ${km.toFixed(0)}km from centre`);
  }
});

// A transposed sign or swapped lat/lon is the realistic authoring mistake, and it
// would silently send a driver to another city. Anchors must only ever resolve
// back to their own metro.
test('no anchor resolves to a different metro', () => {
  for (const metro of metros.METROS) for (const [name, , lat, lon] of metro.anchors) {
    assert.equal(metros.metroFor(lat, lon, '')?.name, metro.name, `${metro.name}/${name}`);
  }
});

test('metro centres never fall inside another metro radius', () => {
  for (const a of metros.METROS) for (const b of metros.METROS) {
    if (a === b) continue;
    const km = metros.distanceKm(a.center[0], a.center[1], b.center[0], b.center[1]);
    assert.ok(km > Math.max(a.radiusKm, b.radiusKm), `${a.name} and ${b.name} overlap`);
  }
});

test('anchors are well formed and use known categories', () => {
  for (const metro of metros.METROS) {
    assert.ok(metro.anchors.length >= 8, `${metro.name} has too few anchors`);
    for (const [name, cat, lat, lon] of metro.anchors) {
      assert.ok(name && typeof name === 'string', `${metro.name} anchor name`);
      assert.ok(CATEGORIES.has(cat), `${metro.name}/${name} category ${cat}`);
      assert.ok(Number.isFinite(lat) && lat >= -90 && lat <= 90, `${metro.name}/${name} lat`);
      assert.ok(Number.isFinite(lon) && lon >= -180 && lon <= 180, `${metro.name}/${name} lon`);
    }
  }
});

test('Miami returns staging anchors instead of nothing', () => {
  const anchors = metros.anchorsFor(25.7743, -80.1937, 'Miami');
  assert.ok(anchors.length >= 10);
  assert.ok(anchors.some(a => /Miami International Airport/.test(a.name)));
  assert.ok(anchors.every(a => a.metro === 'Miami'));
});

test('position wins over a stale or wrong market name', () => {
  assert.equal(metros.metroFor(25.7743, -80.1937, 'Chicago')?.name, 'Miami');
  assert.equal(metros.metroFor(25.7826, -80.1341, 'Local market')?.name, 'Miami');
});

test('an unlisted metro returns no anchors rather than invented ones', () => {
  for (const [lat, lon, label] of [[39.0997,-94.5786,'Kansas City'],[29.7604,-95.3698,'Houston'],[-33.8688,151.2093,'Sydney']]) {
    assert.deepEqual(metros.anchorsFor(lat, lon, label), [], label);
  }
});

test('bad coordinates do not produce anchors', () => {
  for (const [lat, lon] of [[NaN,-80.19],[25.77,NaN],[undefined,undefined],[null,null]]) {
    assert.equal(metros.metroFor(lat, lon, 'Miami'), null);
    assert.deepEqual(metros.anchorsFor(lat, lon, 'Miami'), []);
  }
});

// The London set previously lived inline in index.html; replacing it must not
// move any of its points.
test('the London anchors kept their original coordinates', () => {
  const london = metros.METROS.find(m => m.name === 'London');
  assert.deepEqual(london.anchors.find(a => a[0] === 'The O2').slice(2), [51.5030, -0.0032]);
  assert.deepEqual(london.anchors.find(a => /Heathrow/.test(a[0])).slice(2), [51.4700, -0.4543]);
  assert.equal(london.anchors.length, 8);
});

test('the shell loads the module and the service worker caches it', () => {
  assert.match(html, /<script src="homebase-metros\.js\?v=\d+"><\/script>/);
  assert.match(html, /HomeBaseMetros\?\.anchorsFor\(lat,lon,market\)/);
  // Precache list and required-asset verification list both need it.
  assert.equal(sw.match(/homebase-metros\.js\?v=\d+/g)?.length, 2);
});

test('Baltimore still uses its own richer set, not the metro fallback', () => {
  assert.match(html, /function fallbackVenues\(lat,lon,market\)\{if\(isGreaterBaltimoreLocation\(lat,lon\)\)/);
  assert.equal(metros.metroFor(39.2904, -76.6122, 'Baltimore'), null);
});
