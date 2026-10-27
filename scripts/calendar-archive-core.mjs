// Saved calendar results. The daily calendar check (scripts/calendar-archive.mjs)
// stores what every public calendar returned, per source, on the machine-owned
// `calendar-archive` branch. The live refresh reads it so that:
//  - a calendar already read successfully today is not fetched again, and
//  - a calendar whose website is down or returns nothing keeps its saved events.
export const ARCHIVE_SCHEMA = 1;
export const ARCHIVE_RETENTION_DAYS = 14;
const HOUR = 3600_000;

export function localDay(now, timeZone = 'America/New_York') {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now)); }
  catch { return new Date(now).toISOString().slice(0, 10); }
}
export const archiveKey = source => String(source.url || source.origin || source.name);
export function emptyArchive() { return { schemaVersion: ARCHIVE_SCHEMA, updatedAt: null, sources: {}, runs: [] }; }
export function validArchive(value) {
  return value && value.schemaVersion === ARCHIVE_SCHEMA && value.sources && typeof value.sources === 'object' ? value : null;
}
// Read successfully on the market's current calendar day (the "same day" rule).
export function checkedToday(entry, now, timeZone) {
  return !!entry?.lastSuccessAt && entry.lastSuccessDay === localDay(now, timeZone) && Date.parse(entry.lastSuccessAt) <= now && now - Date.parse(entry.lastSuccessAt) < 26 * HOUR;
}
// Archived events still relevant now: not over, and starting within the horizon.
export function archivedEvents(entry, now, horizonHours) {
  return (entry?.events || []).filter(e => {
    const start = Date.parse(e.eventStart), end = Date.parse(e.eventEnd);
    if (!Number.isFinite(start)) return false;
    if (Number.isFinite(end) && end > start ? end < now - 90 * 60_000 : start < now - 6 * HOUR) return false;
    return start <= now + horizonHours * HOUR;
  });
}
// Merge one check into the archive entry. A successful read replaces the saved
// events from now on (the window it covered) and keeps recent past ones; a failed
// or empty-because-broken read keeps every saved event.
export function mergeCheck(entry, result, { now, market, kind = 'venue', timeZone }) {
  const prev = entry || {};
  // A calendar that answers but suddenly lists nothing while saved events are still
  // upcoming is treated as not transmitting data: keep the saved events.
  const silent = result.source.status !== 'unavailable' && !result.events.length && archivedEvents(prev, now, 7 * 24).length > 0;
  const ok = result.source.status !== 'unavailable' && !silent;
  const cutoff = now - ARCHIVE_RETENTION_DAYS * 24 * HOUR, windowStart = now - 6 * HOUR;
  const keepPast = (prev.events || []).filter(e => { const t = Date.parse(e.eventStart); return Number.isFinite(t) && t >= cutoff && (!ok || t < windowStart); });
  const events = ok ? [...keepPast, ...result.events] : keepPast;
  const unique = [...new Map(events.map(e => [e.id || `${e.name}|${e.eventStart}`, e])).values()].sort((a, b) => Date.parse(a.eventStart) - Date.parse(b.eventStart));
  return {
    key: archiveKey(result.source), market: market.id, kind, name: result.source.name, url: result.source.url,
    lastAttemptAt: new Date(now).toISOString(),
    lastSuccessAt: ok ? new Date(now).toISOString() : prev.lastSuccessAt || null,
    lastSuccessDay: ok ? localDay(now, timeZone || market.timeZone) : prev.lastSuccessDay || null,
    status: ok ? result.source.status : 'unavailable',
    method: result.source.method || prev.method || null,
    reason: ok ? null : silent ? 'no_events_returned' : result.source.reason || 'unavailable',
    consecutiveFailures: ok ? 0 : (prev.consecutiveFailures || 0) + 1,
    lastEventCount: ok ? result.events.length : prev.lastEventCount ?? 0,
    events: unique
  };
}
// Live use: a source read today comes from the archive without a network call.
// A live read that fails falls back to the archive. Returns null when the
// source must be fetched live.
export function fromArchive(archive, source, now, timeZone, horizonHours) {
  const entry = archive?.sources?.[archiveKey(source)];
  if (!checkedToday(entry, now, timeZone)) return null;
  const events = archivedEvents(entry, now, horizonHours);
  return { source: { name: source.name, url: source.url, status: 'active', pages: 0, eventCount: events.length, truncated: false, fetchedAt: entry.lastSuccessAt, method: 'archive' + (entry.method ? ':' + entry.method : ''), archivedAt: entry.lastSuccessAt }, discoveredSources: [], events: events.map(e => ({ ...e, archived: true })), context: [] };
}
export function archiveFallback(archive, source, live, now, horizonHours) {
  const entry = archive?.sources?.[archiveKey(source)];
  const events = archivedEvents(entry, now, horizonHours);
  if (live.source.status !== 'unavailable' && (live.events.length || !events.length)) return live;
  if (!entry?.lastSuccessAt || !events.length) return live;
  return { ...live, source: { ...live.source, status: 'archived', eventCount: events.length, archivedAt: entry.lastSuccessAt, liveReason: live.source.reason || null, fetchedAt: entry.lastSuccessAt }, events: events.map(e => ({ ...e, archived: true })) };
}
export function healthReport(archive, now) {
  const rows = Object.values(archive.sources).sort((a, b) => a.market.localeCompare(b.market) || a.name.localeCompare(b.name));
  const ago = t => t ? Math.round((now - Date.parse(t)) / HOUR) + ' h ago' : 'never';
  const lines = [
    '# Calendar health', '',
    `Updated ${new Date(now).toISOString()} by the daily calendar check (.github/workflows/calendar-archive.yml).`,
    'A source read successfully today is not fetched again until the next day; a source that fails keeps its saved events.', '',
    '| Market | Calendar | Status | Method | Upcoming saved | Last success | Failures in a row | Reason |',
    '|---|---|---|---|---:|---|---:|---|'
  ];
  for (const r of rows) lines.push(`| ${r.market} | ${r.name.replace(/\|/g, '/')} | ${r.status} | ${r.method || ''} | ${archivedEvents(r, now, 14 * 24).length} | ${ago(r.lastSuccessAt)} | ${r.consecutiveFailures || 0} | ${r.reason || ''} |`);
  const failing = rows.filter(r => r.consecutiveFailures >= 3);
  if (failing.length) lines.push('', '## Needs attention', '', ...failing.map(r => `- ${r.market}: ${r.name} has failed ${r.consecutiveFailures} checks in a row (${r.reason}); saved events are being used.`));
  return lines.join('\n') + '\n';
}
