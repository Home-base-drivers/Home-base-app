import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { resolveSiteCoordinates } from '../scripts/geocode-sites.mjs';
const policy = createRequire(import.meta.url)('../dist/homebase-route-policy.js');
const config = JSON.parse(fs.readFileSync(new URL('../config/employer-sites.json', import.meta.url), 'utf8'));

test('the Baltimore Amazon list covers fulfillment, sortation, delivery and air sites with sources', () => {
  const amazon = config.sites.filter(s => s.operator === 'Amazon');
  assert.ok(amazon.length >= 20);
  for (const kind of ['fulfillment_center', 'sortation_center', 'delivery_station', 'air_hub']) assert.ok(amazon.some(s => s.kind === kind && s.status === 'open'), kind);
  for (const s of amazon) { assert.match(s.sourceUrl, /^https:\/\//); assert.ok(['open', 'unverified', 'closed'].includes(s.status)); assert.ok(s.address || s.lat == null); }
  assert.deepEqual(config.amazonShiftTimes, policy.AMAZON_SHIFTS);
  assert.equal(new Set(config.sites.map(s => s.id)).size, config.sites.length);
  assert.equal(config.sites.find(s => s.id === 'amazon-preston-gateway').status, 'open');
  assert.equal(config.sites.find(s => s.id === 'amazon-new-ridge-closed').status, 'closed');
});

test('sites listed by address are geocoded once, then reused from the previous snapshot', async () => {
  const calls = [];
  const request = async url => { calls.push(String(url)); return { ok: true, json: async () => ({ result: { addressMatches: [{ matchedAddress: '913 OLD PHILADELPHIA RD, ABERDEEN, MD, 21001', coordinates: { x: -76.18, y: 39.49 } }] } }) }; };
  const sites = [{ id: 'a', address: '913 Old Philadelphia Rd, Aberdeen, MD 21001', lat: null, lon: null }, { id: 'b', lat: 39.2, lon: -76.5 }, { id: 'c', address: null, lat: null, lon: null }];
  const first = await resolveSiteCoordinates(sites, {}, request);
  assert.equal(first[0].lat, 39.49); assert.equal(calls.length, 1); assert.equal(first[2].lat, null);
  assert.match(calls[0], /geocoding\.geo\.census\.gov/);
  const again = await resolveSiteCoordinates(sites, { markets: [{ employerSites: { sites: first } }] }, request);
  assert.equal(again[0].lon, -76.18); assert.equal(calls.length, 1);
  const failed = await resolveSiteCoordinates(sites, {}, async () => ({ ok: false }));
  assert.equal(failed[0].lat, null);
});

test('Amazon sites are shift-change route stops; unconfirmed ones rank lower', () => {
  const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  const start = html.indexOf('function applySiteStatus('), body = html.indexOf('{', start); let depth = 0, end = body;
  for (; end < html.length; end++) { if (html[end] === '{') depth++; else if (html[end] === '}' && !--depth) break; }
  const dist = (a, b) => { const r = Math.PI / 180, x = (b[1] - a[1]) * r * Math.cos((a[0] + b[0]) * r / 2), y = (b[0] - a[0]) * r; return Math.sqrt(x * x + y * y) * 6371; };
  const ctx = { HomeBaseRoutePolicy: policy, distanceKm: dist, employerSites: [
    { id: 'open', name: 'Amazon sort center (Aberdeen)', operator: 'Amazon', kind: 'sortation_center', status: 'open', lat: 39.49, lon: -76.18 },
    { id: 'maybe', name: 'Amazon site (Lakeside)', operator: 'Amazon', kind: 'delivery_station', status: 'unverified', lat: 39.42, lon: -76.30 },
    { id: 'nocoords', name: 'Amazon Air hub', operator: 'Amazon', kind: 'air_hub', status: 'open', lat: null, lon: null }] };
  vm.createContext(ctx); vm.runInContext(html.slice(start, end + 1), ctx);
  const out = ctx.applySiteStatus([]);
  assert.equal(out.length, 2);
  const parts = { day: 2, hour: 7 }, when = new Date('2026-10-27T11:00:00Z');
  const open = out.find(s => /Aberdeen/.test(s.name)), maybe = out.find(s => /Lakeside/.test(s.name));
  assert.equal(policy.generalEvidence(open, parts, when)?.kind, 'shift');
  assert.deepEqual(policy.generalEvidence(maybe, parts, when), { kind: 'shift', amazon: true, unconfirmed: true });
  assert.equal(policy.generalEvidence(maybe, { day: 2, hour: 10 }, when), null, 'only at shift changes');
  assert.ok(policy.workerWeight(maybe, parts) > 0 && policy.workerWeight(maybe, parts) < policy.workerWeight(open, parts));
});

test('an Amazon shift change stays on the route when events are also available', () => {
  const ranked = [
    { name: 'Amazon BWI2', routeBasis: 'general_area', amazonShift: true, routeDemand: 8, score: 28 },
    { name: 'Concert', routeBasis: 'verified_event', routeDemand: 6, score: 34 },
    { name: 'Quiet park', routeBasis: 'general_area', routeDemand: 7, score: 7 },
    { name: 'Surge now', routeBasis: 'live_signal', routeDemand: 5, score: 23 }];
  assert.deepEqual(policy.selectRanked(ranked).map(s => s.name), ['Amazon BWI2', 'Concert', 'Surge now']);
  const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.match(html, /Amazon shift change · long rides home/);
  assert.match(html, /score:demand\+\(amazon&&demand>0\?\(v\.routeEvidence\.unconfirmed\?10:20\):0\)/);
});
