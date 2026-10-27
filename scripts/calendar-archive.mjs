#!/usr/bin/env node
// Daily calendar check. Reads every configured public calendar (venue calendars
// in every market plus the campus calendars) a week ahead, saves the results per
// source, and writes a health report. Usage:
//   node scripts/calendar-archive.mjs [previous-archive.json] [output-dir]
// Env: FORCE=1 re-reads calendars already read successfully today;
//      MARKETS=baltimore,new-york limits the check.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import config from '../config/provider-markets.json' with { type: 'json' };
import { readVenueCalendar } from './venue-calendars.mjs';
import { CAMPUS_CALENDARS, readCampusCalendar } from './public-records.mjs';
import { emptyArchive, validArchive, checkedToday, mergeCheck, archiveKey, healthReport } from './calendar-archive-core.mjs';

// The check saves two weeks ahead (conventions and big shows are listed weeks out);
// the live refresh still uses only what is relevant now.
export const ARCHIVE_HORIZON_HOURS = 14 * 24;

export function calendarJobs(markets, only = null) {
  const jobs = [];
  for (const market of markets) {
    if (only && !only.has(market.id)) continue;
    for (const source of market.publicCalendars || []) jobs.push({ market, kind: 'venue', source, key: archiveKey(source) });
    if (/baltimore/i.test(market.name)) for (const campus of CAMPUS_CALENDARS) jobs.push({ market, kind: 'campus', campus, source: { name: campus.name + ' public calendar', url: campus.origin }, key: campus.origin });
  }
  return [...new Map(jobs.map(j => [j.key, j])).values()];
}

export async function runCalendarCheck({ archive, markets = config.markets, now = Date.now(), request = fetch, force = false, only = null, concurrency = 6 }) {
  const next = structuredClone(validArchive(archive) || emptyArchive());
  const jobs = calendarJobs(markets, only), summary = { at: new Date(now).toISOString(), checked: 0, skipped: 0, ok: 0, failed: 0, events: 0 };
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (i < jobs.length) {
      const job = jobs[i++], prev = next.sources[job.key];
      // Already read successfully on this calendar day: do not fetch it again.
      if (!force && checkedToday(prev, now, job.market.timeZone)) { summary.skipped++; continue; }
      summary.checked++;
      let result;
      try {
        result = job.kind === 'campus' ? await readCampusCalendar(job.campus, now, request, ARCHIVE_HORIZON_HOURS) : await readVenueCalendar(job.source, job.market, now, request, undefined, { horizonHours: ARCHIVE_HORIZON_HOURS });
      } catch (error) {
        result = { source: { name: job.source.name, url: job.source.url, status: 'unavailable', reason: String(error?.message || 'error').slice(0, 60) }, events: [] };
      }
      const entry = mergeCheck(prev, result, { now, market: job.market, kind: job.kind });
      entry.key = job.key;
      next.sources[job.key] = entry;
      if (entry.lastSuccessAt === new Date(now).toISOString()) { summary.ok++; summary.events += result.events.length; } else summary.failed++;
    }
  }));
  // Calendars removed from the configuration drop out of the archive.
  const keep = new Set(calendarJobs(markets).map(j => j.key));
  for (const key of Object.keys(next.sources)) if (!keep.has(key)) delete next.sources[key];
  next.updatedAt = new Date(now).toISOString();
  next.runs = [summary, ...(next.runs || [])].slice(0, 30);
  return { archive: next, summary };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [input, outDir = 'calendar-archive-out'] = process.argv.slice(2);
  let previous = null;
  if (input) try { previous = JSON.parse(await readFile(input, 'utf8')); } catch { console.log('No previous archive; starting fresh.'); }
  const only = process.env.MARKETS ? new Set(process.env.MARKETS.split(',').map(s => s.trim()).filter(Boolean)) : null;
  const now = Date.now();
  const { archive, summary } = await runCalendarCheck({ archive: previous, now, force: process.env.FORCE === '1', only });
  await mkdir(outDir, { recursive: true });
  await writeFile(`${outDir}/calendar-archive.json`, JSON.stringify(archive) + '\n');
  await writeFile(`${outDir}/calendar-health.md`, healthReport(archive, now));
  console.log(`Calendar check: ${summary.checked} read (${summary.ok} ok, ${summary.failed} failed, ${summary.events} events), ${summary.skipped} already read today.`);
  for (const s of Object.values(archive.sources)) console.log(`${s.market.padEnd(14)} ${s.status.padEnd(11)} ${String(s.events.length).padStart(4)} saved  ${s.name}${s.reason ? '  (' + s.reason + ')' : ''}`);
}
