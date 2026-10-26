import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const P = createRequire(import.meta.url)('../dist/homebase-public-data.js');
const ev = (name, venue, start, lat = 40.765, lon = -73.985, extra = {}) => ({ name, venue, eventStart: start, lat, lon, source: 'Ticketmaster Discovery API', ...extra });

test('one show listed under two titles or two venue spellings becomes one event', () => {
  const rows = P.consolidateEvents([
    ev('The Great Gatsby', 'Broadway Theatre-New York', '2026-10-26T23:00:00Z'),
    ev('The Great Gatsby', 'Broadway Theatre', '2026-10-26T23:00:00Z', 40.7635, -73.983),
    ev('Chicago - The Musical', 'Ambassador Theatre-NY', '2026-10-26T23:00:00Z'),
    ev('Chicago', 'Ambassador Theatre', '2026-10-26T23:00:00Z', 40.761, -73.985),
    ev('Six: The Musical', 'Lena Horne Theatre', '2026-10-26T23:00:00Z', 40.759, -73.990),
    ev('Six (New York, NY)', 'Lena Horne Theatre', '2026-10-26T23:00:00Z', 40.760, -73.987)
  ]);
  assert.equal(rows.length, 3);
  assert.ok(rows.every(r => r.mergedListings === 2));
});

test('doors/show pair an hour apart merges; separate early and late shows stay', () => {
  const rows = P.consolidateEvents([
    ev('BIG FAMOUS: A Benefit Concert', 'Warsaw', '2026-10-26T22:00:00Z'),
    ev('BIG FAMOUS: A Benefit Concert', 'Warsaw', '2026-10-26T23:00:00Z'),
    ev('Vince Giordano and the Nighthawks', 'Birdland Theater', '2026-10-26T21:30:00Z'),
    ev('Vince Giordano and the Nighthawks', 'Birdland Theater', '2026-10-27T00:30:00Z')
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows.find(r => /BIG/.test(r.name)).eventStart, '2026-10-26T22:00:00Z');
});

test('different shows at the same time and different venues are not merged', () => {
  const rows = P.consolidateEvents([
    ev('Heathers', 'New World Stages - Stage 1', '2026-10-26T23:00:00Z'),
    ev('The Play That Goes Wrong', 'New World Stages - Stage 4', '2026-10-26T23:00:00Z'),
    ev('Friko', 'The Atlantis', '2026-10-26T22:30:00Z', 38.918, -77.022),
    ev('Friko', 'Ottobar', '2026-10-26T22:30:00Z', 39.32, -76.62)
  ]);
  assert.equal(rows.length, 4);
});

test('museum time slots collapse into one timed-entry listing', () => {
  const slots = ['19:30', '20:00', '20:30', '21:00', '21:30', '22:00'].map(t => ev('The Banksy Museum New York!', 'Banksy Museum New York', `2026-10-26T${t}:00Z`, 40.72, -74.001));
  slots.push(ev('Banksy Museum NY - Monday Movie Day and Nights!', 'Banksy Museum New York', '2026-10-26T22:00:00Z', 40.72, -74.001));
  const rows = P.consolidateEvents(slots);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].timedEntry, true);
  assert.equal(rows[0].eventStart, '2026-10-26T19:30:00.000Z');
});

test('games with different feed titles at the same arena stay one game', () => {
  const rows = P.consolidateEvents([
    ev('New York Rangers vs. Los Angeles Kings', 'Madison Square Garden', '2026-10-26T23:00:00Z', 40.75, -73.992, { classification: 'Sports Hockey NHL' }),
    ev('Kings at Rangers', 'Madison Square Garden', '2026-10-26T23:07:00Z', 40.7505, -73.9934, { classification: 'Sports Hockey', league: 'NHL', tags: { liveEvent: true } })
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tags.liveEvent, true);
});

test('neighboring markets sharing an event show it once', () => {
  const show = ev('HEY, NOTHING - THE HOUND TOUR', '9:30 CLUB', '2026-10-26T23:00:00Z', 38.918, -77.024);
  const payload = { generatedAt: '2026-10-26T22:00:00Z', markets: [
    { id: 'baltimore', center: { lat: 39.2904, lon: -76.6122 }, radiusKm: 58, ticketmaster: { status: 'active', fetchedAt: '2026-10-26T22:00:00Z', events: [show] } },
    { id: 'washington-dc', center: { lat: 38.9072, lon: -77.0369 }, radiusKm: 40, ticketmaster: { status: 'active', fetchedAt: '2026-10-26T22:00:00Z', events: [{ ...show, name: 'Hey, Nothing' }] } }] };
  const rows = P.eventsForLocation(payload, 39.29, -76.61, Date.parse('2026-10-26T22:00:00Z'));
  assert.equal(rows.length, 1);
});

test('the app drops timed-entry rows and consolidates every event path', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.match(html, /event\?\.timedEntry\|\|event\?\.tags\?\.timedEntry/);
  assert.ok((html.match(/HomeBasePublicData\.consolidateEvents\(/g) || []).length >= 3);
  assert.match(html, /HomeBasePublicData\.sameEvent\(m,source\)/);
});
