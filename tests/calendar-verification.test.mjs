import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { judge } from '../scripts/verify-calendar-sources.mjs';

const NOW = Date.parse('2026-10-15T12:00:00Z');
const at = days => new Date(NOW + days * 864e5).toISOString();

test('a source with real future dated events passes', () => {
  const v = judge({ events: [
    { name: 'Heat vs Celtics', eventStart: at(3) },
    { name: 'Concert', eventStart: at(10) }
  ] }, NOW);
  assert.equal(v.verdict, 'PASS');
  assert.match(v.reason, /2 dated event/);
  assert.equal(v.sample.length, 2);
});

test('a fetch failure is rejected with its reason, not counted as empty', () => {
  const v = judge({ error: 'HTTP 403' }, NOW);
  assert.equal(v.verdict, 'REJECT');
  assert.equal(v.reason, 'HTTP 403');
});

// A page that renders but lists nothing is the common failure for venue sites
// behind JavaScript, and it must not be mistaken for a working source.
test('a source that returns no events is rejected', () => {
  for (const r of [{ events: [] }, {}, null]) {
    assert.equal(judge(r, NOW).verdict, 'REJECT');
  }
});

test('undated or unparseable entries are rejected', () => {
  const v = judge({ events: [{ name: 'Season tickets' }, { name: 'TBD', eventStart: 'soon' }] }, NOW);
  assert.equal(v.verdict, 'REJECT');
  assert.match(v.reason, /no usable future date|none carried/);
});

// Scraping an archive page would otherwise "pass" on last year's fixtures.
test('only past events is rejected', () => {
  const v = judge({ events: [{ name: 'Old game', eventStart: at(-30) }] }, NOW);
  assert.equal(v.verdict, 'REJECT');
});

test('absurdly far-future dates do not count as real schedule data', () => {
  const v = judge({ events: [{ name: 'Placeholder', eventStart: at(900) }] }, NOW);
  assert.equal(v.verdict, 'REJECT');
});

test('dated entries without names are rejected', () => {
  const v = judge({ events: [{ eventStart: at(2) }, { name: ' ', eventStart: at(4) }] }, NOW);
  assert.equal(v.verdict, 'REJECT');
  assert.match(v.reason, /no event names/);
});

test('the candidate list is staged, not live', async () => {
  const candidates = JSON.parse(await readFile(new URL('../config/miami-calendar-candidates.json', import.meta.url), 'utf8'));
  const markets = JSON.parse(await readFile(new URL('../config/provider-markets.json', import.meta.url), 'utf8'));
  const miami = markets.markets.find(m => m.id === 'miami');
  assert.ok(miami, 'miami must be a configured market');
  assert.ok(candidates.candidates.length >= 6);
  // Nothing unverified may reach the live market config.
  const live = new Set((miami.publicCalendars || []).map(c => c.url));
  for (const c of candidates.candidates) {
    assert.ok(!live.has(c.url), `${c.url} must not be live until it has been verified`);
  }
});

// Running the verifier where the network is blocked must not condemn the
// sources: readVenueCalendar returns an empty list on transport failure, which
// is indistinguishable from a dead calendar unless reachability is probed.
test('an unreachable host is UNKNOWN, never REJECT', () => {
  const v = judge({ unreachable: 'ENOTFOUND' }, NOW);
  assert.equal(v.verdict, 'UNKNOWN');
  assert.match(v.reason, /cannot reach/);
});
