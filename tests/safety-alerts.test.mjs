import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeChart, chartCovers, trafficIncidents } from '../scripts/traffic-incidents.mjs';
import Safety from '../dist/homebase-safety.js';
import publicData from '../dist/homebase-public-data.js';
import config from '../config/provider-markets.json' with { type: 'json' };

const baltimore = config.markets.find(m => m.id === 'baltimore');
const lane = (d, status, type = 'Traffic Lane') => ({ laneDescription: d, laneStatus: status, laneType: type });
const chart = { data: [
  { id: 'a1', incidentType: 'Collision', description: 'Incident @ I-83 SOUTH PRIOR TO EXIT 17 PADONIA RD (SB) (MM 17.0)', direction: 'South', lat: 39.4505, lon: -76.6353, lanes: [lane('RS', 'closed', 'Shoulder'), lane('L1', 'closed'), lane('L2', 'open')], startDateTime: Date.parse('2026-10-27T15:00:00Z'), vehicles: '2 vehicles involved.' },
  { id: 'a2', incidentType: 'Other', description: 'Action Event @ MD 77 @ WATER ST [Traffic Control Signal]', lat: 39.3, lon: -76.6, lanes: [] },
  { id: 'a3', incidentType: 'Roadwork', description: 'Incident @ MD 146 SOUTH AT SEMINARY AVE', lat: 39.42, lon: -76.62, lanes: [lane('L1', 'open')] },
  { id: 'a4', incidentType: 'Disabled Vehicle', description: 'Incident @ I-95 NORTH AT EXIT 53', lat: 39.29, lon: -76.62, lanes: [lane('RS', 'closed', 'Shoulder'), lane('L1', 'open')] },
  { id: 'far', incidentType: 'Collision', description: 'Incident @ I-70 EAST AT MM 8.0', lat: 39.62, lon: -77.9, lanes: [] }
] };

test('Maryland CHART incidents are filtered to real driver hazards in the market', () => {
  assert.ok(chartCovers(baltimore));
  assert.ok(!chartCovers(config.markets.find(m => m.id === 'london')));
  const rows = normalizeChart(chart, baltimore);
  assert.deepEqual(rows.map(r => r.id), ['chart:a1', 'chart:a4']);
  assert.equal(rows[0].severity, 'major'); assert.equal(rows[0].lanesClosed, 1); assert.equal(rows[0].lanesTotal, 2); assert.equal(rows[0].vehicles, 2);
  assert.equal(rows[0].road, 'I-83 SOUTH PRIOR TO EXIT 17 PADONIA RD (SB) (MM 17.0)');
  assert.equal(rows[1].severity, 'minor');
});

test('traffic feed failures are reported, never invented; non-Maryland markets say not supported', async () => {
  assert.equal((await trafficIncidents(baltimore, Date.now(), async () => ({ ok: false, status: 503 }))).status, 'unavailable');
  assert.equal((await trafficIncidents(config.markets.find(m => m.id === 'london'))).status, 'not_supported');
  const ok = await trafficIncidents(baltimore, Date.now(), async () => ({ ok: true, json: async () => chart }));
  assert.equal(ok.status, 'active'); assert.equal(ok.incidents.length, 2);
});

test('weather alerts and nearby crashes are spoken once each, and muting stops them', () => {
  const store = new Map();
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  try {
    const now = Date.parse('2026-10-27T16:00:00Z');
    const incidents = normalizeChart(chart, baltimore).map(i => ({ ...i, fetchedAt: new Date(now - 60000).toISOString() }));
    const alerts = [{ id: 'w1', event: 'Flood Warning', severity: 'Severe', safety: true, onset: new Date(now - 600000).toISOString(), ends: new Date(now + 3 * 3600000).toISOString() },
      { id: 'w2', event: 'Special Weather Statement', severity: 'Minor', onset: new Date(now).toISOString(), ends: new Date(now + 3600000).toISOString() }];
    Safety.setEnabled(true);
    const where = { lat: 39.44, lon: -76.63 }; // ~1 mile from the I-83 crash
    const first = Safety.check({ alerts, where, now, list: incidents });
    assert.equal(first.length, 2);
    assert.match(first[0], /^Weather alert: Flood Warning in effect until/);
    assert.match(first[1], /^Traffic alert: Crash on I-83 South Before Exit 17 Padonia Rd, one lane closed, (less than a mile|about 1 mile) away\.$/);
    assert.deepEqual(Safety.check({ alerts, where, now: now + 60000, list: incidents }), [], 'nothing repeats');
    assert.deepEqual(Safety.check({ alerts, where: { lat: 38.9, lon: -77.0 }, now, list: incidents.map(i => ({ ...i, id: i.id + 'x' })) }).filter(s => /Traffic/.test(s)), [], 'far incidents stay quiet');
    Safety.setEnabled(false);
    assert.deepEqual(Safety.check({ alerts: [{ ...alerts[0], id: 'w9' }], where, now }), []);
  } finally { delete globalThis.localStorage; }
});

test('the app passes incidents to spoken alerts and to Home Base AI', () => {
  const payload = { markets: [{ id: 'baltimore', center: baltimore.center, radiusKm: baltimore.radiusKm, trafficIncidents: { status: 'active', fetchedAt: new Date().toISOString(), incidents: normalizeChart(chart, baltimore) } }] };
  assert.equal(publicData.incidentsForLocation(payload, 39.29, -76.61).length, 2);
  const stale = { markets: [{ ...payload.markets[0], trafficIncidents: { ...payload.markets[0].trafficIncidents, fetchedAt: new Date(Date.now() - 3600000).toISOString() } }] };
  assert.equal(publicData.incidentsForLocation(stale, 39.29, -76.61).length, 0);
  const html = fs.readFileSync('dist/index.html', 'utf8'), copilot = fs.readFileSync('dist/homebase-copilot.js', 'utf8');
  assert.match(html, /homebase-safety\.js\?v=\d+/);
  assert.match(html, /HomeBaseSafety\?\.setIncidents\?\.\(HomeBasePublicData\.incidentsForLocation/);
  assert.match(copilot, /safety:\(\(\)=>\{try\{return window\.HomeBaseSafety\?\.context/);
  assert.match(copilot, /announce:text=>/);
});
