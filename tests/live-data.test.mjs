import test from 'node:test';
import assert from 'node:assert/strict';
import sports from '../dist/homebase-sports.js';
import weather from '../dist/homebase-weather.js';
import publicData from '../dist/homebase-public-data.js';
import policy from '../dist/homebase-route-policy.js';
import { publicSportsProvider, placeGame, espnScoreboardUrls } from '../scripts/public-sports.mjs';
import { publicAlertsProvider, alertPoints } from '../scripts/public-alerts.mjs';
import { validateSignals } from '../scripts/validate-signals.mjs';

const MIN = 60_000;
const nfl = sports.ESPN_LEAGUES.find(l => l.league === 'nfl');
const mls = sports.ESPN_LEAGUES.find(l => l.league === 'usa.1');
// Shape copied from the public ESPN scoreboard (date has no seconds).
function espnEvent({ id = '401', state = 'in', completed = false, name = 'STATUS_IN_PROGRESS', period = 2, clock = '7:12', venue = 'M&T Bank Stadium', city = 'Baltimore', date = '2026-10-11T17:00Z' } = {}) {
  return { id, date, shortName: 'CIN @ BAL', status: { displayClock: clock, period, type: { name, state, completed, description: '', detail: '', shortDetail: period + 'Q ' + clock } }, competitions: [{ venue: { fullName: venue, address: { city, state: 'MD' } }, status: { type: { state } } }] };
}
function mlbGame({ state = 'Live', detailed = 'In Progress', inning = 5 } = {}) {
  return { gamePk: 777, gameDate: '2026-10-11T23:05:00Z', status: { abstractGameState: state, detailedState: detailed }, teams: { away: { team: { name: 'Away' } }, home: { team: { name: 'Baltimore Orioles' } } }, venue: { name: 'Oriole Park at Camden Yards', location: { defaultCoordinates: { latitude: 39.2838, longitude: -76.6217 } } }, linescore: { currentInning: inning, inningState: 'Bottom' } };
}

test('ESPN scoreboards: live, closing, scheduled, final, and postponed games', () => {
  const t = Date.parse('2026-10-11T19:30:00Z');
  const live = sports.espnGame(espnEvent(), nfl, t);
  assert.equal(live.state, 'live'); assert.equal(live.closing, false); assert.equal(live.eventStart, '2026-10-11T17:00:00.000Z');
  assert.equal(sports.espnGame(espnEvent({ period: 4 }), nfl, t).closing, true, 'fourth quarter is the closing stretch');
  assert.equal(sports.espnGame(espnEvent({ period: 5 }), nfl, t).closing, true, 'overtime still closing');
  assert.equal(sports.espnGame(espnEvent({ period: 2, clock: "68'" }), mls, t).closing, false);
  assert.equal(sports.espnGame(espnEvent({ period: 2, clock: "81'" }), mls, t).closing, true);
  assert.equal(sports.espnGame(espnEvent({ state: 'pre', name: 'STATUS_SCHEDULED', period: 0 }), nfl, t).state, 'scheduled');
  assert.equal(sports.espnGame(espnEvent({ state: 'post', completed: true, name: 'STATUS_FINAL' }), nfl, t).state, 'final');
  assert.equal(sports.espnGame(espnEvent({ state: 'post', completed: false, name: 'STATUS_POSTPONED' }), nfl, t), null, 'postponed is not a game ending');
  assert.equal(sports.espnGame(espnEvent({ state: 'pre', name: 'STATUS_CANCELED' }), nfl, t), null);
  assert.equal(sports.espnGame({ id: 'x' }, nfl, t), null);
});

test('MLB scoreboard: coordinates required, eighth inning is closing, postponed rejected', () => {
  const t = Date.now();
  const game = sports.mlbGame(mlbGame({ inning: 8 }), t);
  assert.equal(game.state, 'live'); assert.equal(game.closing, true); assert.equal(game.lat, 39.2838);
  assert.equal(sports.mlbGame(mlbGame({ inning: 6 }), t).closing, false);
  assert.equal(sports.mlbGame(mlbGame({ state: 'Final', detailed: 'Postponed' }), t), null);
  const noCoords = mlbGame(); delete noCoords.venue.location;
  assert.equal(sports.mlbGame(noCoords, t), null);
});

test('a departure window exists only after a game is seen live and then final', () => {
  const t0 = Date.parse('2026-10-11T20:00:00Z'), t1 = t0 + 10 * MIN;
  const live = sports.trackGame(sports.espnGame(espnEvent({ period: 4 }), nfl, t0), null);
  assert.equal(live.eventEnd, null); assert.equal(live.lastLiveAt, new Date(t0).toISOString());
  const final = sports.trackGame(sports.espnGame(espnEvent({ state: 'post', completed: true, name: 'STATUS_FINAL' }), nfl, t1), live);
  assert.equal(final.eventEnd, new Date(t0 + 5 * MIN).toISOString(), 'midpoint of the observation interval');
  assert.equal(final.endObservedAfter, new Date(t0).toISOString()); assert.equal(final.endObservedBy, new Date(t1).toISOString());
  // Later observations keep the first bounded end rather than moving it.
  const later = sports.trackGame(sports.espnGame(espnEvent({ state: 'post', completed: true, name: 'STATUS_FINAL' }), nfl, t1 + 20 * MIN), final);
  assert.equal(later.eventEnd, final.eventEnd);
  // First seen already final: no invented end time.
  const unseen = sports.trackGame(sports.espnGame(espnEvent({ state: 'post', completed: true, name: 'STATUS_FINAL' }), nfl, t1), null);
  assert.equal(unseen.eventEnd, null);
  // Too long between observations: the end time is not bounded tightly enough.
  const gap = sports.trackGame(sports.espnGame(espnEvent({ state: 'post', completed: true, name: 'STATUS_FINAL' }), nfl, t0 + 90 * MIN), live);
  assert.equal(gap.eventEnd, null);
});

test('tracking keeps observed endings and recent live sightings through a scoreboard outage', () => {
  const t0 = Date.parse('2026-10-11T20:00:00Z');
  const live = sports.trackAll([sports.espnGame(espnEvent(), nfl, t0)], [], t0);
  assert.equal(live.length, 1);
  const outage = sports.trackAll([], live, t0 + 10 * MIN);
  assert.equal(outage.length, 1, 'recent live sighting retained');
  const final = sports.trackAll([sports.espnGame(espnEvent({ state: 'post', completed: true, name: 'STATUS_FINAL' }), nfl, t0 + 20 * MIN)], outage, t0 + 20 * MIN);
  assert.ok(final[0].eventEnd);
  assert.equal(sports.trackAll([], final, t0 + 40 * MIN).length, 1, 'departure window survives an outage');
  assert.equal(sports.trackAll([], final, t0 + 120 * MIN).length, 0, 'and expires an hour after the end');
});

test('scoreboard dates include yesterday only in the early morning', () => {
  assert.deepEqual(sports.scoreboardDates(new Date('2026-10-11T18:00:00Z'), 'America/New_York'), ['20261011']);
  assert.deepEqual(sports.scoreboardDates(new Date('2026-10-12T05:30:00Z'), 'America/New_York'), ['20261011', '20261012']);
  assert.deepEqual(sports.scoreboardDates(new Date('2026-10-11T18:00:00Z'), 'America/New_York', '-'), ['2026-10-11']);
});

test('merging observations keeps the freshest state and never drops an observed end', () => {
  const end = new Date('2026-10-11T20:05:00Z');
  const older = { name: 'g', eventEnd: end, eventState: 'Departure', tags: { observedAt: '2026-10-11T20:10:00Z', endObservedAfter: 'a', endObservedBy: 'b' } };
  const newer = { name: 'g', eventEnd: null, eventState: 'Departure', tags: { observedAt: '2026-10-11T20:14:00Z' } };
  const merged = sports.mergeObservations(older, newer);
  assert.equal(merged.eventEnd, end); assert.equal(merged.tags.observedAt, '2026-10-11T20:14:00Z'); assert.equal(merged.tags.endObservedBy, 'b');
});

test('route policy: closing phase near the observation and exit after an observed end', () => {
  const observed = new Date('2026-10-11T20:00:00Z');
  const game = { cat: 'event', eventStart: new Date('2026-10-11T17:00:00Z'), eventEnd: null, eventState: 'Live', tags: { liveEvent: true, gameClosing: true, observedAt: observed.toISOString() } };
  assert.equal(policy.eventPhase(game, new Date(observed.getTime() + 10 * MIN)), 'closing');
  assert.equal(policy.eventPhase(game, new Date(observed.getTime() + 60 * MIN)), null, 'a later forecast hour cannot reuse a closing cue');
  assert.equal(policy.eventPhase({ ...game, tags: { ...game.tags, gameClosing: false } }, observed), null);
  const ended = { ...game, eventEnd: new Date('2026-10-11T20:05:00Z'), eventState: 'Departure', tags: { liveEvent: true, observedAt: observed.toISOString() } };
  assert.equal(policy.eventPhase(ended, new Date('2026-10-11T20:20:00Z')), 'exit');
  assert.equal(policy.eventPhase(ended, new Date('2026-10-11T21:10:00Z')), null);
});

test('server sports provider places games, filters by market and tracks transitions across runs', async () => {
  const market = { id: 'baltimore', center: { lat: 39.2904, lon: -76.6122 }, radiusKm: 58, timeZone: 'America/New_York', sportsVenues: [{ name: 'M&T Bank Stadium', match: 'm t bank stadium', city: 'Baltimore', lat: 39.278, lon: -76.6227 }] };
  let state = 'in';
  const request = async url => ({ ok: true, json: async () => {
    if (String(url).includes('statsapi.mlb.com')) return { dates: [{ games: [mlbGame()] }] };
    if (String(url).includes('/football/nfl/')) return { events: [espnEvent(state === 'in' ? {} : { state: 'post', completed: true, name: 'STATUS_FINAL' }), espnEvent({ id: '999', venue: 'AT&T Stadium', city: 'Arlington' })] };
    return { events: [] };
  } });
  const t0 = Date.parse('2026-10-11T20:00:00Z');
  const first = await publicSportsProvider(market, null, t0, request);
  assert.equal(first.status, 'active');
  assert.deepEqual(first.events.map(e => e.venue).sort(), ['M&T Bank Stadium', 'Oriole Park at Camden Yards']);
  state = 'post';
  const second = await publicSportsProvider(market, first, t0 + 10 * MIN, request);
  const ravens = second.events.find(e => e.venue === 'M&T Bank Stadium');
  assert.equal(ravens.state, 'final'); assert.equal(ravens.eventEnd, new Date(t0 + 5 * MIN).toISOString());
  const failing = await publicSportsProvider(market, second, t0 + 20 * MIN, async () => ({ ok: false, status: 503 }));
  assert.equal(failing.status, 'unavailable'); assert.ok(failing.events.some(e => e.eventEnd), 'observed end kept through an outage');
});

test('ESPN venue placement needs a sourced venue or an exact mapped stadium name', () => {
  const market = { sportsVenues: [{ name: 'Xfinity Center', match: 'xfinity center', city: 'College Park', lat: 38.99528, lon: -76.94139 }] };
  assert.ok(placeGame({ venue: 'Xfinity Center', city: 'College Park' }, market));
  assert.equal(placeGame({ venue: 'Xfinity Center', city: 'Mansfield' }, market), null, 'same name in another city');
  assert.ok(placeGame({ venue: 'Big Stadium', city: '' }, {}, [{ cat: 'event', name: 'Big Stadium', lat: 1, lon: 2 }]));
  assert.equal(placeGame({ venue: 'Big Stadium Annex', city: '' }, {}, [{ cat: 'event', name: 'Big Stadium', lat: 1, lon: 2 }]), null);
  assert.ok(espnScoreboardUrls(['20261011']).some(u => /college-football.*groups=81/.test(u.url)));
});

// Shape from api.weather.gov/alerts/active (GeoJSON FeatureCollection).
function nwsFeature(props) { return { id: 'https://api.weather.gov/alerts/urn:x:' + props.event, properties: { '@id': 'https://api.weather.gov/alerts/urn:x:' + props.event, id: 'urn:x:' + props.event, status: 'Actual', messageType: 'Alert', severity: 'Moderate', urgency: 'Expected', headline: props.event + ' issued', areaDesc: 'Baltimore City', ...props } }; }

test('NWS alerts: actual, current alerts only; safety warnings are flagged', () => {
  const now = Date.parse('2026-12-15T12:00:00Z');
  const rows = weather.normalizeAlerts({ features: [
    nwsFeature({ event: 'Winter Weather Advisory', onset: '2026-12-15T06:00:00-05:00', ends: '2026-12-15T22:00:00-05:00' }),
    nwsFeature({ event: 'Tornado Warning', severity: 'Extreme', onset: '2026-12-15T08:00:00-05:00', expires: '2026-12-15T08:30:00-05:00' }),
    nwsFeature({ event: 'Flood Watch', status: 'Test', onset: '2026-12-15T06:00:00-05:00', ends: '2026-12-15T23:00:00-05:00' }),
    nwsFeature({ event: 'Wind Advisory', messageType: 'Cancel', onset: '2026-12-15T06:00:00-05:00', ends: '2026-12-15T23:00:00-05:00' }),
    nwsFeature({ event: 'Heat Advisory', onset: '2026-12-14T06:00:00-05:00', ends: '2026-12-14T23:00:00-05:00' })
  ] }, now);
  assert.deepEqual(rows.map(r => r.event), ['Tornado Warning', 'Winter Weather Advisory']);
  assert.equal(rows[0].safety, true); assert.equal(rows[1].kind, 'winter'); assert.equal(rows[1].safety, false);
  assert.equal(weather.activeAlerts(rows, now).map(r => r.event).join(), 'Winter Weather Advisory');
  assert.equal(weather.classifyAlert('Flash Flood Warning').safety, true);
  assert.equal(weather.classifyAlert('Flood Advisory').kind, 'flood');
});

test('weather boost: probability baseline unchanged, intensity, snow, alerts and extremes add to it', () => {
  const hour = (o = {}) => ({ time: 0, probability: 60, precipitationMm: 0.2, snowfallCm: 0, temperatureF: 55, ...o });
  assert.equal(weather.demandBoost('event', hour()).boost, 2.5, 'same as the original 50%+ rule');
  assert.equal(weather.demandBoost('event', hour({ probability: 80 })).boost, 4);
  assert.equal(weather.demandBoost('k12', hour({ probability: 90 })).boost, 0, 'categories outside weather-sensitive set are unaffected');
  assert.equal(weather.demandBoost('event', hour({ precipitationMm: 5 })).boost, 4);
  assert.equal(weather.demandBoost('event', hour({ precipitationMm: 1.5 })).boost, 3);
  assert.equal(weather.demandBoost('event', hour({ snowfallCm: 0.6 })).boost, 5);
  assert.equal(weather.demandBoost('event', hour({ probability: 10 }), [{ kind: 'winter', safety: false, event: 'Winter Storm Warning' }]).boost, 3);
  assert.equal(weather.demandBoost('event', hour({ probability: 10 }), [{ kind: 'storm', safety: true, event: 'Tornado Warning' }]).boost, 0, 'safety warnings never boost');
  assert.equal(weather.demandBoost('event', hour({ probability: 10, temperatureF: 14 })).boost, 1);
  assert.equal(weather.demandBoost('event', null, [], 40).boost, 1, 'no hourly row falls back to the current chance');
  assert.ok(weather.demandBoost('event', hour({ probability: 100, precipitationMm: 9, temperatureF: 10 })).boost <= 6);
  const rows = weather.hourlyRows({ hourly: { time: ['2026-12-15T12:00'], precipitation_probability: [70], precipitation: [2], snowfall: [0], temperature_2m: [-5] } }, 'celsius');
  assert.equal(rows[0].temperatureF, 23); assert.equal(rows[0].precipitationMm, 2);
});

test('server alert provider: US markets only, partial outages reported', async () => {
  const market = { countryCode: 'US', center: { lat: 39.29, lon: -76.61 }, sampleAreas: [{ lat: 39.29, lon: -76.62 }, { lat: 39.18, lon: -76.67 }] };
  assert.equal(alertPoints(market).length, 2, 'nearby points collapse');
  assert.equal((await publicAlertsProvider({ ...market, countryCode: 'GB' })).status, 'not_supported');
  let n = 0;
  const result = await publicAlertsProvider(market, Date.parse('2026-12-15T12:00:00Z'), async () => (n++ ? { ok: false, status: 500 } : { ok: true, json: async () => ({ features: [nwsFeature({ event: 'Winter Storm Warning', onset: '2026-12-15T06:00:00-05:00', ends: '2026-12-16T06:00:00-05:00' })] }) }));
  assert.equal(result.status, 'partial'); assert.equal(result.alerts[0].event, 'Winter Storm Warning');
});

test('the app prefers the newest snapshot and falls back to the bundled copy', async () => {
  const now = Date.parse('2026-10-11T20:00:00Z'), snap = (min, extra = {}) => ({ generatedAt: new Date(now - min * MIN).toISOString(), markets: [], ...extra });
  assert.equal(publicData.newestSnapshot([snap(60, { id: 'pages' }), snap(8, { id: 'live' })], now).id, 'live');
  assert.equal(publicData.newestSnapshot([snap(60, { id: 'pages' }), { generatedAt: 'bad', markets: [] }, null], now).id, 'pages');
  assert.equal(publicData.newestSnapshot([snap(-60, { id: 'future' }), snap(30, { id: 'ok' })], now).id, 'ok', 'clock-skewed future files are ignored');
  const urls = [];
  const loaded = await publicData.loadSnapshot(async url => { urls.push(url); if (url.startsWith('https://raw.githubusercontent.com/')) throw Error('offline'); return snap(50, { id: 'bundled' }); }, now);
  assert.equal(loaded.id, 'bundled'); assert.ok(urls[0].startsWith(publicData.LIVE_SIGNALS_URL));
  await assert.rejects(publicData.loadSnapshot(async () => { throw Error('offline'); }, now));
});

test('hosted sports rows and alerts reach a driver in the market; stale scoreboards do not', () => {
  const now = Date.parse('2026-10-11T20:30:00Z');
  const row = { id: 'espn:nfl:401', name: 'CIN @ BAL', league: 'NFL', venue: 'M&T Bank Stadium', lat: 39.278, lon: -76.6227, eventStart: '2026-10-11T17:00:00.000Z', eventEnd: '2026-10-11T20:05:00.000Z', state: 'final', eventType: 'SPORTS', classification: 'sports NFL' };
  const payload = fetched => ({ generatedAt: new Date(now).toISOString(), markets: [{ id: 'baltimore', center: { lat: 39.2904, lon: -76.6122 }, radiusKm: 58,
    publicSports: { status: 'active', fetchedAt: new Date(fetched).toISOString(), events: [row] },
    weatherAlerts: { status: 'active', fetchedAt: new Date(fetched).toISOString(), alerts: [{ id: 'a', event: 'Wind Advisory', onset: '2026-10-11T12:00:00Z', ends: '2026-10-11T23:00:00Z' }] } }] });
  assert.equal(publicData.eventsForLocation(payload(now - 5 * MIN), 39.29, -76.61, now).length, 1);
  assert.equal(publicData.eventsForLocation(payload(now - 60 * MIN), 39.29, -76.61, now).length, 0);
  assert.equal(publicData.alertsForLocation(payload(now - 5 * MIN), 39.29, -76.61, now).length, 1);
  assert.equal(publicData.alertsForLocation(payload(now - 5 * MIN), 40.7, -74, now).length, 0, 'outside the market');
});

test('snapshot validation blocks leaked credentials, stale files and malformed events', () => {
  const now = Date.parse('2026-10-11T20:00:00Z'), good = { generatedAt: new Date(now).toISOString(), markets: [{ id: 'baltimore', center: { lat: 39.29, lon: -76.61 }, publicSports: { events: [{ lat: 39.27, lon: -76.62, eventStart: '2026-10-11T17:00:00Z' }] } }] };
  assert.equal(validateSignals(JSON.stringify(good), {}, now).markets, 1);
  assert.throws(() => validateSignals(JSON.stringify({ ...good, note: 'key-abcdef123' }), { TICKETMASTER_API_KEY: 'key-abcdef123' }, now), /TICKETMASTER/);
  assert.throws(() => validateSignals(JSON.stringify(good), {}, now + 60 * MIN), /not current/);
  assert.throws(() => validateSignals(JSON.stringify({ ...good, markets: [{ ...good.markets[0], publicSports: { events: [{ eventStart: 'x' }] } }] }), {}, now), /Event without/);
});
