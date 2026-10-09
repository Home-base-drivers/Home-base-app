// Surge circulation: for each observed area and local date, when bonuses first
// appeared, peaked and faded, and how that lines up with published school
// closing bells and mapped shift sites nearby. A reference analysis for tuning
// the demand model; it never feeds heat directly.
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';

const MIN = 60_000;
const BANDS = { calm: 0, none: 0, moderate: 1, elevated: 2, high: 3, very_high: 4 };
const km = (a, b) => { const r = Math.PI / 180, x = (b.lon - a.lon) * r * Math.cos((a.lat + b.lat) * r / 2), y = (b.lat - a.lat) * r; return Math.sqrt(x * x + y * y) * 6371; };
const localDate = t => new Date(t - 4 * 3600_000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const localClock = t => new Date(t).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
const localMinutes = t => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date(t)).map(x => [x.type, x.value])); return (Number(p.hour) % 24) * 60 + Number(p.minute); };
const hhmm = v => { const m = /^(\d{2}):(\d{2})$/.exec(v || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

export function observationPoints(rows) {
  const out = [];
  for (const row of rows || []) {
    if (!['uber_reference', 'empower_reference'].includes(row.record_type)) continue;
    const times = (row.notifications || []).map(n => Date.parse(n.at)).filter(Number.isFinite);
    const at = times.length ? times : [Date.parse(row.captured_at || '')].filter(Number.isFinite);
    for (const t of at) for (const item of row.area_observations || []) {
      if (!Number.isFinite(item.lat) || !Number.isFinite(item.lon) || !(item.band in BANDS)) continue;
      out.push({ area: String(item.area).split(' / ')[0], lat: item.lat, lon: item.lon, t, band: item.band, value: BANDS[item.band], usd: item.shown_usd ?? (row.notifications?.find(n => Date.parse(n.at) === t)?.surge_usd ?? null), platform: row.record_type === 'empower_reference' ? 'Empower' : 'Uber' });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

// Group points into per-area, per-date episodes: onset, peak, fade.
export function circulation(rows, context = {}) {
  const groups = new Map();
  for (const p of observationPoints(rows)) {
    const key = p.area + '|' + localDate(p.t);
    if (!groups.has(key)) groups.set(key, { area: p.area, date: localDate(p.t), lat: p.lat, lon: p.lon, points: [] });
    groups.get(key).points.push(p);
  }
  const episodes = [];
  for (const g of groups.values()) {
    // Split a day into separate waves: a calm capture or a gap over 40 minutes ends a wave.
    const waves = []; let wave = null, last = null;
    for (const p of g.points) {
      if (p.value > 0) {
        if (!wave || (last && p.t - last.t > 40 * MIN)) { wave = { points: [], fade: null }; waves.push(wave); }
        wave.points.push(p); last = p;
      } else if (wave) { if (!wave.fade) wave.fade = p; wave = null; }
    }
    for (const w of waves) {
      const hot = w.points;
      const peak = hot.reduce((a, b) => (b.usd ?? b.value) > (a.usd ?? a.value) ? b : a);
      const onset = hot[0], lastHot = hot.at(-1), fade = w.fade;
      const peakMinute = localMinutes(peak.t);
      const bells = (context.schools || []).filter(s => Number.isFinite(s.lat) && km(g, s) <= 2.5)
        .flatMap(s => Object.values(s.levels || {}).map(x => ({ name: s.name, close: x.close, offset: peakMinute - hhmm(x.close) })))
        .filter(b => b.offset != null && b.offset >= -45 && b.offset <= 90).sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset));
      const sites = [...new Set((context.sites || []).filter(s => s.status !== 'closed' && Number.isFinite(s.lat) && km(g, s) <= (s.kind === 'fulfillment_center' ? 5 : 3)).map(s => s.name))];
      episodes.push({
        area: g.area, date: g.date, onset: localClock(onset.t), peak: localClock(peak.t), peakUsd: peak.usd, lastSeen: localClock(lastHot.t),
        fadedBy: fade ? localClock(fade.t) : null, minutesOnsetToPeak: Math.round((peak.t - onset.t) / MIN), minutesPeakToFade: fade ? Math.round((fade.t - peak.t) / MIN) : null,
        nearestBells: [...new Map(bells.map(b => [b.name, b])).values()].slice(0, 4), nearbySites: sites
      });
    }
  }
  return episodes.sort((a, b) => a.date.localeCompare(b.date) || hhmm24(a.peak) - hhmm24(b.peak));
}
function hhmm24(clock) { const m = /(\d+):(\d+)\s*([AP])/i.exec(clock || ''); if (!m) return 0; let h = Number(m[1]) % 12; if (/p/i.test(m[3])) h += 12; return h * 60 + Number(m[2]); }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const history = (await import('../dist/homebase-demand-history.js')).default;
  const rows = history.observationRows ? history.observationRows() : [];
  const snapshot = process.argv[2] ? JSON.parse(await readFile(process.argv[2], 'utf8')) : null;
  const baltimore = snapshot?.markets?.find(m => m.id === 'baltimore');
  const sites = JSON.parse(await readFile(new URL('../config/employer-sites.json', import.meta.url), 'utf8')).sites.filter(s => s.status === 'open');
  console.log(JSON.stringify(circulation(rows, { schools: baltimore?.schoolBells?.schools || [], sites: [...sites, ...(baltimore?.employerSites?.sites || [])] }), null, 1));
}
