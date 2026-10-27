import test from 'node:test';
import assert from 'node:assert/strict';
import { saffireEvents, readVenueCalendar, venueCalendars } from '../scripts/venue-calendars.mjs';
import { mergeCheck, checkedToday, fromArchive, archiveFallback, emptyArchive, healthReport, localDay } from '../scripts/calendar-archive-core.mjs';
import { runCalendarCheck, calendarJobs } from '../scripts/calendar-archive.mjs';
import config from '../config/provider-markets.json' with { type: 'json' };

const baltimore = config.markets.find(m => m.id === 'baltimore');
const bcc = baltimore.publicCalendars.find(s => /Convention Center/.test(s.name));
const NOW = Date.parse('2026-11-07T14:00:00Z');
const item = (over = {}) => ({ EventID: 906, Name: 'Maryland Bridal &amp; Wedding Expo', IsPrivate: false, IsMemberOnly: false, EventTimeRangeString: '', DetailURL: 'https://www.bccenter.org/events/2026/maryland-bridal--wedding-expo2', Locations: [{ Name: 'Baltimore Convention Center', Latitude: 0, Longitude: 0 }], ...over });
const payload = { d: { Days: [
  { DateString: '11/08/2026', Times: [{ HasSpecificTime: false, TimeDisplay: '', Items: [item(), item({ EventID: 1, Name: 'Private board meeting', IsPrivate: true })] }] },
  { DateString: '11/10/2026', Times: [{ HasSpecificTime: true, TimeDisplay: '7:00 PM', Items: [item({ EventID: 2, Name: 'Anime Convention Night', EventTimeRangeString: '7:00 PM - 11:00 PM' })] }] }
] } };

test('Baltimore Convention Center is read through its Saffire events service', () => {
  assert.equal(bcc.adapter, 'saffire');
  const rows = saffireEvents(payload, bcc);
  assert.equal(rows.length, 2, 'private listings are skipped');
  assert.equal(rows[0].startDate, '2026-11-08T09:00:00');
  assert.equal(rows[0].endDate, '2026-11-08T17:00:00');
  assert.equal(rows[0].approximateTime, true);
  assert.equal(rows[1].startDate, '2026-11-10T19:00:00');
  assert.equal(rows[1].endDate, '2026-11-10T23:00:00');
  assert.equal(rows[1].approximateTime, false);
});

test('Saffire calendar posts both service calls and places events at the convention center', async () => {
  const calls = [];
  const request = async (url, init) => { calls.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, json: async () => /GetEventDays$/.test(url) ? { d: ['11/08/2026', '11/10/2026'] } : payload }; };
  const result = await readVenueCalendar(bcc, baltimore, NOW, request);
  assert.deepEqual(calls.map(c => c.url.split('/').pop()), ['GetEventDays', 'GetEventDaysByList']);
  assert.equal(calls[1].body.dates, '11/08/2026,11/10/2026');
  assert.equal(result.source.status, 'active');
  assert.equal(result.source.method, 'saffire-api');
  assert.equal(result.events.length, 2);
  const expo = result.events.find(e => /Bridal/.test(e.name));
  assert.equal(expo.name, 'Maryland Bridal & Wedding Expo');
  assert.equal(expo.timePrecision, 'approximate');
  assert.equal(expo.lat, 39.28578);
  assert.equal(expo.eventStart, '2026-11-08T14:00:00.000Z');
});

const live = (events, status = 'active') => ({ source: { name: bcc.name, url: bcc.url, status, method: 'saffire-api', reason: status === 'unavailable' ? 'http_503' : undefined }, events, context: [] });
const ev = (name, start, end) => ({ id: 'public:' + name + start, name, lat: 39.28578, lon: -76.61802, eventStart: start, eventEnd: end });

test('a calendar read today is not fetched again the same day, and is re-read the next day', async () => {
  const entry = mergeCheck(null, live([ev('Expo', '2026-11-08T14:00:00.000Z', '2026-11-08T22:00:00.000Z')]), { now: NOW, market: baltimore });
  assert.ok(checkedToday(entry, NOW + 3 * 3600_000, baltimore.timeZone));
  assert.ok(!checkedToday(entry, NOW + 24 * 3600_000, baltimore.timeZone));
  const archive = { ...emptyArchive(), sources: { [bcc.url]: entry } };
  let calls = 0;
  const result = await venueCalendars(baltimore, [bcc], NOW + 3600_000, async () => { calls++; throw Error('should not fetch'); }, undefined, archive);
  assert.equal(calls, 0);
  assert.equal(result.events.length, 1);
  assert.match(result.sources[0].method, /^archive/);
});

test('saved events stay available when the website is down or stops sending data', async () => {
  const yesterday = NOW - 24 * 3600_000;
  const entry = mergeCheck(null, live([ev('Expo', '2026-11-08T14:00:00.000Z', '2026-11-08T22:00:00.000Z')]), { now: yesterday, market: baltimore });
  // Down: the check keeps saved events and counts the failure.
  const down = mergeCheck(entry, live([], 'unavailable'), { now: NOW, market: baltimore });
  assert.equal(down.events.length, 1);
  assert.equal(down.consecutiveFailures, 1);
  assert.equal(down.lastSuccessAt, entry.lastSuccessAt);
  // Answering with an empty list while events were still coming counts as no data.
  const silent = mergeCheck(entry, live([]), { now: NOW, market: baltimore });
  assert.equal(silent.events.length, 1);
  assert.equal(silent.reason, 'no_events_returned');
  // Live refresh falls back to the archive.
  const archive = { ...emptyArchive(), sources: { [bcc.url]: entry } };
  const fallback = archiveFallback(archive, bcc, live([], 'unavailable'), NOW, 168);
  assert.equal(fallback.source.status, 'archived');
  assert.equal(fallback.events.length, 1);
  assert.ok(fallback.events[0].archived);
  const result = await venueCalendars(baltimore, [bcc], NOW, async () => ({ ok: false, status: 503 }), undefined, archive);
  assert.equal(result.events.length, 1);
  assert.equal(result.sources[0].status, 'archived');
});

test('a successful read replaces upcoming saved events and keeps recent past ones', () => {
  const old = mergeCheck(null, live([ev('Past show', '2026-11-05T23:00:00.000Z'), ev('Cancelled expo', '2026-11-09T14:00:00.000Z')]), { now: NOW - 3 * 86400_000, market: baltimore });
  const next = mergeCheck(old, live([ev('New expo', '2026-11-10T14:00:00.000Z')]), { now: NOW, market: baltimore });
  assert.deepEqual(next.events.map(e => e.name), ['Past show', 'New expo']);
  assert.equal(next.lastSuccessDay, localDay(NOW, baltimore.timeZone));
});

test('the daily check covers every configured calendar, skips ones read today and writes a report', async () => {
  const jobs = calendarJobs(config.markets);
  for (const market of config.markets) for (const s of market.publicCalendars || []) assert.ok(jobs.some(j => j.key === s.url), s.name);
  assert.ok(jobs.some(j => j.key === bcc.url));
  assert.ok(jobs.some(j => j.kind === 'campus'));
  const only = new Set(['north-jersey']);
  let fetches = 0;
  const request = async () => { fetches++; return { ok: false, status: 503, text: async () => '', json: async () => ({}) }; };
  const first = await runCalendarCheck({ archive: null, now: NOW, request, only });
  assert.ok(first.summary.checked > 0 && first.summary.failed === first.summary.checked);
  const seeded = structuredClone(first.archive);
  for (const entry of Object.values(seeded.sources)) Object.assign(entry, { lastSuccessAt: new Date(NOW).toISOString(), lastSuccessDay: localDay(NOW, 'America/New_York'), status: 'active' });
  fetches = 0;
  const second = await runCalendarCheck({ archive: seeded, now: NOW + 3600_000, request, only });
  assert.equal(fetches, 0);
  assert.equal(second.summary.skipped, first.summary.checked);
  assert.match(healthReport(second.archive, NOW), /\| north-jersey \|/);
});

test('fromArchive ignores sources not read today', () => {
  assert.equal(fromArchive(emptyArchive(), bcc, NOW, baltimore.timeZone, 168), null);
});
