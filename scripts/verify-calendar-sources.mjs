// Decide whether a candidate calendar source is worth adding to
// config/provider-markets.json, using the same reader that would consume it in
// production (readVenueCalendar), so a PASS here means the live pipeline can
// actually read it — not merely that the URL responds.
//
//   node scripts/verify-calendar-sources.mjs                    # all candidates
//   node scripts/verify-calendar-sources.mjs --url https://...  # one ad-hoc URL
//
// Exits non-zero if any candidate is rejected, so it can gate the change.
// Needs outbound network: a sandbox without it rejects everything for the wrong
// reason, and the report says so rather than reporting the sources as bad.
import { readFile } from 'node:fs/promises';
import { readVenueCalendar } from './venue-calendars.mjs';

const MIN_EVENTS = 1;
const HORIZON_DAYS = 400;

// readVenueCalendar swallows transport errors and returns an empty event list,
// so a blocked network looks exactly like a dead source. Probe first and report
// UNKNOWN rather than condemning a source this machine simply cannot reach.
export async function reachable(url, request = fetch) {
  try { const r = await request(url, { method: 'GET', redirect: 'follow' });
        return { ok: true, status: r.status }; }
  catch (error) { return { ok: false, detail: String(error?.cause?.code || error?.message || error).slice(0, 60) }; }
}

export function judge(result, now = Date.now()) {
  if (result?.unreachable) return { verdict: 'UNKNOWN', reason: `cannot reach this host from here (${result.unreachable})` };
  if (result?.error) return { verdict: 'REJECT', reason: result.error };
  const events = Array.isArray(result?.events) ? result.events : [];
  if (!events.length) return { verdict: 'REJECT', reason: 'no events returned' };
  const dated = events.filter(e => {
    const t = Date.parse(e?.eventStart ?? '');
    // A real dated event: parseable, not in the past, not absurdly far out.
    return Number.isFinite(t) && t >= now - 36e5 && t <= now + HORIZON_DAYS * 864e5;
  });
  if (dated.length < MIN_EVENTS) {
    return { verdict: 'REJECT', reason: `${events.length} event(s) but none carried a usable future date` };
  }
  const named = dated.filter(e => typeof e.name === 'string' && e.name.trim().length > 1);
  if (!named.length) return { verdict: 'REJECT', reason: 'dated entries had no event names' };
  return {
    verdict: 'PASS',
    reason: `${dated.length} dated event(s)`,
    sample: named.slice(0, 3).map(e => `${e.name.slice(0, 44)} @ ${e.eventStart}`)
  };
}

async function main() {
  const argUrl = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : null;
  const markets = JSON.parse(await readFile(new URL('../config/provider-markets.json', import.meta.url), 'utf8'));
  const config = JSON.parse(await readFile(new URL('../config/miami-calendar-candidates.json', import.meta.url), 'utf8'));
  const market = markets.markets.find(m => m.id === config.marketId);
  if (!market) throw new Error(`market ${config.marketId} is not configured`);

  const candidates = argUrl ? [{ name: 'ad-hoc', url: argUrl, maxPages: 2 }] : config.candidates;
  const now = Date.now();
  const rows = [];
  for (const c of candidates) {
    let result;
    const reach = await reachable(c.url);
    if (!reach.ok) result = { unreachable: reach.detail };
    else {
      try { result = await readVenueCalendar({ ...c, followEvents: true }, market, now); }
      catch (error) { result = { error: String(error?.message || error).slice(0, 120) }; }
    }
    const outcome = judge(result, now);
    rows.push({ ...c, ...outcome });
    console.log(`${outcome.verdict.padEnd(6)} ${c.name}\n       ${c.url}\n       ${outcome.reason}`);
    for (const s of outcome.sample || []) console.log(`       · ${s}`);
  }
  const passed = rows.filter(r => r.verdict === 'PASS');
  const unknown = rows.filter(r => r.verdict === 'UNKNOWN');
  console.log(`\n${passed.length} of ${rows.length} candidates passed.`);
  if (unknown.length === rows.length) {
    console.log('\nEvery host was unreachable, so this proves nothing about the sources.');
    console.log('Run this where outbound network is allowed before judging them.');
    process.exitCode = 2;
    return;
  }
  if (unknown.length) console.log(`${unknown.length} could not be reached and were not judged.`);
  if (passed.length) {
    console.log('\nAdd only these to the miami market\'s publicCalendars in config/provider-markets.json,');
    console.log('then run: npm run build:school-function   (calendar.mjs embeds the market list)\n');
    console.log(JSON.stringify(passed.map(({ name, url, maxPages }) => ({ name, url, maxPages })), null, 2));
  }
  if (passed.length !== rows.length) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
