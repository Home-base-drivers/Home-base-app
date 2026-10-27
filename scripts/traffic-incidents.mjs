// Live traffic incidents (crashes, disabled vehicles, fires, debris, lane
// closures) for spoken safety warnings and the assistant. Source: Maryland
// CHART public event feed (state highways and interstates, updated continuously).
// Markets outside Maryland's coverage report 'not_supported' instead of guessing.
import { distanceKm } from './public-events.mjs';

export const CHART_URL = 'https://chartexp1.sha.maryland.gov/CHARTExportClientService/getEventMapDataJSON.do';
// Maryland plus the DC area the feed covers.
const CHART_BOUNDS = { south: 37.85, north: 39.75, west: -79.5, east: -75.0 };
const MAJOR = /collision|crash|fatal|personal injury|vehicle fire|fire|overturn|jackknife|hazmat|police activity|road closed|closure|flood|wire|tree down/i;
const SKIP = /signal|flash|special event|weather station|amber|planned/i;

export function chartCovers(market) {
  const c = market.center, pad = (market.radiusKm || 0) / 111;
  return c.lat + pad >= CHART_BOUNDS.south && c.lat - pad <= CHART_BOUNDS.north && c.lon + pad >= CHART_BOUNDS.west && c.lon - pad <= CHART_BOUNDS.east;
}

const clean = text => String(text || '').replace(/^(?:Incident|Action Event|Disabled Vehicle|Debris)\s*@\s*/i, '').replace(/\s+/g, ' ').trim().slice(0, 160);

export function normalizeChart(payload, market, now = Date.now()) {
  const rows = [];
  for (const e of Array.isArray(payload?.data) ? payload.data : []) {
    const lat = Number(e.lat), lon = Number(e.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || distanceKm(market.center, { lat, lon }) > market.radiusKm) continue;
    const type = String(e.incidentType || e.eventType || 'Incident').slice(0, 60);
    const lanes = Array.isArray(e.lanes) ? e.lanes : [];
    const traffic = lanes.filter(l => /traffic lane/i.test(l.laneType || '') || /^L\d/i.test(l.laneDescription || ''));
    const closed = traffic.filter(l => /closed|blocked/i.test(l.laneStatus || '')).length;
    const allClosed = traffic.length > 0 && closed === traffic.length;
    const roadwork = /roadwork|maintenance|utility/i.test(type);
    // Signal flashes, planned work with open lanes and similar items are not driver warnings.
    if ((type === 'Other' || SKIP.test(type)) && !closed) continue;
    if (roadwork && !closed) continue;
    const started = Number(e.startDateTime || e.createTime);
    const severity = allClosed || e.closed === true || MAJOR.test(type) ? 'major' : closed ? 'moderate' : 'minor';
    rows.push({
      id: 'chart:' + String(e.id || `${lat},${lon},${type}`).slice(0, 80), type, road: clean(e.description || e.name), direction: String(e.direction || '').slice(0, 20) || null,
      lat, lon, lanesClosed: closed, lanesTotal: traffic.length || null, allLanesClosed: allClosed, roadwork,
      vehicles: Number.parseInt(String(e.vehicles || '').match(/\d+/)?.[0] || '', 10) || null,
      startedAt: Number.isFinite(started) && started > 0 ? new Date(started).toISOString() : null, severity,
      county: String(e.county || '').slice(0, 40) || null, source: 'Maryland CHART'
    });
  }
  const rank = { major: 0, moderate: 1, minor: 2 };
  return rows.sort((a, b) => rank[a.severity] - rank[b.severity] || distanceKm(market.center, a) - distanceKm(market.center, b)).slice(0, 80);
}

export async function trafficIncidents(market, now = Date.now(), request = fetch) {
  if (!chartCovers(market)) return { status: 'not_supported', fetchedAt: null, source: null, incidents: [] };
  try {
    const r = await request(CHART_URL, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json', 'User-Agent': 'HomeBase traffic safety (github.com/Home-base-drivers/Home-base-app)' } });
    if (!r.ok) throw Error('http_' + r.status);
    const incidents = normalizeChart(await r.json(), market, now);
    return { status: 'active', fetchedAt: new Date(now).toISOString(), source: 'Maryland CHART', sourceUrl: 'https://chart.maryland.gov/', incidents };
  } catch (error) {
    return { status: 'unavailable', fetchedAt: null, source: 'Maryland CHART', reason: String(error?.message || 'error').slice(0, 60), incidents: [] };
  }
}
