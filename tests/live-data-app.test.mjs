import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sports from '../dist/homebase-sports.js';
import weather from '../dist/homebase-weather.js';
import publicData from '../dist/homebase-public-data.js';
import policy from '../dist/homebase-route-policy.js';

const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
function extract(name) { const match = html.match(new RegExp('(?:async )?function ' + name + '\\(')); assert.ok(match, name); const start = match.index, body = html.indexOf('{', start); let depth = 0; for (let i = body; i < html.length; i++) { if (html[i] === '{') depth++; else if (html[i] === '}' && !--depth) return html.slice(start, i + 1); } throw Error(name); }
const MIN = 60_000;

function storage() { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)) }; }

test('app scoreboard loader places nearby games, tracks endings and re-polls only active leagues', async () => {
  let nflState = 'in', calls = [];
  const espn = state => ({ events: [{ id: '401', date: new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 16) + 'Z', shortName: 'CIN @ BAL', status: { period: 4, displayClock: '2:00', type: { state, completed: state === 'post', name: state === 'post' ? 'STATUS_FINAL' : 'STATUS_IN_PROGRESS', shortDetail: '4Q 2:00' } }, competitions: [{ venue: { fullName: 'M&T Bank Stadium', address: { city: 'Baltimore' } } }] }] });
  const ctx = { Date, Number, Math, JSON, Set, Map, Promise, Error, HomeBaseSports: sports, HomeBaseRoutePolicy: policy, localStorage: storage(), marketTimeZone: 'America/New_York', currentEventData: [],
    fetchJSON: async url => { calls.push(url); if (url.includes('/football/nfl/')) return espn(nflState); if (url.includes('statsapi')) return { dates: [] }; return { events: [] }; },
    eventToken: v => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), findEventVenue: () => null,
    knownBaltimoreVenue: name => /m.t bank stadium/i.test(name) ? { lat: 39.278, lon: -76.6227, name: 'M&T Bank Stadium' } : null,
    isGreaterBaltimoreLocation: () => true, distanceKm: () => 1, marketTime: d => d.toISOString() };
  vm.createContext(ctx);
  vm.runInContext(['gameObservations', 'trackObservedGames', 'scoreboardKey', 'fetchScoreboardGames', 'scoreboardGames', 'scoreboardEvent', 'activeScoreboardKeys', 'loadScoreboardEvents'].map(extract).join('\n') + '\nlet scoreboardRequest=null,scoreboardRequestAt=0,scoreboardRequestKeys="";', ctx);
  const live = await ctx.loadScoreboardEvents(39.29, -76.61, 'Baltimore', []);
  assert.equal(live.length, 1); assert.equal(live[0].tags.gameClosing, true); assert.equal(live[0].tags.scoreboardKey, 'nfl'); assert.equal(live[0].eventEnd, null);
  assert.equal(policy.eventPhase(live[0], new Date()), 'closing');
  ctx.currentEventData = live;
  assert.deepEqual(Array.from(ctx.activeScoreboardKeys()), ['nfl']);
  // Ten minutes later the game is final; only the NFL board is requested.
  const store = JSON.parse(ctx.localStorage.getItem('homeBaseGameObservations'));
  store[0].observedAt = store[0].lastLiveAt = new Date(Date.now() - 10 * MIN).toISOString();
  ctx.localStorage.setItem('homeBaseGameObservations', JSON.stringify(store));
  nflState = 'post'; calls = [];
  const final = await ctx.loadScoreboardEvents(39.29, -76.61, 'Baltimore', [], ['nfl']);
  assert.ok(calls.length >= 1 && calls.every(u => u.includes('/football/nfl/')));
  assert.equal(final[0].eventState, 'Departure'); assert.ok(final[0].eventEnd instanceof Date);
  assert.ok(Math.abs(final[0].eventEnd.getTime() - (Date.now() - 5 * MIN)) < 2000, 'end is the midpoint of the observation window');
  assert.equal(policy.eventPhase(final[0], new Date()), 'exit');
});

test('app weather inputs use hourly intensity and active NWS alerts, with the event multiplier kept', () => {
  const now = Date.now();
  const ctx = { Date, HomeBaseWeather: weather, hourlyRainForecast: [{ time: now, probability: 80, precipitationMm: 6, snowfallCm: 0, temperatureF: 50 }], activeWeatherAlerts: [], currentRainChance: 80 };
  vm.createContext(ctx); vm.runInContext(extract('weatherInputs') + '\n' + extract('rainDemandBoost'), ctx);
  assert.equal(ctx.rainDemandBoost({ cat: 'nightlife' }, new Date(now)), 5.5);
  assert.equal(ctx.rainDemandBoost({ cat: 'event', eventStart: new Date(now) }, new Date(now)), 5.5 * 1.35);
  assert.equal(ctx.rainDemandBoost({ cat: 'warehouse' }, new Date(now)), 0);
  assert.match(ctx.weatherInputs({ cat: 'transit' }, new Date(now)).reasons.join(), /heavy rain/);
});

test('weather card shows the active NWS alert and flags safety warnings', () => {
  const nodes = { '#weatherTitle': { textContent: '' }, '#weatherText': { textContent: '' } }, now = Date.now();
  const ctx = { Date, HomeBaseWeather: weather, $: id => nodes[id], marketTime: () => '9:00 PM', baseWeatherText: 'Rain chance 20% · normal demand effect',
    activeWeatherAlerts: [{ event: 'Flash Flood Warning', safety: true, onset: new Date(now - MIN).toISOString(), ends: new Date(now + 60 * MIN).toISOString() }] };
  vm.createContext(ctx); vm.runInContext(extract('renderWeatherAlert'), ctx); ctx.renderWeatherAlert();
  assert.equal(nodes['#weatherTitle'].textContent, 'NWS · FLASH FLOOD WARNING');
  assert.match(nodes['#weatherText'].textContent, /^Safety warning/);
  ctx.activeWeatherAlerts = []; ctx.renderWeatherAlert();
  assert.equal(nodes['#weatherTitle'].textContent, 'LOCAL CONDITIONS'); assert.equal(nodes['#weatherText'].textContent, ctx.baseWeatherText);
});

test('the live snapshot loader is used for demand data and bonus markers', () => {
  assert.match(extract('getPublicSnapshot'), /HomeBasePublicData\.loadSnapshot/);
  assert.match(extract('refreshLiveBonuses'), /getPublicSnapshot\(\)/);
  assert.match(html, /<script src="homebase-sports\.js\?v=\d+"><\/script>/);
  assert.match(html, /<script src="homebase-weather\.js\?v=\d+"><\/script>/);
  assert.ok(publicData.LIVE_SIGNALS_URL.endsWith('/signals/provider-signals.json'));
});
