import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const P = require('../dist/homebase-public-data.js');
const HOUR = 3600_000;
const wf = fs.readFileSync(new URL('../.github/workflows/live-signals.yml', import.meta.url), 'utf8');
const windowMinutes = Number(wf.match(/rpc\/active_markets"[^\n]*"p_minutes":(\d+)/)?.[1]);

// A scheduled run refreshes a market only if a driver pinged it within the window.
const refreshedBy = (runs, pings, minutes) => runs.filter(run => pings.some(p => p <= run && run - p <= minutes * 60_000));

test('scheduled refresh counts a market active for as long as the app keeps its calendar', () => {
  assert.ok(Number.isFinite(windowMinutes), 'workflow asks active_markets for a window');
  assert.ok(windowMinutes >= 24 * 60, `window ${windowMinutes} min is shorter than the 24 h the app keeps a calendar`);
  assert.ok(windowMinutes <= 24 * 60, 'active_markets caps the window at 1440 minutes');
});

test('Nov 16-19 2026: the old 2 h window skipped Baltimore on every run; the new window refreshes it', () => {
  // Real times (UTC) from the live-signals run log and the market_activity pings.
  const runs = ['2026-11-16T08:00:43Z', '2026-11-16T18:22:20Z', '2026-11-17T01:55:58Z', '2026-11-17T10:31:52Z',
    '2026-11-17T19:20:59Z', '2026-11-18T01:43:51Z', '2026-11-18T09:15:12Z', '2026-11-18T18:14:23Z',
    '2026-11-19T00:33:23Z', '2026-11-19T07:53:37Z', '2026-11-19T17:04:30Z', '2026-11-19T23:35:06Z'].map(Date.parse);
  const pings = ['2026-11-16T01:15:00Z', '2026-11-19T05:28:51Z'].map(Date.parse);
  assert.equal(refreshedBy(runs, pings, 120).length, 0);
  const fresh = refreshedBy(runs, pings, windowMinutes);
  assert.ok(fresh.includes(Date.parse('2026-11-19T23:35:06Z')), 'the evening run before the CFG Bank Arena concert refreshes Baltimore');
});

test('events in a refreshed snapshot show; the same snapshot a day later is hidden as stale', () => {
  const generatedAt = '2026-11-19T23:35:30Z';
  const payload = { generatedAt, markets: [{ id: 'baltimore', center: { lat: 39.2904, lon: -76.6122 }, radiusKm: 58,
    ticketmaster: { status: 'active', fetchedAt: generatedAt, events: [{ id: 'cfg-1', name: 'Concert at CFG Bank Arena', venue: 'CFG Bank Arena',
      lat: 39.2885, lon: -76.6189, eventStart: '2026-11-20T00:30:00.000Z', eventEnd: '2026-11-20T03:30:00.000Z' }] } }] };
  const tonight = Date.parse('2026-11-20T02:13:00Z');
  assert.deepEqual(P.eventsForLocation(payload, 39.29, -76.61, tonight).map(e => e.venue), ['CFG Bank Arena']);
  assert.equal(P.eventsForLocation(payload, 39.29, -76.61, tonight + 25 * HOUR).length, 0);
});
