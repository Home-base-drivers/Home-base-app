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
