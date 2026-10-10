import test from 'node:test';
import assert from 'node:assert/strict';
import planner from '../dist/homebase-planner.js';
import policy from '../dist/homebase-route-policy.js';
import market from '../dist/baltimore-market.js';
import publicData from '../dist/homebase-public-data.js';

const towson = [39.4015, -76.6019];
const rank = (rows, extra = {}) => planner.rankCandidates(rows, { origin: towson, radiusMiles: 25, hourlyRate: 23, costPerMile: .2, preferredMinutes: 30, majorMaxMinutes: 90, isHome: market.isHomeRegionPoint, ...extra });

test('drive minutes use street, arterial and interstate speeds instead of a flat 22 mph', () => {
  assert.equal(Math.round(planner.driveMinutes(3)), 12);
  assert.equal(Math.round(planner.driveMinutes(10)), 26);
  assert.ok(planner.driveMinutes(25) < 50, 'a 25-mile trip is well under the old 68 minutes');
});

test('a large event about 20 minutes away outranks a small local event', () => {
  const now = new Date();
  const stadium = { name: 'Game at M&T Bank Stadium', venue: 'M&T Bank Stadium', lat: 39.278, lon: -76.6227, eventStart: now, tags: { league: 'NFL' } };
  const small = { name: 'Campus talk', venue: 'Cook Library', lat: 39.394, lon: -76.607, eventStart: now };
  const scored = [stadium, small].map(v => { const size = policy.eventSize(v); return { ...v, majorEvent: size.major, score: 12 + 28 + size.bonus }; });
  const ranked = rank(scored);
  assert.equal(ranked[0].name, stadium.name);
  assert.ok(ranked[0].estimatedMinutes > 15 && ranked[0].estimatedMinutes < 35);
});

test('major DC events are reachable beyond the working radius; ordinary far places are not', () => {
  const capOne = { name: 'Concert', venue: 'Capital One Arena', lat: 38.89806, lon: -77.02083, eventStart: new Date(), score: 50, majorEvent: true };
  const farArea = { name: 'DC neighborhood', cat: 'neighborhood', lat: 38.9, lon: -77.03, score: 50 };
  const ranked = rank([capOne, farArea]);
  assert.deepEqual(ranked.map(r => r.name), ['Concert']);
  assert.ok(ranked[0].outsideHomeRegion);
  assert.ok(ranked[0].estimatedMinutes > 30 && ranked[0].estimatedMinutes <= 90);
});

test('a Baltimore City/County destination beats an equal one outside it, and far drives cost more', () => {
  const inCounty = { name: 'Dundalk', lat: 39.25066, lon: -76.52052, score: 20 };
  const annapolisArea = { name: 'Glen Burnie', lat: 39.16261, lon: -76.62469, score: 20 };
  const ranked = rank([annapolisArea, inCounty]);
  assert.equal(ranked[0].name, 'Dundalk');
  assert.equal(market.isHomeRegionPoint(39.16261, -76.62469), false);
  assert.equal(market.isHomeRegionPoint(39.33539, -76.39024), true, 'Bowleys Quarters is Baltimore County');
});

test('event size comes from attendance, pro leagues, or a stadium/arena venue', () => {
  const now = new Date();
  assert.deepEqual(policy.eventSize({ eventStart: now, tags: { league: 'MLB' } }), { major: true, bonus: 8 });
  assert.equal(policy.eventSize({ eventStart: now, venue: 'Northwest Stadium' }).major, true);
  assert.equal(policy.eventSize({ eventStart: now, venue: 'Union' }).major, false);
  const big = policy.eventSize({ eventStart: now, expectedAttendance: 30000, attendanceBasis: 'published_estimate', attendanceSourceUrl: 'https://example.org' });
  assert.equal(big.major, true); assert.ok(big.bonus > 7);
  assert.equal(policy.eventSize({ name: 'Mapped stadium, no date', cat: 'neighborhood', venue: 'Audi Field' }).major, false, 'a venue without a dated event is not an event');
});

test('a Baltimore driver sees DC market events; ordinary distances still apply to the home market', () => {
  const now = Date.parse('2026-10-11T20:00:00Z'), start = new Date(now + 2 * 3600_000).toISOString();
  const payload = { generatedAt: new Date(now).toISOString(), markets: [
    { id: 'baltimore', center: { lat: 39.2904, lon: -76.6122 }, radiusKm: 58, publicRecords: { calendarStatus: 'active', fetchedAt: new Date(now).toISOString(), events: [] } },
    { id: 'washington-dc', center: { lat: 38.9072, lon: -77.0369 }, radiusKm: 40, publicRecords: { calendarStatus: 'active', fetchedAt: new Date(now).toISOString(), events: [{ name: 'Wizards game', venue: 'Capital One Arena', lat: 38.89806, lon: -77.02083, eventStart: start }] } },
    { id: 'new-york', center: { lat: 40.71, lon: -74.0 }, radiusKm: 65, publicRecords: { calendarStatus: 'active', fetchedAt: new Date(now).toISOString(), events: [{ name: 'NY show', venue: 'MSG', lat: 40.75, lon: -73.99, eventStart: start }] } }] };
  const rows = publicData.eventsForLocation(payload, towson[0], towson[1], now);
  assert.deepEqual(rows.map(r => r.name), ['Wizards game']);
});

test('DC and Virginia events join the route only in rare, very large cases', () => {
  const home = market.isHomeRegionPoint, now = new Date();
  const ravens = { name: 'Ravens game', venue: 'M&T Bank Stadium', lat: 39.278, lon: -76.6227, eventStart: now, tags: { league: 'NFL' }, routeEventPhase: 'exit' };
  const smallLocal = { name: 'Campus talk', venue: 'Cook Library', lat: 39.394, lon: -76.607, eventStart: now, routeEventPhase: 'arrival' };
  const nats = { name: 'Nationals game', venue: 'Nationals Park', lat: 38.873, lon: -77.0074, eventStart: now, tags: { league: 'MLB' }, routeEventPhase: 'exit' };
  const commanders = { name: 'Commanders game', venue: 'Northwest Stadium', lat: 38.9077, lon: -76.8645, eventStart: now, tags: { league: 'NFL' }, routeEventPhase: 'exit' };
  const bigConcert = { name: 'Stadium concert', venue: 'Northwest Stadium', lat: 38.9077, lon: -76.8645, eventStart: now, expectedAttendance: 45000, attendanceBasis: 'published_estimate', attendanceSourceUrl: 'https://example.org', routeEventPhase: 'arrival' };
  assert.deepEqual(policy.routeEvents([smallLocal, nats], home).map(e => e.name), ['Campus talk'], 'a regular-season Nationals game is not rare enough');
  assert.deepEqual(policy.routeEvents([smallLocal, commanders], home).map(e => e.name), ['Campus talk', 'Commanders game'], 'an NFL crowd leaving qualifies');
  assert.deepEqual(policy.routeEvents([ravens, commanders], home).map(e => e.name), ['Ravens game'], 'a big home event always wins the hour');
  assert.deepEqual(policy.routeEvents([bigConcert], home), [], 'away events only during the crowd exit');
  assert.equal(policy.crowdTier(ravens), 'mega'); assert.equal(policy.crowdTier(smallLocal), 'local');
});

test('nearby counties are normal destinations; only DC-distance events need the rare-crowd rule', () => {
  const now = new Date(), home = market.isHomeRegionPoint;
  const gala = { name: 'Homecoming Gala', venue: 'Live! Casino and Hotel', lat: 39.156853, lon: -76.727784, eventStart: now, routeEventPhase: 'exit' };
  const navy = { name: 'Navy game', venue: 'Navy-Marine Corps Memorial Stadium', lat: 38.985, lon: -76.507, eventStart: now, routeEventPhase: 'exit' };
  const nats = { name: 'Nationals game', venue: 'Nationals Park', lat: 38.873, lon: -77.0074, eventStart: now, tags: { league: 'MLB' }, routeEventPhase: 'exit' };
  assert.deepEqual(policy.routeEvents([gala, navy, nats], home).map(e => e.name), ['Homecoming Gala', 'Navy game']);
});
