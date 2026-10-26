// Shift sites listed by street address get coordinates here, once: the live refresh
// (which has network access) geocodes them with the free U.S. Census Bureau geocoder
// and later refreshes reuse the coordinates from the previous snapshot. A site that
// cannot be matched stays off the map rather than being guessed.
const CENSUS = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';

export function cachedCoordinates(previous) {
  const cache = new Map();
  for (const market of previous?.markets || []) for (const s of market.employerSites?.sites || []) {
    if (s?.id && Number.isFinite(s.lat) && Number.isFinite(s.lon) && s.address) cache.set(s.id, s);
  }
  return cache;
}

export async function geocodeAddress(address, request = fetch) {
  const url = `${CENSUS}?${new URLSearchParams({ address, benchmark: 'Public_AR_Current', format: 'json' })}`;
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const r = await request(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!r.ok) return null;
    const match = (await r.json())?.result?.addressMatches?.[0];
    const lat = Number(match?.coordinates?.y), lon = Number(match?.coordinates?.x);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon, matchedAddress: match.matchedAddress || null } : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

export async function resolveSiteCoordinates(sites, previous, request = fetch, limit = 40) {
  const cache = cachedCoordinates(previous);
  let lookups = 0;
  const out = [];
  for (const site of sites) {
    if (Number.isFinite(site.lat) && Number.isFinite(site.lon)) { out.push(site); continue; }
    const hit = cache.get(site.id);
    if (hit && hit.address === site.address) { out.push({ ...site, lat: hit.lat, lon: hit.lon, coordinateSource: hit.coordinateSource }); continue; }
    if (!site.address || lookups >= limit) { out.push(site); continue; }
    lookups++;
    const found = await geocodeAddress(site.address, request);
    out.push(found ? { ...site, lat: found.lat, lon: found.lon, coordinateSource: `U.S. Census Bureau geocoder (${found.matchedAddress || site.address})` } : site);
  }
  return out;
}
