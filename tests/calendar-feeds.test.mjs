import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nextDataEvents, feedLinks, feedCandidates, localistEvents, normalizePublicEvent } from '../scripts/public-events.mjs';
import { readVenueCalendar, VENUE_HORIZON_HOURS } from '../scripts/venue-calendars.mjs';
const market = { id: 'baltimore', center: { lat: 39.2904, lon: -76.6122 }, radiusKm: 58, timeZone: 'America/New_York' };
const now = Date.parse('2026-10-27T16:00:00Z');

test('Next.js page data yields dated listings', () => {
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { events: [{ title: 'Halloween Rally', startDate: '2026-10-29T21:00:00-04:00', venue: { name: "Luckie's Tavern" } }, { title: 'No date' }] } } })}</script>`;
  const rows = nextDataEvents(html);
  assert.equal(rows.length, 1); assert.equal(rows[0].name, 'Halloween Rally'); assert.equal(rows[0].location.name, "Luckie's Tavern");
});

test('calendar pages expose their iCalendar, Events Calendar and Localist feeds', () => {
  const html = `<a href="webcal://events.towson.edu/calendar/1.ics">ics</a><a href="https://calendar.google.com/calendar/render?cid=http%3A%2F%2Fevents.morgan.edu%2Fcalendar%2F1.ics">g</a><div class="tribe-events"></div>`;
  assert.deepEqual(feedLinks(html, 'https://x.example/'), ['https://events.towson.edu/calendar/1.ics', 'https://events.morgan.edu/calendar/1.ics']);
  const kinds = feedCandidates(html, 'https://piersix.example/event-dates/').map(c => c.kind);
  assert.ok(kinds.includes('tribe') && kinds.includes('ics'));
  const rows = localistEvents(JSON.stringify({ events: [{ event: { title: 'Homecoming', location_name: 'Stadium', geo: { latitude: 39.3, longitude: -76.6 }, event_instances: [{ event_instance: { start: '2026-10-30T19:00:00-04:00' } }] } }] }));
  assert.equal(rows[0].name, 'Homecoming');
});

test('a listing with no data of its own is read through its event pages (Ottobar)', async () => {
  const source = { name: 'Ottobar calendar', url: 'https://theottobar.com/calendar/', followEvents: true, detailPages: true, classification: 'concert music', venue: { name: 'Ottobar', lat: 39.3186, lon: -76.6197 } };
  const pages = {
    'https://theottobar.com/calendar/': '<html><a href="https://theottobar.com/event/rasputina/ottobar/baltimore-maryland/">Rasputina</a><a href="https://theottobar.com/event/2027-ottobar-season-pass-2/ottobar/baltimore-maryland/">pass</a><a href="/calendar/page/2/">next</a></html>',
    'https://theottobar.com/event/rasputina/ottobar/baltimore-maryland/': '<html><script type="application/ld+json">{"@type":"MusicEvent","name":"Rasputina, Dust Bowl Faeries","startDate":"2026-10-27T20:00:00-04:00","location":{"@type":"Place","name":"Ottobar"}}</script></html>' };
  const request = async url => pages[String(url)] ? new Response(pages[String(url)], { status: 200 }) : new Response('', { status: 404 });
  const r = await readVenueCalendar(source, market, now, request, async () => ['93.184.216.34']);
  assert.equal(r.events.length, 1); assert.equal(r.events[0].venue, 'Ottobar'); assert.match(r.source.method, /detail-pages|json-ld/);
});

test('venues of one complex share its location; a week of listings is kept', () => {
  const source = { name: 'PPL', url: 'https://ppl.example/', venues: [{ name: 'Power Plant Live!', lat: 39.28936, lon: -76.60689 }, { name: "Luckie's Tavern", lat: 39.28936, lon: -76.60689 }] };
  const e = normalizePublicEvent({ name: 'Live Music Dr Shread', startDate: '2026-10-30T21:00:00-04:00', location: { name: 'Leinenkugel’s Beer Garden' }, description: 'music' }, market, source, now, VENUE_HORIZON_HOURS);
  assert.ok(e && e.lat === 39.28936);
  assert.equal(VENUE_HORIZON_HOURS, 168);
});

test('no configured calendar is a Ticketmaster web page (they always return 403; the API covers them)', () => {
  const markets = JSON.parse(fs.readFileSync(new URL('../config/provider-markets.json', import.meta.url), 'utf8')).markets;
  assert.ok(!markets.some(m => (m.publicCalendars || []).some(c => /ticketmaster\./.test(c.url) || /axs\.com/.test(c.url))));
  assert.ok(markets.find(m => m.id === 'london').sportsVenues.length >= 5);
});

test('listing titles are decoded from HTML entities', async () => {
  const { decodeEntities } = await import('../scripts/public-events.mjs');
  assert.equal(decodeEntities('Hawthorne Heights &#8211; 20th &amp; Uncle Kunkel&#8217;s &#038; more'), 'Hawthorne Heights – 20th & Uncle Kunkel’s & more');
});
