import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import policy from '../dist/homebase-route-policy.js';
const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
function extract(name) { const m = html.match(new RegExp('function ' + name + '\\(')); assert.ok(m, name); const start = m.index, body = html.indexOf('{', start); let d = 0; for (let i = body; i < html.length; i++) { if (html[i] === '{') d++; else if (html[i] === '}' && !--d) return html.slice(start, i + 1); } }
const DEV_WORDS = /modeled|unconfirmed|unverified|proxy|fallback|coverage|excluded from|not a trip|ride requests|not assumed/i;
function ctx(dev) {
  const c = { HB_DEV: dev, HomeBaseRoutePolicy: policy, marketTime: d => new Date(d).toISOString().slice(11, 16), marketParts: d => ({ day: 3, hour: new Date(d).getUTCHours() }), rainDemandBoost: () => 0 };
  c.globalThis = c; vm.createContext(c);
  vm.runInContext([extract('clockLabel'), extract('driverEvidence'), extract('driverRouteLabel')].join('\n'), c); return c;
}
const when = new Date('2026-10-09T19:30:00Z');
const samples = [
  { name: 'Ravens game · M&T Bank Stadium · 8:15 PM', venue: 'M&T Bank Stadium', cat: 'event', eventStart: new Date('2026-10-09T20:15:00Z'), routeBasis: 'verified_event', routeEventPhase: 'arrival', when },
  { name: 'Uber pricing · Fells Point', cat: 'neighborhood', tags: { uberSurgeMultiplier: 1.6, providerSignal: true }, routeBasis: 'live_signal', when },
  { name: 'Mergenthaler', cat: 'k12', schoolEnd: '14:35', routeBasis: 'general_area', when: new Date('2026-10-09T14:30:00Z') },
  { name: 'Power Plant Live', cat: 'nightlife', routeBasis: 'general_area', stagingFor: 'Ravens game · M&T', when },
  { name: 'Amazon fulfillment center', cat: 'warehouse', tags: { industrial: 'warehouse' }, routeBasis: 'general_area', when },
];
test('drivers see plain reasons, never data-provenance notes', () => {
  const c = ctx(false);
  for (const s of samples) {
    const label = c.driverRouteLabel(s), why = c.driverEvidence(s, s.when);
    assert.ok(!DEV_WORDS.test(label), label); assert.ok(!DEV_WORDS.test(why), why);
  }
  assert.equal(c.driverRouteLabel(samples[2]), 'School pickup · lets out 2:35 PM');
  assert.match(c.driverRouteLabel(samples[3]), /^Get in place for Ravens game/);
  assert.match(c.driverEvidence(samples[1], when), /Surge pricing here right now \(1\.6×\)/);
});
test('developer notes stay in the app source behind the dev switch', () => {
  assert.ok(html.includes("searchParams") || html.includes("get('dev')"));
  assert.ok(html.includes('time unconfirmed; excluded from hourly heat'), 'detail still available with ?dev=1');
  assert.ok(html.includes("No big events nearby right now"));
});
