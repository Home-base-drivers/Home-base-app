import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const History = createRequire(import.meta.url)('../dist/homebase-demand-history.js');
const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');

test('route-scale history lookups stay fast (the app froze when each took ~10 ms)', () => {
  const t = Date.now(); let n = 0;
  for (let i = 0; i < 300; i++) for (let h = 0; h < 12; h++) { History.recurrenceAt(39.2 + i * .001, -76.7 + i * .001, new Date(Date.UTC(2026, 10, 2, 11 + h)), { route: true }); n++; }
  const per = (Date.now() - t) / n;
  assert.ok(per < 4, `${per.toFixed(2)} ms per lookup`);
});

test('out-of-town games are never pinned to a Baltimore venue by a generic word', () => {
  const start = html.indexOf('const GENERIC_VENUE_WORDS'), end = html.indexOf('async function loadEspnEvents');
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(html.slice(html.indexOf('function eventToken('), html.indexOf('function knownBaltimoreVenue(')) + html.slice(start, end).replace('const GENERIC', 'var GENERIC'), ctx);
  const venues = [{ name: 'Baltimore Convention Center' }, { name: 'Union Square' }, { name: 'CFG Bank Arena' }, { name: 'Capital One Arena' }];
  for (const v of ['Paycom Center', 'Toyota Center (Houston)', 'Delta Center', 'Madison Square Garden', 'Rocket Arena']) assert.equal(ctx.findEventVenue(v, venues), null, v);
  assert.equal(ctx.findEventVenue('Capital One Arena', venues).name, 'Capital One Arena');
  assert.equal(ctx.findEventVenue('CFG Bank Arena', venues).name, 'CFG Bank Arena');
  assert.match(html, /cityOk=!city\|\|!marketName/);
});

// History only grows. These budgets fail long before a phone would freeze again:
// with ~550 records each route lookup took ~10 ms and a 12-hour route ~50-75 s.
function historyWith(extraRows) {
  const vm = require('node:vm'), src = fs.readFileSync(new URL('../dist/homebase-demand-history.js', import.meta.url), 'utf8');
  const ctx = { localStorage: { getItem: k => k === 'homeBaseDemandBenchmarks' ? JSON.stringify(extraRows) : null, setItem() {} }, Intl, Date, Math, JSON, console };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.module = { exports: {} }; vm.createContext(ctx); vm.runInContext(src, ctx);
  return ctx.module.exports;
}
const require = createRequire(import.meta.url);
test('route-scale lookups stay fast with four times today\'s history', () => {
  const extra = [];
  for (let i = 0; i < 1800; i++) {
    const day = new Date(Date.UTC(2026, 8, 1 + (i % 55), 10 + (i % 12), (i * 7) % 60)), lat = 39.2 + (i % 40) * .006, lon = -76.75 + (i % 37) * .008;
    extra.push({ id: 'synthetic-' + i, record_type: i % 2 ? 'uber_reference' : 'empower_reference', captured_at: day.toISOString(), capture_hour_local: day.getUTCHours() - 4,
      notifications: i % 2 ? undefined : [{ at: day.toISOString(), surge_usd: 5 }],
      area_observations: [{ area: 'Synthetic ' + i, band: 'high', lat, lon, radiusKm: 1.6, shown_usd: 5 }, { area: 'Synthetic b' + i, band: 'elevated', lat: lat + .01, lon: lon - .01, radiusKm: 1.6, shown_usd: 2 }] });
  }
  const H = historyWith(extra);
  assert.ok(H.observationRows().length >= 2300);
  const t = Date.now();
  for (let c = 0; c < 400; c++) for (let h = 0; h < 12; h++) H.recurrenceAt(39.2 + (c % 40) * .006, -76.75 + (c % 37) * .008, new Date(Date.UTC(2026, 10, 2, 11 + h)), { route: true });
  const ms = Date.now() - t;
  assert.ok(ms < 10000, `12-hour route over 400 places took ${ms} ms (phone would be ~3-5x slower)`);
});

test('scoreboard games without coordinates never land on a Baltimore venue unless they are Baltimore games', async () => {
  const vm = require('node:vm'), ctx = { HomeBaseSports: { watchParties: () => [] }, HomeBaseRoutePolicy: require('../dist/homebase-route-policy.js'),
    isGreaterBaltimoreLocation: (lat, lon) => lat > 38.9 && lat < 39.75 && lon > -77.1 && lon < -76.0, marketTime: () => '7:00 PM', scoreboardKey: id => id,
    distanceKm: (a, b) => { const r = Math.PI / 180, x = (b[1] - a[1]) * r * Math.cos((a[0] + b[0]) * r / 2), y = (b[0] - a[0]) * r; return Math.sqrt(x * x + y * y) * 6371; } };
  const rows = [
    { id: 'nba:okc', name: 'PHX @ OKC', league: 'NBA', venue: 'Paycom Center', city: 'Oklahoma City', eventStart: '2026-10-27T00:00:00Z', state: 'live' },
    { id: 'nba:hou', name: 'ATL @ HOU', league: 'NBA', venue: 'Toyota Center (Houston)', city: 'Houston', eventStart: '2026-10-27T00:30:00Z', state: 'live' },
    { id: 'nhl:nyr', name: 'LA @ NYR', league: 'NHL', venue: 'Madison Square Garden', city: 'New York', eventStart: '2026-10-26T23:00:00Z', state: 'live' },
    { id: 'nba:cle', name: 'MIN @ CLE', league: 'NBA', venue: 'Rocket Arena', city: 'Cleveland', eventStart: '2026-10-26T23:00:00Z', state: 'live' },
    { id: 'mlb:far', name: 'Far game', league: 'MLB', venue: 'Somewhere Park', lat: 29.75, lon: -95.36, eventStart: '2026-10-26T23:00:00Z', state: 'live' },
    { id: 'nfl:bal', name: 'CIN @ BAL', league: 'NFL', venue: 'M&T Bank Stadium', city: 'Baltimore', eventStart: '2026-10-26T23:00:00Z', state: 'live' }];
  ctx.scoreboardGames = async () => rows;
  vm.createContext(ctx);
  const pick = (a, b) => html.slice(html.indexOf(a), html.indexOf(b));
  vm.runInContext(pick('function scoreboardEvent(', '// Leagues with a nearby game') + pick('async function loadScoreboardEvents(', 'async function loadTodaySports(') + pick('function eventToken(', 'async function loadEspnEvents(').replace('const GENERIC', 'var GENERIC'), ctx);
  const venues = [{ name: 'Baltimore Convention Center', lat: 39.2858, lon: -76.618 }, { name: 'Union Square', lat: 39.2867, lon: -76.6415 }, { name: 'Rocket Lab', lat: 39.3, lon: -76.6 }];
  const out = await ctx.loadScoreboardEvents(39.355, -76.61, 'Baltimore', venues);
  assert.deepEqual([...out].map(e => String(e.name).split(' · ')[0]), ['CIN @ BAL']);
  assert.equal(out[0].venue, 'M&T Bank Stadium');
});

test('heat drawing keeps per-cell work allocation-free', () => {
  const heat = fs.readFileSync(new URL('../dist/homebase-heat.js', import.meta.url), 'utf8');
  assert.doesNotMatch(heat, /\]\.includes\(source\.evidence\)/, 'per-cell array allocation in the heat inner loop');
  assert.match(heat, /isCurrent=ev==='event'/);
});
