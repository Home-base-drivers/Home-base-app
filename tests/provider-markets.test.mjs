import test from 'node:test';
import assert from 'node:assert/strict';
import markets from '../config/provider-markets.json' with {type: 'json'};

// This config is read by scripts/refresh-provider-signals.mjs and
// scripts/venue-calendars.mjs on a schedule, so a malformed market would only
// surface in a scheduled run. These checks catch it at commit time instead.
const LIST = markets.markets;
const EARTH_KM = 6371;
const toRad = d => d * Math.PI / 180;
const distanceKm = (aLat, aLon, bLat, bLon) => {
  const dLat = toRad(bLat - aLat), dLon = toRad(bLon - aLon);
  const h = Math.sin(dLat/2)**2 + Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLon/2)**2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
};

test('the config is a non-empty list of uniquely identified markets', () => {
  assert.ok(Array.isArray(LIST) && LIST.length > 0);
  const ids = LIST.map(m => m.id);
  assert.deepEqual(ids, [...new Set(ids)], 'market ids must be unique');
  for (const id of ids) assert.match(id, /^[a-z][a-z0-9-]*$/, id);
});

test('every market carries the fields the refresh run reads', () => {
  for (const m of LIST) {
    for (const key of ['id', 'name', 'center', 'radiusKm', 'placeRadiusKm', 'countryCode', 'timeZone']) {
      assert.ok(m[key] !== undefined, `${m.id} is missing ${key}`);
    }
    assert.ok(Number.isFinite(m.center.lat) && m.center.lat >= -90 && m.center.lat <= 90, `${m.id} lat`);
    assert.ok(Number.isFinite(m.center.lon) && m.center.lon >= -180 && m.center.lon <= 180, `${m.id} lon`);
    assert.ok(m.radiusKm > 0 && m.radiusKm <= 120, `${m.id} radiusKm ${m.radiusKm}`);
    assert.ok(m.placeRadiusKm > 0 && m.placeRadiusKm <= m.radiusKm, `${m.id} placeRadiusKm`);
    assert.match(m.countryCode, /^[A-Z]{2}$/, `${m.id} countryCode`);
  }
});

// A wrong zone shifts every school window, dismissal bell and performance time
// for that market, which is the kind of error nothing else here would catch.
test('every timeZone is one the runtime actually resolves', () => {
  for (const m of LIST) {
    assert.doesNotThrow(() => new Intl.DateTimeFormat('en-US', {timeZone: m.timeZone}), `${m.id} ${m.timeZone}`);
    const offset = new Intl.DateTimeFormat('en-US', {timeZone: m.timeZone, timeZoneName: 'short'})
      .formatToParts(new Date('2026-07-01T12:00:00Z')).find(p => p.type === 'timeZoneName')?.value;
    assert.ok(offset, `${m.id} produced no zone name`);
  }
});

test('anchors, venues and sample areas sit inside the market they belong to', () => {
  for (const m of LIST) {
    for (const group of ['sampleAreas', 'uberDestinations', 'sportsVenues']) {
      for (const point of m[group] || []) {
        assert.ok(Number.isFinite(point.lat) && Number.isFinite(point.lon), `${m.id}/${group}/${point.name}`);
        const km = distanceKm(m.center.lat, m.center.lon, point.lat, point.lon);
        assert.ok(km <= m.radiusKm, `${m.id}/${point.name} is ${km.toFixed(0)}km from centre (radius ${m.radiusKm})`);
      }
    }
    if (m.flightawareAirport) {
      const a = m.flightawareAirport;
      assert.ok(a.id && a.name, `${m.id} airport identity`);
      const km = distanceKm(m.center.lat, m.center.lon, a.lat, a.lon);
      assert.ok(km <= m.radiusKm, `${m.id} airport is ${km.toFixed(0)}km out`);
    }
  }
});

test('sports venues keep a match key that matches their own name', () => {
  for (const m of LIST) for (const v of m.sportsVenues || []) {
    assert.ok(v.city, `${m.id}/${v.name} needs a city`);
    assert.equal(v.match, v.match.toLowerCase(), `${m.id}/${v.name} match must be lower case`);
    // The match key is what a feed title is compared against. It need not be the
    // full official name — feeds say "Camden Yards", not "Oriole Park at Camden
    // Yards" — but it must be part of the venue's own name, so an unrelated or
    // mistyped key is still caught.
    const normalised = v.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
    assert.ok(v.match.length >= 4, `${m.id}/${v.name} match is too short to be distinctive`);
    assert.ok(normalised.includes(v.match), `${m.id}/${v.name} match "${v.match}" is not part of "${normalised}"`);
  }
});

test('public calendars are https and declare a page bound', () => {
  for (const m of LIST) for (const c of m.publicCalendars || []) {
    assert.ok(c.name, `${m.id} calendar needs a name`);
    assert.match(c.url, /^https:\/\//, `${m.id}/${c.name} must be https`);
    if (c.maxPages !== undefined) assert.ok(c.maxPages >= 1 && c.maxPages <= 20, `${m.id}/${c.name} maxPages`);
  }
});

test('Miami is configured for the market Mario drives', () => {
  const miami = LIST.find(m => m.id === 'miami');
  assert.ok(miami, 'miami must be configured');
  assert.equal(miami.timeZone, 'America/New_York');
  assert.equal(miami.countryCode, 'US');
  assert.equal(miami.flightawareAirport.id, 'KMIA');
  assert.ok(miami.sampleAreas.length >= 6);
  assert.ok(miami.sportsVenues.length >= 3);
  // Miami has no bell-times adapter, so school windows cannot localise there
  // yet. Asserting it keeps that gap visible instead of looking supported.
  assert.equal(miami.bellTimes, undefined);
});

test('markets claiming localized school bells name an adapter', () => {
  for (const m of LIST) if (m.bellTimes !== undefined) assert.match(m.bellTimes, /^[a-z][a-z0-9-]*$/, m.id);
});
