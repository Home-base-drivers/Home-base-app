import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import history from '../dist/homebase-demand-history.js';
import heat from '../dist/homebase-heat.js';
import policy from '../dist/homebase-route-policy.js';
import { circulation } from '../scripts/surge-circulation.mjs';

// A Philadelphia point: patterns are learned from coordinates in any city.
const philly = { lat: 39.9526, lon: -75.1652 };
const at = (date, time) => `${date}T${time}:00-04:00`;
const log = (date, time, usd, where = philly) => history.recordObservation({ ...where, usd, platform: 'Uber', at: at(date, time), area: 'Center City' }, Date.parse(at(date, time)));

test('one day stays a faint reference; repeats on weekdays at the same time become a pattern', () => {
  assert.equal(log('2026-10-05', '15:10', 6), true); // Monday
  const one = history.forecastAt(philly.lat, philly.lon, new Date(at('2026-10-12', '15:10')));
  assert.equal(one.distinctDates, 1); assert.ok(one.strength <= .01);
  log('2026-10-06', '15:12', 5); // Tuesday
  const two = history.forecastAt(philly.lat, philly.lon, new Date(at('2026-10-12', '15:10')));
  assert.equal(two.distinctDates, 2); assert.equal(two.basis, 'recurring pattern'); assert.ok(two.strength > .05 && two.strength <= .08);
  log('2026-10-07', '15:05', 7); log('2026-10-08', '15:15', 6.5); log('2026-10-09', '15:08', 6);
  const five = history.forecastAt(philly.lat, philly.lon, new Date(at('2026-10-12', '15:10')));
  assert.equal(five.distinctDates, 5); assert.ok(five.strength > .3 && five.strength <= .45, 'a week of repeats is strong predicted heat');
  assert.equal(history.forecastAt(philly.lat, philly.lon, new Date(at('2026-10-12', '16:10'))).strength, 0, 'nothing an hour later');
  assert.equal(history.forecastAt(philly.lat, philly.lon, new Date(at('2026-10-10', '15:10'))).strength, 0, 'weekday patterns do not paint Saturday');
  assert.equal(history.forecastAt(39.99, -75.10, new Date(at('2026-10-12', '15:10'))).strength, 0, 'only near where it was seen');
  const sources = history.patternSources(new Date(at('2026-10-12', '15:10')));
  assert.ok(sources.some(s => Math.abs(s.lat - philly.lat) < 1e-6 && s.tags.recurringPattern && s.tags.patternDates === 5));
});

test('calm captures at the same time lower the pattern share', () => {
  const spot = { lat: 41.88, lon: -87.63 };
  for (const d of ['2026-10-05', '2026-10-06', '2026-10-07']) log(d, '08:00', 5, spot);
  const before = history.forecastAt(spot.lat, spot.lon, new Date(at('2026-10-12', '08:00'))).strength;
  for (const d of ['2026-10-08', '2026-10-09']) log(d, '08:00', 0, spot);
  const after = history.forecastAt(spot.lat, spot.lon, new Date(at('2026-10-12', '08:00')));
  assert.ok(after.strength < before); assert.equal(after.distinctDates, 3); assert.equal(after.observedDates, 5);
});

test('driver logs reject stale, future or malformed entries', () => {
  const now = Date.parse('2026-10-09T15:00:00-04:00');
  assert.equal(history.recordObservation({ ...philly, usd: 5, at: '2026-10-09T05:00:00-04:00' }, now), false);
  assert.equal(history.recordObservation({ ...philly, usd: 5, at: '2026-10-09T16:00:00-04:00' }, now), false);
  assert.equal(history.recordObservation({ lat: 99, lon: 0, usd: 5, at: '2026-10-09T14:50:00-04:00' }, now), false);
  assert.equal(history.recordObservation({ ...philly, usd: -1, at: '2026-10-09T14:50:00-04:00' }, now), false);
});

test('Baltimore screenshots already make Towson a weekday 3 PM pattern', () => {
  const towson = history.forecastFor('Towson', new Date('2026-10-15T15:15:00-04:00'), true);
  assert.ok(towson.distinctDates >= 2); assert.equal(towson.basis, 'recurring pattern');
  assert.equal(history.forecastFor('Towson', new Date('2026-10-15T12:00:00-04:00'), true).strength, 0);
});

test('heat draws established patterns as predicted (not live) heat; fresh data still wins', () => {
  const faint = heat.composePixel(0, 0, {}, .08), strong = heat.composePixel(0, 0, {}, .35);
  assert.ok(strong.opacity > faint.opacity && strong.level > faint.level);
  assert.ok(strong.level <= .7, 'never the live-surge purple range');
  assert.equal(heat.composePixel(0, 0, { current: 1 }, .35).opacity, 0);
  const withSignal = heat.composePixel(.5, .5, {}, .35);
  assert.ok(withSignal.level <= .7 && withSignal.level > heat.composePixel(.5, .5, {}, 0).level);
  const field = heat.composeFields(0, 0, .05, .05, {}, .35);
  assert.ok(field.opacity > heat.composeFields(0, 0, .05, .05, {}, .08).opacity);
  assert.ok(heat.historicalPriorForSource({ name: 'x', ...philly }, new Date(at('2026-10-12', '15:10')), history) > .3, 'coordinate patterns work outside Baltimore');
});

test('dismissal window peaks around the published closing bell and fades by +75 minutes', () => {
  const school = { cat: 'k12', name: 'Elementary School', schoolStart: '08:00', schoolEnd: '14:30' };
  const w = minutes => policy.schoolWeight(school, { day: 3, hour: 14.5 + minutes / 60 }, new Date());
  assert.equal(w(-30), 0); assert.ok(w(-15) > 0 && w(-15) < w(0)); assert.equal(w(0), 8); assert.equal(w(15), 8);
  assert.ok(w(30) < 8 && w(60) < w(30) && w(60) > 0); assert.equal(w(80), 0);
});

test('closed shift sites switch off mapped warehouses; verified fulfillment centers are added', () => {
  const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  const start = html.indexOf('function applySiteStatus('), body = html.indexOf('{', start); let depth = 0, end = body;
  for (; end < html.length; end++) { if (html[end] === '{') depth++; else if (html[end] === '}' && !--depth) break; }
  const ctx = { HomeBaseRoutePolicy: policy, distanceKm: (a, b) => { const r = Math.PI / 180, x = (b[1] - a[1]) * r * Math.cos((a[0] + b[0]) * r / 2), y = (b[0] - a[0]) * r; return Math.sqrt(x * x + y * y) * 6371; },
    employerSites: JSON.parse(fs.readFileSync(new URL('../config/employer-sites.json', import.meta.url), 'utf8')).sites };
  vm.createContext(ctx); vm.runInContext(html.slice(start, end + 1), ctx);
  const kelso = { name: 'Amazon', cat: 'warehouse', lat: 39.3265, lon: -76.4871, tags: { building: 'warehouse' } };
  const out = ctx.applySiteStatus([kelso]);
  assert.equal(out[0].tags.siteClosed, true);
  assert.equal(policy.workerWeight(out[0], { day: 3, hour: 15 }), 0);
  assert.ok(out.some(s => /Tradepoint/.test(s.name) && policy.workerWeight(s, { day: 3, hour: 15 }) > 0));
});

test('circulation analysis lines up observed peaks with nearby closing bells', () => {
  const rows = [
    { record_type: 'uber_reference', captured_at: '2026-10-09T14:05:00-04:00', capture_hour_local: 14, area_observations: [{ area: 'Better Waverly', band: 'calm', lat: 39.324, lon: -76.605 }] },
    { record_type: 'uber_reference', captured_at: '2026-10-09T14:19:00-04:00', capture_hour_local: 14, area_observations: [{ area: 'Better Waverly', band: 'very_high', shown_usd: 10, lat: 39.324, lon: -76.605 }] },
    { record_type: 'uber_reference', captured_at: '2026-10-09T15:22:00-04:00', capture_hour_local: 15, area_observations: [{ area: 'Better Waverly', band: 'calm', lat: 39.324, lon: -76.605 }] }];
  const schools = [{ name: 'Mergenthaler', lat: 39.3356, lon: -76.5887, levels: { high: { open: '07:45', close: '14:35' } } }];
  const [episode] = circulation(rows, { schools });
  assert.equal(episode.peak, '2:19 PM'); assert.equal(episode.fadedBy, '3:22 PM'); assert.equal(episode.nearestBells[0].offset, -16);
});
