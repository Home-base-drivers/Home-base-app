// Public scoreboards (ESPN, MLB Stats API) observed on every refresh. Game end
// times come from observed live->final transitions, never from typical lengths.
import sports from '../dist/homebase-sports.js';
import { distanceKm } from './public-events.mjs';

const USER_AGENT = 'HomeBase public sports context (+https://github.com/Home-base-drivers/Home-base-app)';
const token = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const shared = new Map();

// Scoreboards are national, so one refresh fetches each URL once for every market.
function sharedJson(url, request) {
  const key = request === fetch ? url : null;
  if (key && shared.has(key)) return shared.get(key);
  const task = (async () => {
    const response = await request(url, { signal: AbortSignal.timeout(12_000), headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
    if (!response.ok) throw Error('Scoreboard unavailable');
    return response.json();
  })();
  if (key) { shared.set(key, task); task.catch(() => shared.delete(key)); }
  return task;
}

export function espnScoreboardUrls(dates) {
  const urls = [];
  for (const entry of sports.ESPN_LEAGUES) for (const date of dates) {
    const base = sports.espnUrl(entry, date);
    // College scoreboards default to featured games; request all of Division I.
    if (entry.league === 'mens-college-basketball' || entry.league === 'womens-college-basketball') urls.push({ entry, url: base + '&groups=50&limit=500' });
    else if (entry.league === 'college-football') { urls.push({ entry, url: base + '&groups=80&limit=300' }); urls.push({ entry, url: base + '&groups=81&limit=300' }); }
    else urls.push({ entry, url: base });
  }
  return urls;
}

// ESPN does not publish coordinates. Only configured venues with sourced
// coordinates, or an exact OpenStreetMap stadium/arena name, can be placed.
export function placeGame(game, market, places = []) {
  if (Number.isFinite(game.lat) && Number.isFinite(game.lon)) return game;
  const venue = token(game.venue), city = token(game.city);
  if (!venue) return null;
  const configured = (market.sportsVenues || []).find(v => venue.includes(token(v.match || v.name)) && (!v.city || !city || token(v.city) === city));
  if (configured) return { ...game, venue: game.venue || configured.name, lat: configured.lat, lon: configured.lon };
  const mapped = places.find(p => p.cat === 'event' && token(p.name) === venue && Number.isFinite(p.lat) && Number.isFinite(p.lon));
  return mapped ? { ...game, lat: mapped.lat, lon: mapped.lon } : null;
}

export async function publicSportsProvider(market, previous, now = Date.now(), request = fetch, places = []) {
  const clock = new Date(now);
  const espn = espnScoreboardUrls(sports.scoreboardDates(clock, market.timeZone));
  const mlb = sports.scoreboardDates(clock, market.timeZone, '-').map(date => sports.mlbUrl(date));
  let loaded = 0, failed = 0;
  const games = [];
  await Promise.all([
    ...espn.map(async ({ entry, url }) => {
      try { const data = await sharedJson(url, request); loaded++; for (const event of data?.events || []) games.push(sports.espnGame(event, entry, now)); }
      catch { failed++; }
    }),
    ...mlb.map(async url => {
      try { const data = await sharedJson(url, request); loaded++; for (const day of data?.dates || []) for (const game of day.games || []) games.push(sports.mlbGame(game, now)); }
      catch { failed++; }
    })
  ]);
  const placed = games.filter(Boolean).map(game => placeGame(game, market, places)).filter(game => game && distanceKm(market.center, game) <= market.radiusKm);
  const status = !loaded ? 'unavailable' : failed ? 'partial' : 'active';
  const priorRows = previous?.events || [];
  // If every scoreboard failed, keep only previously observed departure windows.
  const events = sports.trackAll(loaded ? placed : [], priorRows, now).map(row => ({
    ...row, eventType: 'SPORTS', classification: 'sports ' + row.league
  }));
  return { status, fetchedAt: clock.toISOString(), source: 'ESPN public scoreboards + MLB Stats API', scoreboards: loaded, failedScoreboards: failed, events };
}
