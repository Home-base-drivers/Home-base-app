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
  assert.ok(per < 2, `${per.toFixed(2)} ms per lookup`);
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
