// Area source list: every demand source Home Base checks for each market.
//
//   node scripts/area-sources.mjs
//       Rewrites config/area-sources.csv (the master list) from the market,
//       employer-site and surge-history configuration. A test fails if the
//       committed file falls out of step, so new sources are always merged in.
//
//   node scripts/area-sources.mjs --status <provider-signals.json> <out.csv>
//       Same rows plus live status, item count and check time from a refresh
//       snapshot. The live refresh publishes this next to provider-signals.json.
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const ROOT = new URL('../', import.meta.url);
const require = createRequire(import.meta.url);
const COLUMNS = ['market_id', 'market_name', 'source_type', 'source_name', 'url', 'needs_key', 'lat', 'lon', 'status', 'items', 'checked_at', 'note'];

function km(a, b) {
  const r = n => n * Math.PI / 180, h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 12742 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
const cell = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = rows => [COLUMNS.join(','), ...rows.map(r => COLUMNS.map(c => cell(r[c])).join(','))].join('\n') + '\n';

function surgeHistoryCount(market) {
  try {
    const history = require('../dist/homebase-demand-history.js');
    return history.observationRows().filter(row => Number.isFinite(row.lat) && Number.isFinite(row.lon) && km(market.center, row) <= market.radiusKm).length;
  } catch { return 0; }
}

// One row per source. `snapshot` (optional) fills status columns.
export function areaSourceRows(config, sites, snapshot = null) {
  const rows = [];
  for (const market of config.markets) {
    const live = snapshot?.markets?.find(m => m.id === market.id) || null;
    const base = { market_id: market.id, market_name: market.name };
    const add = (row, status = {}) => rows.push({ ...base, needs_key: 'no', lat: '', lon: '', status: '', items: '', checked_at: '', note: '', ...row, ...(snapshot ? status : {}) });
    const feed = (f, items) => f ? { status: f.status || f.calendarStatus || 'unknown', items, checked_at: f.fetchedAt || '' } : { status: 'missing' };

    for (const cal of market.publicCalendars || []) {
      const s = live?.publicRecords?.sources?.find(x => x.name === cal.name);
      add({ source_type: 'event_calendar', source_name: cal.name, url: cal.url, lat: (cal.venue || cal.venues?.[0])?.lat ?? '', lon: (cal.venue || cal.venues?.[0])?.lon ?? '' },
        s ? { status: s.status, items: s.eventCount ?? '', checked_at: s.fetchedAt || '', note: s.reason || '' } : { status: 'not_reported' });
    }
    const sports = live?.publicSports;
    for (const v of market.sportsVenues || []) {
      const games = (sports?.events || []).filter(e => Number.isFinite(e.lat) && km(v, e) < .5).length;
      add({ source_type: 'sports_venue', source_name: v.name, url: 'ESPN public scoreboards + MLB Stats API', lat: v.lat, lon: v.lon }, feed(sports, games));
    }
    add({ source_type: 'sports_scoreboards', source_name: 'ESPN + MLB scoreboards (games seen)', url: 'https://site.api.espn.com/apis/site/v2/sports/' }, feed(sports, sports?.gamesSeen ?? ''));
    for (const site of sites.filter(s => km(market.center, s) <= market.radiusKm))
      add({ source_type: `shift_site_${site.kind}`, source_name: site.name, url: site.shiftSource || site.hoursSource || site.sourceUrl || '', lat: site.lat, lon: site.lon }, { status: site.status || 'open', items: 1, checked_at: '' });
    if (market.bellTimes || live?.schoolBells) add({ source_type: 'school_bells', source_name: 'Published school bell times', url: market.bellTimes?.url || 'config/school-calendar-sources.json' }, feed(live?.schoolBells, live?.schoolBells?.schools?.length ?? ''));
    add({ source_type: 'places', source_name: 'Public places baseline (GeoNames/OSM)', url: 'config/public-place-baseline.json' }, feed(live?.publicPlaces, live?.publicPlaces?.places?.length ?? ''));
    add({ source_type: 'places_live', source_name: 'OpenStreetMap Overpass (queried on the phone)', url: 'https://overpass-api.de/api/interpreter' }, { status: 'on_device' });
    add({ source_type: 'weather_alerts', source_name: 'National Weather Service alerts', url: 'https://api.weather.gov/alerts/active' }, feed(live?.weatherAlerts, live?.weatherAlerts?.alerts ?? ''));
    add({ source_type: 'weather_forecast', source_name: 'Open-Meteo hourly forecast (queried on the phone)', url: 'https://api.open-meteo.com/v1/forecast' }, { status: 'on_device' });
    add({ source_type: 'surge_history', source_name: 'Screenshot-derived Uber/Empower surge history', url: 'dist/homebase-demand-history.js' }, { status: 'stored', items: surgeHistoryCount(market) });
    for (const [key, name, url] of [['ticketmaster', 'Ticketmaster Discovery API', 'https://developer.ticketmaster.com/'], ['uber', 'Uber price estimates', 'https://developer.uber.com/'], ['flightaware', 'FlightAware AeroAPI', 'https://www.flightaware.com/aeroapi/'], ['booking', 'Booking.com availability', 'https://developers.booking.com/']]) {
      const f = live?.[key];
      add({ source_type: `provider_${key}`, source_name: name, url, needs_key: 'yes' }, f ? { status: f.status, items: Array.isArray(f.events) ? f.events.length : (f.events ?? f.samples ?? ''), checked_at: f.fetchedAt || '' } : { status: 'missing' });
    }
  }
  return rows;
}

export async function loadConfig() {
  const config = JSON.parse(await readFile(new URL('config/provider-markets.json', ROOT), 'utf8'));
  const sites = JSON.parse(await readFile(new URL('config/employer-sites.json', ROOT), 'utf8')).sites;
  return { config, sites };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { config, sites } = await loadConfig();
  const i = process.argv.indexOf('--status');
  if (i > 0) {
    const snapshot = JSON.parse(await readFile(process.argv[i + 1], 'utf8'));
    await writeFile(process.argv[i + 2], toCsv(areaSourceRows(config, sites, snapshot)));
  } else {
    await writeFile(new URL('config/area-sources.csv', ROOT), toCsv(areaSourceRows(config, sites)));
  }
}
