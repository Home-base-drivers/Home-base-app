import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const policy = require('../dist/homebase-route-policy.js');
const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
globalThis.HomeBaseRoutePolicy = policy;
globalThis.marketParts = d => { const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(d), g = t => p.find(x => x.type === t).value; return { day: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(g('weekday')), hour: Number(g('hour')) % 24 }; };
const heat = require('../dist/homebase-heat.js');

test('a school with published bells draws as confirmed demand in its windows, thick and wide', () => {
  const school = { name: 'Cecil Elementary School', cat: 'k12', lat: 39.3131, lon: -76.6053, schoolStart: '07:30', schoolEnd: '14:10', tags: { bellSource: 'https://www.baltimorecityschools.org/page/7' } };
  const pickup = new Date('2026-10-27T14:15:00-04:00'), dropoff = new Date('2026-10-27T07:05:00-04:00'), midday = new Date('2026-10-27T11:00:00-04:00');
  assert.ok(heat.scheduledWindow(school, pickup) > .5);
  assert.ok(heat.scheduledWindow(school, dropoff) > 0);
  assert.equal(heat.scheduledWindow(school, midday), 0);
  assert.equal(heat.currentEvidence(school, pickup), 'event');
  assert.equal(heat.currentEvidence(school, midday), 'modeled');
  assert.ok(heat.displayFootprintKm(school, 'event', pickup) >= .7, 'spills onto the pickup streets');
  const routine = { name: 'Some School', cat: 'k12', lat: 39.3, lon: -76.6, tags: {} };
  assert.equal(heat.scheduledWindow(routine, pickup), 0, 'unconfirmed schools stay faint');
});

test('Amazon shift changes draw as confirmed demand too', () => {
  const amazon = { name: 'Amazon BWI2', cat: 'warehouse', lat: 39.269, lon: -76.543, tags: { operator: 'Amazon', industrial: 'warehouse', employerSite: true } };
  assert.ok(heat.scheduledWindow(amazon, new Date('2026-10-27T15:00:00-04:00')) > .9);
  assert.equal(heat.scheduledWindow(amazon, new Date('2026-10-27T12:00:00-04:00')), 0);
});

test('every school with published bells is on the map, even when no mapped school matched it', () => {
  const ctx = { HomeBaseRoutePolicy: policy, HomeBasePublicData: require('../dist/homebase-public-data.js'),
    schoolBellTimes: [{ name: 'Cecil Elementary School', url: 'u1', lat: 39.3131, lon: -76.6053, levels: { all: { open: '07:30', close: '14:10' } } },
      { name: 'Mergenthaler High School', url: 'u2', lat: 39.3356, lon: -76.5887, levels: { high: { open: '07:45', close: '14:35' } } }] };
  vm.createContext(ctx);
  const start = html.indexOf('function applyBellTimes('), body = html.indexOf('{', start); let depth = 0, end = body;
  for (; end < html.length; end++) { if (html[end] === '{') depth++; else if (html[end] === '}' && !--depth) break; }
  vm.runInContext(html.slice(start, end + 1), ctx);
  const out = ctx.applyBellTimes([{ name: 'Mergenthaler Vocational Technical High School', cat: 'school', lat: 39.3357, lon: -76.5886, tags: {} }]);
  assert.equal(out.length, 2);
  assert.equal(out[0].schoolEnd, '14:35');
  assert.equal(out[1].name, 'Cecil Elementary School'); assert.equal(out[1].schoolEnd, '14:10'); assert.equal(out[1].tags.bellSource, 'u1');
});
