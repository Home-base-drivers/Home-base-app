import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { publicRecords } from './public-records.mjs';
import { publicPlaces } from './public-places.mjs';
import { publicSportsProvider } from './public-sports.mjs';
import { publicAlertsProvider } from './public-alerts.mjs';
import publicData from '../dist/homebase-public-data.js';

const ROOT = new URL('../', import.meta.url);
const CONFIG_URL = new URL('config/provider-markets.json', ROOT);
const OUTPUT_URL = new URL('dist/provider-signals.json', ROOT);
const NOW = new Date();
const TIMEOUT_MS = 12_000;
export const LIVE_SIGNALS_URL = publicData.LIVE_SIGNALS_URL;

function boundedFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function safeStatus(error) {
  const status = Number(error?.status || 0);
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'provider_unavailable';
  return 'request_failed';
}

async function readJson(response) {
  if (!response.ok) {
    const error = new Error('provider request failed');
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export function haversineKm(a, b) {
  const radians = (value) => value * Math.PI / 180;
  const dLat = radians(b.lat - a.lat), dLon = radians(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function normalizeTicketmasterEvent(event, now = NOW) {
  // A postponed/canceled listing or TBA time is not a current route signal.
  if (/^(canceled|cancelled|postponed)$/i.test(event?.dates?.status?.code || '') || event?.dates?.start?.dateTBD || event?.dates?.start?.dateTBA || event?.dates?.start?.timeTBA) return null;
  const venue = event?._embedded?.venues?.[0];
  const lat = Number(venue?.location?.latitude), lon = Number(venue?.location?.longitude);
  const start = event?.dates?.start?.dateTime;
  if (venue?.location?.latitude == null || venue?.location?.longitude == null || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || !start || !Number.isFinite(Date.parse(start))) return null;
  const startMs = Date.parse(start);
  const end = event?.dates?.end?.dateTime || null;
  if (startMs < now.getTime() - 6 * 60 * 60_000 || startMs > now.getTime() + 36 * 60 * 60_000) return null;
  const name = String(event?.name || '').trim();
  if (!name || publicData.isTicketAddon(name)) return null;
  return {
    id: String(event.id || `${name}:${start}`),
    name,
    venue: String(venue.name || ''),
    lat,
    lon,
    eventStart: new Date(start).toISOString(),
    eventEnd: end && Number.isFinite(Date.parse(end)) ? new Date(end).toISOString() : null,
    url: typeof event.url === 'string' ? event.url : null,
    source: 'Ticketmaster Discovery API',
    classification: (event.classifications || []).flatMap(c => [c.segment?.name, c.genre?.name, c.subGenre?.name]).filter(Boolean).join(' '),
    eventType: event.type || '',
    genre: (event.classifications || []).map(c => c.genre?.name).filter(Boolean).join(' ')
  };
}

export function normalizeUberSurge(origin, estimates) {
  const values = (estimates?.prices || [])
    .map((item) => Number(item.surge_multiplier))
    .filter((value) => Number.isFinite(value) && value >= 1 && value <= 5)
    .sort((a, b) => a - b);
  if (!values.length) return null;
  const median = values.length % 2
    ? values[(values.length - 1) / 2]
    : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
  return {
    name: origin.name,
    lat: origin.lat,
    lon: origin.lon,
    surgeMultiplier: Number(median.toFixed(2)),
    productCount: values.length,
    sampledAt: NOW.toISOString()
  };
}

async function uberToken() {
  if (process.env.UBER_ACCESS_TOKEN) return process.env.UBER_ACCESS_TOKEN;
  const { UBER_CLIENT_ID, UBER_CLIENT_SECRET, UBER_ESTIMATES_SCOPE } = process.env;
  if (!UBER_CLIENT_ID || !UBER_CLIENT_SECRET || !UBER_ESTIMATES_SCOPE) return null;
  const body = new URLSearchParams({
    client_id: UBER_CLIENT_ID,
    client_secret: UBER_CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: UBER_ESTIMATES_SCOPE
  });
  const data = await readJson(await boundedFetch('https://auth.uber.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body
  }));
  return data.access_token || null;
}

async function uberProvider(market) {
  if (!market.sampleAreas?.length || !market.uberDestinations?.length) return { status: 'not_supported', fetchedAt: null, samples: [] };
  let token;
  try { token = await uberToken(); } catch (error) { return { status: safeStatus(error), fetchedAt: NOW.toISOString(), samples: [] }; }
  if (!token) return { status: 'not_configured', fetchedAt: null, samples: [] };
  const samples = [];
  let failures = 0;
  for (const origin of market.sampleAreas) {
    const estimates = [];
    for (const destination of market.uberDestinations) {
      if (haversineKm(origin, destination) < 1) continue;
      const url = new URL('https://api.uber.com/v1.2/estimates/price');
      url.search = new URLSearchParams({
        start_latitude: String(origin.lat), start_longitude: String(origin.lon),
        end_latitude: String(destination.lat), end_longitude: String(destination.lon)
      });
      try {
        estimates.push(await readJson(await boundedFetch(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
        })));
      } catch { failures++; }
    }
    const normalized = estimates.map((value) => normalizeUberSurge(origin, value)).filter(Boolean);
    if (normalized.length) {
      const sorted = normalized.map((value) => value.surgeMultiplier).sort((a, b) => a - b);
      const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[0] + sorted[1]) / 2;
      samples.push({ ...normalized[0], surgeMultiplier: Number(median.toFixed(2)), sampleCount: normalized.length });
    }
  }
  return { status: failures && !samples.length ? 'provider_unavailable' : 'active', fetchedAt: NOW.toISOString(), samples };
}

export async function ticketmasterProvider(market, request = boundedFetch, now = NOW) {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key) return { status: 'not_configured', fetchedAt: null, events: [] };
  const url = new URL('https://app.ticketmaster.com/discovery/v2/events.json');
  const start = new Date(now.getTime() - 6 * 60 * 60_000), end = new Date(now.getTime() + 36 * 60 * 60_000);
  url.search = new URLSearchParams({
    apikey: key,
    latlong: `${market.center.lat},${market.center.lon}`,
    radius: String(Math.min(50, Math.ceil(market.radiusKm * 0.62))),
    unit: 'miles',
    startDateTime: start.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    endDateTime: end.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    sort: 'date,asc', size: '200',
    ...(market.countryCode ? { countryCode: market.countryCode } : {})
  });
  try {
    const events = []; let pages = 0, totalPages = 1;
    do {
      url.searchParams.set('page', String(pages));
      const data = await readJson(await request(url, { headers: { Accept: 'application/json' } }));
      events.push(...(data?._embedded?.events || []).map(event => normalizeTicketmasterEvent(event, now)).filter(Boolean).filter(event => haversineKm(market.center, event) <= market.radiusKm));
      totalPages = Number(data.page?.totalPages) || 1; pages++;
    } while (pages < totalPages && pages < 5);
    return { status: 'active', fetchedAt: now.toISOString(), events: [...new Map(events.map(e => [e.id, e])).values()], truncated: pages < totalPages };
  } catch (error) { return { status: safeStatus(error), fetchedAt: now.toISOString(), events: [] }; }
}

function isoDate(date) { return date.toISOString().slice(0, 10); }

async function bookingProvider(market) {
  if (!market.sampleAreas?.length) return { status: 'not_supported', fetchedAt: null, checkin: null, areas: [] };
  const key = process.env.BOOKING_API_KEY, affiliateId = process.env.BOOKING_AFFILIATE_ID;
  if (!key || !affiliateId) return { status: 'not_configured', fetchedAt: null, checkin: null, areas: [] };
  const checkin = new Date(NOW); checkin.setUTCDate(checkin.getUTCDate() + 1);
  const checkout = new Date(checkin); checkout.setUTCDate(checkout.getUTCDate() + 1);
  const areas = [];
  let failures = 0;
  for (const area of market.sampleAreas) {
    try {
      const data = await readJson(await boundedFetch('https://demandapi.booking.com/3.1/accommodations/search', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`, 'X-Affiliate-Id': affiliateId,
          'Content-Type': 'application/json', Accept: 'application/json'
        },
        body: JSON.stringify({
          coordinates: { latitude: area.lat, longitude: area.lon, radius: 5 },
          booker: { country: 'us', platform: 'mobile' }, currency: 'USD',
          checkin: isoDate(checkin), checkout: isoDate(checkout),
          guests: { number_of_adults: 1, number_of_rooms: 1 }, rows: 100
        })
      }));
      areas.push({
        name: area.name, lat: area.lat, lon: area.lon,
        returnedListings: Array.isArray(data?.data) ? data.data.length : 0
      });
    } catch { failures++; }
  }
  return {
    status: failures && !areas.length ? 'provider_unavailable' : 'active',
    fetchedAt: NOW.toISOString(), checkin: isoDate(checkin), areas
  };
}


function flightRows(payload, candidates) {
  if (Array.isArray(payload)) return payload;
  for (const key of candidates) if (Array.isArray(payload?.[key])) return payload[key];
  return [];
}

function flightTime(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value < 10_000_000_000 ? value * 1000 : value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function normalizeFlightAwareActivity(arrivalPayload, departurePayload, airport, now = NOW) {
  const byHour = new Map();
  const lowerBound = now.getTime() - 30 * 60_000;
  const upperBound = now.getTime() + 12 * 60 * 60_000;
  const addFlights = (rows, direction) => {
    const seen = new Set();
    for (const flight of rows) {
      const candidateTimes = direction === 'arrival'
        ? [flight.estimated_in, flight.scheduled_in, flight.actual_in, flight.estimated_arrival, flight.scheduled_arrival]
        : [flight.scheduled_out, flight.estimated_out, flight.actual_out, flight.scheduled_departure, flight.estimated_departure];
      const time = candidateTimes.map(flightTime).find(Boolean);
      if (!time || time.getTime() < lowerBound || time.getTime() > upperBound) continue;
      const flightId = String(flight.fa_flight_id || flight.ident || '').trim();
      if (!flightId) continue;
      const key = flightId + ':' + time.toISOString();
      if (seen.has(key)) continue;
      seen.add(key);
      const hour = new Date(time);
      hour.setUTCMinutes(0, 0, 0);
      const isoHour = hour.toISOString();
      const bucket = byHour.get(isoHour) || { hour: isoHour, arrivals: 0, departures: 0 };
      bucket[direction === 'arrival' ? 'arrivals' : 'departures']++;
      byHour.set(isoHour, bucket);
    }
  };
  addFlights(flightRows(arrivalPayload, ['scheduled_arrivals', 'arrivals', 'flights']), 'arrival');
  addFlights(flightRows(departurePayload, ['scheduled_departures', 'departures', 'flights']), 'departure');
  return [...byHour.values()].sort((a, b) => a.hour.localeCompare(b.hour)).map(bucket => ({
    ...bucket, lat: airport.lat, lon: airport.lon, name: airport.name
  }));
}

async function flightAwareRequest(airport, direction, key) {
  const url = new URL(`https://aeroapi.flightaware.com/aeroapi/airports/${encodeURIComponent(airport.id)}/flights/scheduled_${direction}s`);
  url.search = new URLSearchParams({ type: 'Airline', max_pages: '1' });
  return readJson(await boundedFetch(url, {
    headers: { 'x-apikey': key, Accept: 'application/json; charset=UTF-8' }
  }));
}

async function flightAwareProvider(market) {
  const key = process.env.FLIGHTAWARE_API_KEY;
  const airport = market.flightawareAirport;
  if (!airport) return { status: 'not_supported', fetchedAt: null, airport: null, activityByHour: [] };
  if (!key) return { status: 'not_configured', fetchedAt: null, airport, activityByHour: [] };
  try {
    const [arrivals, departures] = await Promise.all([
      flightAwareRequest(airport, 'arrival', key),
      flightAwareRequest(airport, 'departure', key)
    ]);
    return {
      status: 'active', fetchedAt: NOW.toISOString(), airport,
      activityByHour: normalizeFlightAwareActivity(arrivals, departures, airport)
    };
  } catch (error) {
    return { status: safeStatus(error), fetchedAt: NOW.toISOString(), airport, activityByHour: [] };
  }
}

export function retainRecent(previous, current, key, maxAgeMs = 25 * 60_000) {
  if (['active','partial'].includes(current.status)) return current;
  const old = previous?.[key];
  if (old?.fetchedAt && Date.now() - Date.parse(old.fetchedAt) < maxAgeMs && ['active', 'partial', 'stale'].includes(old.status)) {
    return { ...old, status: 'stale' };
  }
  return current;
}

async function main() {
  const config = JSON.parse(await readFile(CONFIG_URL, 'utf8'));
  let previous = {};
  try { previous = JSON.parse(await readFile(OUTPUT_URL, 'utf8')); } catch { /* first run */ }
  // Scheduled Pages builds must retain the last deployed snapshot, rather than
  // only the snapshot committed with the release, when a public source fails.
  // The live data branch is usually newest; Pages holds the hourly release copy.
  for (const url of [LIVE_SIGNALS_URL, 'https://home-base-drivers.github.io/Home-base-app/provider-signals.json']) {
    try {
      const deployed = await readJson(await boundedFetch(url, { headers: { Accept: 'application/json' } }));
      if (Array.isArray(deployed?.markets) && Date.parse(deployed.generatedAt) > Date.parse(previous.generatedAt || '1970-01-01')) previous = deployed;
    } catch { /* Local/committed verified data is still available offline. */ }
  }
  const markets = await Promise.all(config.markets.map(async market => {
    const old = previous.markets?.find((entry) => entry.id === market.id);
    const [uber, ticketmaster, booking, flightaware, records, places] = await Promise.all([
      uberProvider(market), ticketmasterProvider(market), bookingProvider(market), flightAwareProvider(market), publicRecords(market, NOW.getTime()), publicPlaces(market, NOW.getTime(), old?.publicPlaces)
    ]);
    const [sportsFeed, alerts] = await Promise.all([
      publicSportsProvider(market, old?.publicSports, NOW.getTime(), fetch, places.places || []),
      publicAlertsProvider(market, NOW.getTime())
    ]);
    const calendar = retainRecent(old, { ...records, status: records.calendarStatus }, 'publicRecords', 24 * 60 * 60_000);
    return {
      id: market.id, name: market.name, center: market.center, radiusKm: market.radiusKm, countryCode: market.countryCode, timeZone: market.timeZone,
      uber: retainRecent(old, uber, 'uber'),
      ticketmaster: retainRecent(old, ticketmaster, 'ticketmaster', 24 * 60 * 60_000),
      booking: retainRecent(old, booking, 'booking'),
      flightaware: retainRecent(old, flightaware, 'flightaware')
      ,publicRecords: calendar.status === 'stale' ? { ...calendar, calendarStatus: 'stale', weather: records.weather, weatherStatus: records.weatherStatus } : records,
      publicPlaces: places,
      publicSports: sportsFeed,
      weatherAlerts: retainRecent(old, alerts, 'weatherAlerts', 30 * 60_000)
    };
  }));
  const output = {
    schemaVersion: 4,
    generatedAt: NOW.toISOString(),
    refreshTargetSeconds: 600,
    calendarMaxAgeSeconds: 86400,
    expiresAt: new Date(NOW.getTime() + 25 * 60_000).toISOString(),
    markets
  };
  await writeFile(OUTPUT_URL, `${JSON.stringify(output)}\n`);
  for (const market of markets) {
    console.log(`${market.name}: Uber ${market.uber.status}, Ticketmaster ${market.ticketmaster.status} (${market.ticketmaster.events.length}), public calendar ${market.publicRecords.calendarStatus} (${market.publicRecords.events.length}), places ${market.publicPlaces.status} (${market.publicPlaces.places.length}), sports ${market.publicSports.status} (${market.publicSports.events.length}), weather alerts ${market.weatherAlerts.status} (${market.weatherAlerts.alerts.length}), Booking.com ${market.booking.status}, FlightAware ${market.flightaware.status}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`Provider refresh failed (${safeStatus(error)})`); process.exitCode = 1; });
}
