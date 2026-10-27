// Diagnoses every configured public calendar from a runner with open network:
// what the site returns to Home Base, whether a browser gets something different,
// and which machine-readable feeds the page exposes. Read-only.
import { readFile, writeFile } from 'node:fs/promises';
import { structuredEvents, publishedVenueEvents } from './public-events.mjs';
import { readVenueCalendar } from './venue-calendars.mjs';
const markets = JSON.parse(await readFile(new URL('../config/provider-markets.json', import.meta.url), 'utf8')).markets;
const schools = JSON.parse(await readFile(new URL('../config/school-calendar-sources.json', import.meta.url), 'utf8')).sources || [];
const APP_UA = 'HomeBase public event context (+https://github.com/Home-base-drivers/Home-base-app)';
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const only = (process.argv.find(a => a.startsWith('--market=')) || '').slice(9);

async function get(url, ua) {
  const t = Date.now();
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'User-Agent': ua, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' } });
    const body = await r.text();
    return { status: r.status, finalUrl: r.url, ms: Date.now() - t, bytes: body.length, type: r.headers.get('content-type') || '', server: r.headers.get('server') || '', cf: !!r.headers.get('cf-ray'), body };
  } catch (e) { return { status: 0, error: e.name === 'TimeoutError' ? 'timeout' : String(e.cause?.code || e.message).slice(0, 60), ms: Date.now() - t, bytes: 0, body: '' }; }
}
function signals(body) {
  const b = body || '';
  return {
    title: (b.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim().slice(0, 70),
    blocked: /just a moment|cf-chl|captcha|access denied|attention required|are you a robot|px-captcha|incapsula|akamai|request unsuccessful|bot detection/i.test(b) ? 'block-page' : '',
    ldjson: (b.match(/application\/ld\+json/gi) || []).length,
    ics: [...new Set([...b.matchAll(/href=["']([^"']*(?:\.ics|ical|webcal)[^"']*)["']/gi)].map(m => m[1]))].slice(0, 3),
    rss: [...new Set([...b.matchAll(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*href=["']([^"']+)["']/gi)].map(m => m[1]))].slice(0, 2),
    tribe: /wp-json\/tribe|tribe-events/i.test(b), wordpress: /wp-content|wp-json/i.test(b), localist: /localist/i.test(b), trumba: /trumba/i.test(b),
    nextData: /__NEXT_DATA__/.test(b), nuxt: /__NUXT__/.test(b), algolia: /algolia/i.test(b), eventbrite: /eventbrite/i.test(b), etix: /etix\.com/i.test(b), ticketmaster: /ticketmaster\.com/i.test(b), axs: /axs\.com/i.test(b), seetickets: /seetickets/i.test(b), squarespace: /squarespace/i.test(b), wix: /wix\.com|wixstatic/i.test(b), civicplus: /civicplus|civicengage/i.test(b), activenet: /activecommunities|activenet/i.test(b), finalsite: /finalsite/i.test(b), rschooltoday: /rschooltoday/i.test(b), blackbaud: /blackbaud/i.test(b)
  };
}
const rows = [];
const extra = (process.env.EXTRA_URLS || '').split(/\s+/).filter(Boolean).map(u => ({ market: 'candidate', kind: 'candidate', name: u, url: u }));
const targets = [...extra, ...markets.filter(m => !only || m.id === only).flatMap(m => (m.publicCalendars || []).map(c => ({ market: m.id, kind: 'venue', ...c }))), ...(only && only !== 'baltimore' ? [] : schools.map(s => ({ market: 'baltimore', kind: s.kind || 'school', ...s })))];
for (const t of targets) {
  const app = await get(t.url, APP_UA), sig = signals(app.body);
  let events = 0; try { events = structuredEvents(app.body).length + publishedVenueEvents(app.body, t).length; } catch {}
  const needBrowser = !(app.status === 200 && events > 0);
  const browser = needBrowser ? await get(t.url, BROWSER_UA) : null, bsig = browser ? signals(browser.body) : null;
  let bevents = 0; try { if (browser) bevents = structuredEvents(browser.body).length + publishedVenueEvents(browser.body, t).length; } catch {}
  const snippet = t.kind === 'candidate' ? (process.env.SNIPPET_GREP ? [...new Set([...app.body.matchAll(new RegExp('.{0,160}(?:' + process.env.SNIPPET_GREP + ').{0,240}', 'gi'))].map(m => m[0]))].slice(0, 12) : [app.body.slice(0, 4000)]) : undefined;
  rows.push({ snippet, market: t.market, kind: t.kind, name: t.name, url: t.url, adapter: t.adapter || '', app: { status: app.status, error: app.error, bytes: app.bytes, finalUrl: app.finalUrl !== t.url ? app.finalUrl : undefined, server: app.server, cf: app.cf, events, ...sig },
    browser: browser ? { status: browser.status, error: browser.error, bytes: browser.bytes, events: bevents, blocked: bsig.blocked, ldjson: bsig.ldjson, title: bsig.title } : null });
}
const md = ['| market | source | app status | bytes | events | blocked | ld+json | feeds/platform | browser status | browser events |', '|---|---|---|---|---|---|---|---|---|---|'];
for (const r of rows) {
  const a = r.app, feeds = [a.ics.length ? 'ics' : '', a.rss.length ? 'rss' : '', a.tribe ? 'tribe' : '', a.localist ? 'localist' : '', a.trumba ? 'trumba' : '', a.nextData ? 'next' : '', a.nuxt ? 'nuxt' : '', a.algolia ? 'algolia' : '', a.eventbrite ? 'eventbrite' : '', a.etix ? 'etix' : '', a.ticketmaster ? 'tm' : '', a.axs ? 'axs' : '', a.seetickets ? 'seetickets' : '', a.squarespace ? 'squarespace' : '', a.wix ? 'wix' : '', a.civicplus ? 'civicplus' : '', a.activenet ? 'activenet' : '', a.finalsite ? 'finalsite' : '', a.rschooltoday ? 'rschooltoday' : '', a.blackbaud ? 'blackbaud' : '', a.wordpress ? 'wp' : ''].filter(Boolean).join(' ');
  md.push(`| ${r.market} | ${r.name} | ${a.status || a.error} | ${a.bytes} | ${a.events} | ${a.blocked} | ${a.ldjson} | ${feeds} | ${r.browser ? (r.browser.status || r.browser.error) : ''} | ${r.browser ? r.browser.events + (r.browser.blocked ? ' (block page)' : '') : ''} |`);
}
// The real pipeline (what the live refresh stores), per venue calendar.
md.push('', '### Pipeline (readVenueCalendar, next 36 h)', '', '| market | source | status | method | stored events | reason |', '|---|---|---|---|---|---|');
const now=Date.now();
for (const m of markets.filter(m => !only || m.id === only)) for (const c of m.publicCalendars || []) {
  let r; const o = { why: {}, recordCount: 0, horizonHours: 24 * 14 }, o36 = { why: {}, recordCount: 0 };
  try { r = await readVenueCalendar(c, m, now, fetch, undefined, o); } catch (e) { r = { source: { status: 'error', reason: String(e.message).slice(0, 60) }, events: [] }; }
  let r36; try { r36 = await readVenueCalendar(c, m, now, fetch, undefined, o36); } catch { r36 = { events: [] }; }
  const row = rows.find(x => x.url === c.url && x.market === m.id); if (row) row.pipeline = { ...r.source, records: o.recordCount, dropped14d: o.why, stored36h: r36.events.length, sample: r.events.slice(0, 5).map(e => e.eventStart + ' ' + e.name + ' @ ' + e.venue) };
  md.push(`| ${m.id} | ${c.name} | ${r.source.status} | ${r.source.method || ''} | ${r36.events.length} (14 d: ${r.events.length} of ${o.recordCount}; dropped ${JSON.stringify(o.why).replace(/[{}"]/g, '')}) | ${r.source.reason || ''} |`);
}
await writeFile('calendar-diagnostics.json', JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 1));
await writeFile('calendar-diagnostics.md', md.join('\n') + '\n');
console.log(md.join('\n'));
