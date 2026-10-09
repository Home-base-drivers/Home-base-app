import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBellPage, bcpssBellRegistry, clock, bellWindow } from '../scripts/school-bells.mjs';
import { tribeEvents, peninsulaCards, publishedVenueEvents, normalizePublicEvent } from '../scripts/public-events.mjs';
import { checkArea, watchAreaChecks } from '../scripts/watch-areas.mjs';
import publicData from '../dist/homebase-public-data.js';
import policy from '../dist/homebase-route-policy.js';

// Markup shape copied from a Baltimore City Public Schools school profile page.
const bellPage = (title, address, bells) => `<html><head><title>${title} | Baltimore City Public Schools</title></head><body><nav>School directory: 100 Other Street Baltimore, MD 21201</nav><h1>#410</h1><p>${address}</p>${bells}<p><strong>Community learning network</strong>: 2</p></body></html>`;

test('bell pages: single-level, multi-level, and non-school pages', () => {
  const mervo = parseBellPage(bellPage('Mergenthaler Vocational-Technical High School', '3500 Hillen Road<br>Baltimore, MD 21218', '<p style="text-align: center"><strong><span>High school opening bell:</span></strong><span> </span>7:45 AM<br><strong><span>High school closing bell:</span></strong><span> </span>2:35 PM</p>'));
  assert.deepEqual(mervo, { name: 'Mergenthaler Vocational-Technical High School', address: '3500 Hillen Road, Baltimore, MD 21218', levels: { high: { open: '07:45', close: '14:35' } } });
  const roland = parseBellPage(bellPage('Roland Park Elementary&#x2F;Middle School', '5207 Roland Avenue Baltimore, MD 21210', 'Elementary school opening bell: 8:00 AM Elementary school closing bell: 2:50 PM Middle school opening bell: 8:00 AM Middle school closing bell: 2:50 PM'));
  assert.equal(roland.name, 'Roland Park Elementary/Middle School');
  assert.deepEqual(Object.keys(roland.levels), ['elementary', 'middle']);
  assert.equal(parseBellPage('<title>Page Not Found | Baltimore City Public Schools</title>'), null);
  assert.equal(parseBellPage(bellPage('Odd', '1 A St Baltimore, MD 21201', 'Opening Bell: 3:00 PM Closing bell: 8:00 AM')), null, 'a close before the open is rejected');
  assert.equal(clock('12:15 PM'), '12:15'); assert.equal(clock('7:05 a.m.'), '07:05');
  assert.deepEqual(bellWindow(roland.levels, 'primary'), { open: '08:00', close: '14:50' });
});

test('bell registry crawls school pages, geocodes addresses, and keeps a good registry over a bad crawl', async () => {
  const pages = { 51: bellPage('Waverly Elementary&#x2F;Middle School', '3400 Ellerslie Avenue Baltimore, MD 21218', 'Opening Bell: 8:45 AM Closing bell: 3:25 PM'), 410: bellPage('Mergenthaler Vocational-Technical High School', '3500 Hillen Road Baltimore, MD 21218', 'High school opening bell: 7:45 AM High school closing bell: 2:35 PM') };
  const request = async url => { const id = Number(String(url).split('/').pop()); return pages[id] ? { ok: true, status: 200, text: async () => pages[id] } : { ok: false, status: 404, body: { cancel: async () => {} } }; };
  const geocode = async address => /Hillen/.test(address) ? { lat: 39.335586, lon: -76.588697 } : { lat: 39.3289, lon: -76.6066 };
  const now = Date.parse('2026-10-09T18:00:00Z');
  const registry = await bcpssBellRegistry(null, now, request, { maxId: 500, geocode });
  assert.equal(registry.schools.length, 2); assert.equal(registry.schools[1].lat, 39.335586);
  assert.equal(await bcpssBellRegistry(registry, now + 86_400_000, async () => { throw Error('should not crawl'); }), registry, 'fresh registry reused');
  const outage = await bcpssBellRegistry(registry, now + 8 * 86_400_000, async () => ({ ok: false, status: 503, body: { cancel: async () => {} } }), { maxId: 20 });
  assert.equal(outage.status, 'stale'); assert.equal(outage.schools.length, 2);
});

test('app matches a mapped school to its published bells by location and name', () => {
  const schools = [{ name: 'Mergenthaler Vocational-Technical High School', lat: 39.335586, lon: -76.588697, levels: { high: { open: '07:45', close: '14:35' } } }];
  assert.ok(publicData.bellMatch({ name: 'Mergenthaler Vocational-Technical High School', lat: 39.3359, lon: -76.5893 }, schools));
  assert.equal(publicData.bellMatch({ name: 'Lake Clifton Campus', lat: 39.3359, lon: -76.5893 }, schools), null, 'different school nearby');
  assert.equal(publicData.bellMatch({ name: 'Mergenthaler', lat: 39.30, lon: -76.58 }, schools), null, 'same name too far away');
  const payload = { markets: [{ center: { lat: 39.29, lon: -76.61 }, radiusKm: 58, schoolBells: { schools } }] };
  assert.equal(publicData.bellTimesForLocation(payload, 39.3, -76.6).length, 1);
  // The route policy then uses the published closing bell instead of 2:30 PM.
  const school = { cat: 'k12', name: 'Mergenthaler High School', schoolStart: '07:45', schoolEnd: '14:35', tags: { 'school:level': '3' } };
  assert.ok(policy.schoolWeight(school, { day: 5, hour: 14.75 }, new Date()) > 0);
  assert.equal(policy.schoolWeight(school, { day: 5, hour: 14.4 }, new Date()), 0, 'no dismissal weight before the published bell');
});

test('WordPress events API: UTC times, venue coordinates, unpublished and all-day rows skipped', () => {
  const body = JSON.stringify({ events: [
    { title: 'D.C. United vs. New York Red Bull', status: 'publish', utc_start_date: '2026-10-14 23:30:00', utc_end_date: '2026-10-15 02:00:00', url: 'https://audifield.com/event/x/', all_day: false, venue: { venue: 'Audi Field', geo_lat: '38.868411', geo_lng: '-77.012869' } },
    { title: 'Draft', status: 'draft', utc_start_date: '2026-10-14 23:30:00', venue: [] },
    { title: 'Festival day', status: 'publish', all_day: true, utc_start_date: '2026-10-14 04:00:00', venue: [] }] });
  const rows = tribeEvents(body, { venue: { name: 'Audi Field' } });
  assert.equal(rows.length, 2); assert.equal(rows[0].startDate, '2026-10-14T23:30:00Z'); assert.deepEqual(rows[0].location.geo, { latitude: 38.868411, longitude: -77.012869 });
  const market = { center: { lat: 38.9072, lon: -77.0369 }, radiusKm: 40, timeZone: 'America/New_York' };
  const source = { name: 'Audi Field events', url: 'https://audifield.com/x', classification: 'stadium soccer' };
  const now = Date.parse('2026-10-14T18:00:00Z');
  assert.ok(normalizePublicEvent(rows[0], market, source, now), 'a "vs." listing qualifies through the source classification');
  assert.equal(normalizePublicEvent(rows[0], market, { ...source, classification: '' }, now), null);
  assert.equal(normalizePublicEvent(rows[1], market, source, now), null, 'all-day rows are not timed demand');
  assert.equal(tribeEvents('not json', {}).length, 0);
});

test('Baltimore Peninsula event cards become local-time events at the configured district', () => {
  const html = '<a class="indexstyled__EventCardWrapper-sc-1odjath-0 kPQSjJ" href="/whats-happening/sunset-social/"><div><p class="t">Sunset Social with Sight of Mind Services</p><span class="indexstyled__EventCardInformationItem-sc-1odjath-5 hWPXmz">Friday<!-- -->, <!-- -->October 9, 2026</span><span class="indexstyled__EventCardInformationItem-sc-1odjath-5 hWPXmz">10:00 PM</span><span class="indexstyled__EventCardInformationItem-sc-1odjath-5 hWPXmz">321 E Cromwell St, Baltimore, MD</span></div></a>';
  const source = { adapter: 'peninsula', url: 'https://baltimorepeninsula.com/whats-happening/', venue: { name: 'Baltimore Peninsula', lat: 39.25941361, lon: -76.60656778 } };
  const rows = publishedVenueEvents(html, source);
  assert.equal(rows.length, 1); assert.equal(rows[0].startDate, '2026-10-09T22:00'); assert.equal(rows[0].url, 'https://baltimorepeninsula.com/whats-happening/sunset-social/');
  const event = normalizePublicEvent(rows[0], { center: { lat: 39.29, lon: -76.61 }, radiusKm: 58, timeZone: 'America/New_York' }, source, Date.parse('2026-10-09T18:00:00Z'));
  assert.equal(event.eventStart, '2026-10-10T02:00:00.000Z');
  assert.equal(peninsulaCards(html, { ...source, venue: undefined }).length, 0, 'no coordinates, no event');
});

test('watch areas list nearby published dismissals and events but never become demand sources', async () => {
  const now = Date.parse('2026-10-09T18:19:00Z'); // Friday 2:19 PM in Baltimore
  const market = { center: { lat: 39.29, lon: -76.61 }, radiusKm: 58, timeZone: 'America/New_York',
    schoolBells: { schools: [{ name: 'Mergenthaler Vocational-Technical High School', url: 'https://www.baltimorecityschools.org/page/410', lat: 39.335586, lon: -76.588697, levels: { high: { open: '07:45', close: '14:35' } } }, { name: 'Far School', lat: 39.2, lon: -76.5, levels: { all: { open: '08:00', close: '14:30' } } }] },
    publicRecords: { events: [{ name: 'Alumni open house', venue: 'Morgan State', lat: 39.346, lon: -76.582, eventStart: '2026-10-09T17:00:00Z' }] }, weatherAlerts: { alerts: [] } };
  const area = { id: 'better-waverly', name: 'Better Waverly', lat: 39.32439, lon: -76.60517, radiusKm: 2.5 };
  const result = checkArea(area, market, now);
  assert.deepEqual(result.schoolDismissals.map(d => [d.name, d.close, d.delta]), [['Mergenthaler Vocational-Technical High School', '14:35', 16]]);
  assert.equal(result.events.length, 0, 'Morgan State is outside this area');
  assert.equal(result.explained, true);
  const saturday = checkArea(area, market, Date.parse('2026-10-10T18:19:00Z'));
  assert.equal(saturday.schoolDismissals.length, 0, 'no dismissals on weekends');
  const all = await watchAreaChecks([market], now);
  assert.equal(all.referenceOnly, true); assert.ok(all.areas.length >= 8);
  assert.ok(all.areas.every(a => !('lat' in a) && !('score' in a)), 'checks carry no map coordinates or scores');
});

test('JSON event APIs pass the public calendar reader used by non-Baltimore markets', async () => {
  const { publicEventCalendars } = await import('../scripts/public-events.mjs');
  const body = JSON.stringify({ events: [{ title: 'D.C. United vs. Orlando City', status: 'publish', utc_start_date: '2026-10-14 23:30:00', venue: { venue: 'Audi Field', geo_lat: '38.868411', geo_lng: '-77.012869' } }] });
  const market = { center: { lat: 38.9072, lon: -77.0369 }, radiusKm: 40, timeZone: 'America/New_York', publicCalendars: [{ name: 'Audi Field events', url: 'https://audifield.com/wp-json/tribe/events/v1/events?per_page=50', adapter: 'tribe', classification: 'stadium soccer' }] };
  const result = await publicEventCalendars(market, Date.parse('2026-10-14T18:00:00Z'), async () => ({ ok: true, text: async () => body }));
  assert.equal(result.status, 'active'); assert.equal(result.events.length, 1);
});
