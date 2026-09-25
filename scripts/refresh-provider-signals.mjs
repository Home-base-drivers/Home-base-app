import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const CONFIG_URL = new URL('config/provider-markets.json', ROOT);
const OUTPUT_URL = new URL('dist/provider-signals.json', ROOT);
const NOW = new Date();
const TIMEOUT_MS = 12_000;

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
  const venue = event?._embedded?.venues?.[0];
  const lat = Number(venue?.location?.latitude), lon = Number(venue?.location?.longitude);
  const start = event?.dates?.start?.dateTime;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !start || !Number.isFinite(Date.parse(start))) return null;
  const startMs = Date.parse(start);
  const end = event?.dates?.end?.dateTime || null;
  if (startMs < now.getTime() - 6 * 60 * 60_000 || startMs > now.getTime() + 36 * 60 * 60_000) return null;
  const name = String(event?.name || '').trim();
  if (!name) return null;
  return {
    id: String(event.id || `${name}:${start}`),
    name,
    venue: String(venue.name || ''),
    lat,
    lon,
    eventStart: new Date(start).toISOString(),
    eventEnd: end && Number.isFinite(Date.parse(end)) ? new Date(end).toISOString() : null,
    url: typeof event.url === 'string' ? event.url : null,
    source: 'Ticketmaster Discovery API'
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
  // Flat/near-flat Uber pricing is not painted as a demand zone.
  if (median < 1.05) return null;
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

async function ticketmasterProvider(market) {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key) return { status: 'not_configured', fetchedAt: null, events: [] };
  const url = new URL('https://app.ticketmaster.com/discovery/v2/events.json');
  const start = new Date(NOW.getTime() - 6 * 60 * 60_000), end = new Date(NOW.getTime() + 36 * 60 * 60_000);
  url.search = new URLSearchParams({
    apikey: key,
    latlong: `${market.center.lat},${market.center.lon}`,
    radius: String(Math.min(50, Math.ceil(market.radiusKm * 0.62))),
    unit: 'miles',
    startDateTime: start.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    endDateTime: end.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    sort: 'date,asc', size: '200',
    countryCode: 'US'
  });
  try {
    const data = await readJson(await boundedFetch(url, { headers: { Accept: 'application/json' } }));
    const events = (data?._embedded?.events || []).map((event) => normalizeTicketmasterEvent(event)).filter(Boolean)
      .filter((event) => haversineKm(market.center, event) <= market.radiusKm);
    return { status: 'active', fetchedAt: NOW.toISOString(), events };
  } catch (error) { return { status: safeStatus(error), fetchedAt: NOW.toISOString(), events: [] }; }
}

function isoDate(date) { return date.toISOString().slice(0, 10); }

async function bookingProvider(market) {
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

function retainRecent(previous, current, key, maxAgeMs = 90 * 60_000) {
  if (current.status === 'active') return current;
  const old = previous?.[key];
  if (old?.fetchedAt && Date.now() - Date.parse(old.fetchedAt) < maxAgeMs && old.status === 'active') {
    return { ...old, status: 'stale' };
  }
  return current;
}

async function main() {
  const config = JSON.parse(await readFile(CONFIG_URL, 'utf8'));
  let previous = {};
  try { previous = JSON.parse(await readFile(OUTPUT_URL, 'utf8')); } catch { /* first run */ }
  const markets = [];
  for (const market of config.markets) {
    const [uber, ticketmaster, booking] = await Promise.all([
      uberProvider(market), ticketmasterProvider(market), bookingProvider(market)
    ]);
    const old = previous.markets?.find((entry) => entry.id === market.id);
    markets.push({
      id: market.id, name: market.name, center: market.center, radiusKm: market.radiusKm,
      uber: retainRecent(old, uber, 'uber'),
      ticketmaster: retainRecent(old, ticketmaster, 'ticketmaster'),
      booking: retainRecent(old, booking, 'booking')
    });
  }
  const output = { schemaVersion: 1, generatedAt: NOW.toISOString(), markets };
  await writeFile(OUTPUT_URL, `${JSON.stringify(output, null, 2)}\n`);
  for (const market of markets) {
    console.log(`${market.name}: Uber ${market.uber.status}, Ticketmaster ${market.ticketmaster.status}, Booking.com ${market.booking.status}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`Provider refresh failed (${safeStatus(error)})`); process.exitCode = 1; });
}
