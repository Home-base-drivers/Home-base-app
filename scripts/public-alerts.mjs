// Active National Weather Service alerts for each US market (center and sample areas).
import weather from '../dist/homebase-weather.js';

const USER_AGENT = 'HomeBase weather alerts (+https://github.com/Home-base-drivers/Home-base-app)';

export function alertPoints(market) {
  const points = [market.center, ...(market.sampleAreas || [])].filter(p => Number.isFinite(p?.lat) && Number.isFinite(p?.lon));
  // Alerts are issued by zone/county; points about 0.1 degree apart are enough.
  const seen = new Set();
  return points.filter(p => { const key = p.lat.toFixed(1) + ':' + p.lon.toFixed(1); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 8);
}

export async function publicAlertsProvider(market, now = Date.now(), request = fetch) {
  if (market.countryCode && market.countryCode !== 'US') return { status: 'not_supported', fetchedAt: null, alerts: [] };
  let loaded = 0;
  const payloads = await Promise.all(alertPoints(market).map(async point => {
    try {
      const response = await request(weather.alertsUrl(point.lat, point.lon), { signal: AbortSignal.timeout(12_000), headers: { Accept: 'application/geo+json', 'User-Agent': USER_AGENT } });
      if (!response.ok) throw Error('NWS alerts unavailable');
      const payload = await response.json(); loaded++; return payload;
    } catch { return null; }
  }));
  if (!loaded) return { status: 'unavailable', fetchedAt: new Date(now).toISOString(), alerts: [] };
  const alerts = weather.normalizeAlerts({ features: payloads.filter(Boolean).flatMap(p => p.features || []) }, now);
  return { status: loaded === payloads.length ? 'active' : 'partial', fetchedAt: new Date(now).toISOString(), source: 'National Weather Service', alerts };
}
