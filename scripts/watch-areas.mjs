// Reference-only checks for areas drivers reported as busy. Each refresh lists
// the verified public context near each area (published school dismissals,
// dated events, game state, NWS alerts). Nothing here creates heat, routes or
// destinations; it is a record for reviewing what live feeds explain.
import { readFile } from 'node:fs/promises';
import { distanceKm } from './public-events.mjs';

const MIN = 60_000;

function localParts(now, timeZone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now)).map(x => [x.type, x.value]));
  return { weekday: p.weekday, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
const minutesOf = hhmm => { const m = /^(\d{2}):(\d{2})$/.exec(hhmm || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

export function checkArea(area, market, now = Date.now()) {
  const near = row => Number.isFinite(Number(row?.lat)) && Number.isFinite(Number(row?.lon)) && distanceKm(area, { lat: Number(row.lat), lon: Number(row.lon) }) <= (area.radiusKm || 2);
  const zone = market.timeZone || 'America/New_York', { weekday, minutes } = localParts(now, zone), schoolDay = !['Sat', 'Sun'].includes(weekday);
  // Published closing bells within the next 90 minutes or the last 60.
  const dismissals = schoolDay ? (market.schoolBells?.schools || []).filter(near).flatMap(s => Object.entries(s.levels || {}).map(([level, w]) => ({ name: s.name, level, close: w.close, delta: minutesOf(w.close) - minutes, url: s.url })))
    .filter(d => d.delta != null && d.delta <= 90 && d.delta >= -60).sort((a, b) => a.delta - b.delta) : [];
  const events = [...(market.publicRecords?.events || []), ...(market.publicSports?.events || []), ...(market.ticketmaster?.events || [])].filter(near)
    .filter(e => { const s = Date.parse(e.eventStart), end = Date.parse(e.eventEnd || ''); return Number.isFinite(s) && s <= now + 3 * 60 * MIN && (Number.isFinite(end) ? end >= now - 90 * MIN : s >= now - 4 * 60 * MIN); })
    .map(e => ({ name: e.name, venue: e.venue, eventStart: e.eventStart, eventEnd: e.eventEnd || null, source: e.source }));
  const alerts = (market.weatherAlerts?.alerts || []).filter(a => Date.parse(a.onset) <= now && Date.parse(a.ends) > now).map(a => a.event);
  return { id: area.id, name: area.name, schoolDismissals: [...new Map(dismissals.map(d => [d.name + d.close, d])).values()].slice(0, 8), events: events.slice(0, 8), alerts, explained: dismissals.length + events.length + alerts.length > 0 };
}

export async function watchAreaChecks(markets, now = Date.now(), config) {
  config ||= JSON.parse(await readFile(new URL('../config/watch-areas.json', import.meta.url), 'utf8'));
  const checkedAt = new Date(now).toISOString(), areas = [];
  for (const area of config.areas || []) {
    const market = markets.find(m => distanceKm(m.center, area) <= m.radiusKm);
    if (market) areas.push(checkArea(area, market, now));
  }
  return { referenceOnly: true, checkedAt, areas };
}

