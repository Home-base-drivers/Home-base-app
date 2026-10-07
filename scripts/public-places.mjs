import { readFile } from 'node:fs/promises';
import { distanceKm } from './public-events.mjs';

export function placeCategory(tags = {}) {
  if (tags.place) return 'neighborhood';
  if (tags.shop === 'mall') return 'shopping';
  if (/hospital|clinic/.test(tags.amenity || '')) return 'medical';
  if (/school|kindergarten/.test(tags.amenity || '')) return 'k12';
  if (tags.railway === 'station' || tags.amenity === 'bus_station' || tags.aeroway === 'aerodrome') return 'transit';
  if (tags.leisure === 'stadium' || tags.amenity === 'theatre') return 'event';
  if (/nightclub|bar|pub|casino/.test(tags.amenity || '')) return 'nightlife';
  if (tags.tourism === 'hotel') return 'hotel';
  return 'attraction';
}

export function normalizePublicPlaces(payload, market, now = Date.now()) {
  const seen = new Set(), rows = [];
  for (const item of payload?.elements || []) {
    const lat = item.lat ?? item.center?.lat, lon = item.lon ?? item.center?.lon, tags = item.tags || {};
    if (!tags.name || !Number.isFinite(lat) || !Number.isFinite(lon) || distanceKm(market.center, { lat, lon }) > Number(market.placeRadiusKm || 20)) continue;
    const key = `${tags.name.toLowerCase()}:${lat.toFixed(4)}:${lon.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ name: tags.name, lat, lon, cat: placeCategory(tags), tags: { ...tags, publicVenue: true, publicFetchedAt: now, source: 'OpenStreetMap', sourceUrl: `https://www.openstreetmap.org/${item.type}/${item.id}` } });
  }
  return rows;
}

let baselinePromise;
async function baseline(market) {
  baselinePromise ||= readFile(new URL('../config/public-place-baseline.json', import.meta.url), 'utf8').then(JSON.parse).catch(() => ({ markets: [] }));
  const data = await baselinePromise;
  return (data.markets?.find(m => m.id === market.id)?.places || []).map(p => ({ ...p, tags: { ...p.tags, publicVenue: true, place: 'town', gazetteerArea: true, modelEstimate: true, publicFetchedAt: Date.parse(data.importedAt), source: 'GeoNames', sourceUrl: `https://www.geonames.org/${p.id}/` } }));
}

export async function publicPlaces(market, now = Date.now(), previous, request = fetch) {
  const radius = Math.min(30, Number(market.placeRadiusKm || 20)) * 1000;
  const query = `[out:json][timeout:20];(node(around:${radius},${market.center.lat},${market.center.lon})[name][place~"neighbourhood|suburb|quarter|town|city|village"];nwr(around:${radius},${market.center.lat},${market.center.lon})[name][railway=station];nwr(around:${radius},${market.center.lat},${market.center.lon})[name][amenity~"bus_station|hospital|clinic|school|kindergarten|nightclub|bar|pub|casino|theatre"];nwr(around:${radius},${market.center.lat},${market.center.lon})[name][tourism~"hotel|attraction"];nwr(around:${radius},${market.center.lat},${market.center.lon})[name][shop=mall];nwr(around:${radius},${market.center.lat},${market.center.lon})[name][leisure=stadium];);out center tags 3500;`;
  const areas = await baseline(market);
  for (const base of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
    try {
      const url = new URL(base); url.searchParams.set('data', query);
      const response = await request(url, { signal: AbortSignal.timeout(25_000), headers: { Accept: 'application/json', 'User-Agent': 'HomeBase public place context (+https://github.com/Home-base-drivers/Home-base-app)' } });
      if (!response.ok) throw Error('Public places unavailable');
      const payload = await response.json(), places = normalizePublicPlaces(payload, market, now);
      if (!places.length || payload.remark) throw Error('Public places incomplete');
      return { status: 'active', fetchedAt: new Date(now).toISOString(), source: 'OpenStreetMap + GeoNames', places: [...places, ...areas] };
    } catch { /* Keep verified nearby locations available during mirror outages. */ }
  }
  const kept = (previous?.places || []).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon) && distanceKm(market.center, p) <= Number(market.placeRadiusKm || 20) && now - Number(p.tags?.publicFetchedAt || 0) < 7 * 86_400_000 && !p.tags?.gazetteerArea);
  return { status: kept.length ? 'cached' : areas.length ? 'baseline' : 'unavailable', fetchedAt: previous?.fetchedAt || null, source: 'Cached OpenStreetMap + GeoNames', places: [...kept, ...areas] };
}
