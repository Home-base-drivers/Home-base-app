// Ingest published JSON-LD, not search snippets or inferred recurring shows.
import publicData from '../dist/homebase-public-data.js';
const HOUR = 3_600_000;
const USER_AGENT = 'HomeBase public event context (+https://github.com/Home-base-drivers/Home-base-app)';
const cache = new Map();

export function distanceKm(a, b) {
  const rad = n => n * Math.PI / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Many theatre calendars publish local wall time without an offset. Resolve it
// in the venue market's IANA zone, including DST, and reject nonexistent times.
export function zonedEventTime(value, timeZone) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const calendar = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  const calendarDate = new Date(Date.UTC(+calendar[1], +calendar[2] - 1, +calendar[3]));
  if (calendarDate.getUTCFullYear() !== +calendar[1] || calendarDate.getUTCMonth() + 1 !== +calendar[2] || calendarDate.getUTCDate() !== +calendar[3] || +calendar[4] > 23 || +calendar[5] > 59 || +(calendar[6] || 0) > 59) return null;
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    const stamp = Date.parse(value);
    return Number.isFinite(stamp) ? new Date(stamp).toISOString() : null;
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match || !timeZone) return null;
  const [, y, m, d, h, minute, second = '0'] = match;
  const target = Date.UTC(+y, +m - 1, +d, +h, +minute, +second);
  const check = new Date(target);
  if (check.getUTCFullYear() !== +y || check.getUTCMonth() + 1 !== +m || check.getUTCDate() !== +d || +h > 23 || +minute > 59 || +second > 59) return null;
  let formatter;
  try { formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); } catch { return null; }
  const wallStamp = stamp => {
    const p = Object.fromEntries(formatter.formatToParts(new Date(stamp)).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  };
  const candidates = new Set();
  for (const delta of [-24 * HOUR, 0, 24 * HOUR]) {
    const probe = target + delta, offset = wallStamp(probe) - probe, stamp = target - offset;
    if (wallStamp(stamp) === target) candidates.add(stamp);
  }
  return candidates.size === 1 ? new Date([...candidates][0]).toISOString() : null;
}

export function structuredEvents(html) {
  const events = [];
  const walk = value => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== 'object') return;
    if ([value['@type']].flat().some(type => /Event$/.test(String(type)))) events.push(value);
    // Venue calendars may place their verified geo on the parent MusicVenue.
    if(value.geo&&value.event&&value.name)for(const event of [value.event].flat())if(event&&event.location?.name===value.name&&!event.location.geo)event.location.geo=value.geo;
    for (const child of Object.values(value)) if (child && typeof child === 'object') walk(child);
  };
  for (const match of String(html).matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(match[1].replace(/^\s*<!--|-->\s*$/g, ''))); } catch { /* A malformed unrelated block does not erase other records. */ }
  }
  return events;
}

// Soundstage publishes explicit local show times in data-start attributes.
// Coordinates come from Visit Baltimore's venue listing, not guessed venues.
// The Events Calendar (WordPress) REST API: /wp-json/tribe/events/v1/events.
// UTC start/end times and the venue's own published coordinates are used.
export function tribeEvents(body,source){
  let data;try{data=JSON.parse(body);}catch{return [];}
  const text=value=>String(value||'').replace(/<[^>]*>/g,' ').replace(/&#0?38;|&amp;/g,'&').replace(/&#8217;|&#0?39;/g,"'").replace(/&#8211;/g,'-').replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
  const utc=value=>/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value||'')?value.replace(' ','T')+'Z':null;
  return (Array.isArray(data?.events)?data.events:[]).map(e=>{
    const venue=Array.isArray(e.venue)?null:e.venue,lat=Number(venue?.geo_lat),lon=Number(venue?.geo_lng),start=utc(e.utc_start_date);
    if(!start||e.status&&e.status!=='publish'||e.hide_from_listings)return null;
    const geo=venue?.geo_lat!=null&&Number.isFinite(lat)&&Number.isFinite(lon)?{latitude:lat,longitude:lon}:null;
    return{'@type':'Event',name:text(e.title),startDate:start,endDate:utc(e.utc_end_date),url:e.url,allDay:!!e.all_day,location:{name:text(venue?.venue)||source.venue?.name||'',...(geo?{geo}:{})}};
  }).filter(Boolean);
}
// Baltimore Peninsula publishes event cards (title, weekday+date, time,
// street address) without schema.org data. Times are local wall time.
export function peninsulaCards(html,source){
  if(!source?.venue||!Number.isFinite(source.venue.lat)||!Number.isFinite(source.venue.lon))return [];
  const text=value=>String(value).replace(/<!--.*?-->/g,'').replace(/<[^>]*>/g,' ').replace(/&#x27;|&#0?39;/g,"'").replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
  const months={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
  return [...String(html).matchAll(/<a\b[^>]*EventCardWrapper[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>{
    const block=m[2],title=text(block.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1]||''),items=[...block.matchAll(/<span\b[^>]*EventCardInformationItem[^>]*>([\s\S]*?)<\/span>/gi)].map(x=>text(x[1]));
    const date=/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(items[0]||''),time=/(\d{1,2}):(\d{2})\s*([AP])M/i.exec(items[1]||'');
    if(!title||!date||!time||!months[date[1].toLowerCase()])return null;
    let hour=Number(time[1])%12;if(/p/i.test(time[3]))hour+=12;
    const pad=n=>String(n).padStart(2,'0');
    let url;try{url=new URL(m[1],source.url).href;}catch{url=source.url;}
    return{'@type':'Event',name:title,startDate:`${date[3]}-${pad(months[date[1].toLowerCase()])}-${pad(date[2])}T${pad(hour)}:${time[2]}`,url,address:items[2]||'',location:{name:source.venue.name,geo:{latitude:source.venue.lat,longitude:source.venue.lon}}};
  }).filter(Boolean);
}
export function publishedVenueEvents(html,source){
  if(source.adapter==='tribe')return tribeEvents(html,source);
  if(source.adapter==='peninsula')return peninsulaCards(html,source);
  if(source.adapter!=='soundstage')return [];
  const text=value=>String(value).replace(/<[^>]*>/g,' ').replace(/&#(?:0?38|x26);/gi,'&').replace(/&amp;/g,'&').replace(/&#(?:0?39|x27);/gi,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
  return [...String(html).matchAll(/<article\b[^>]*data-start=["'](\d{4}-\d{2}-\d{2} \d{2}:\d{2})["'][^>]*>([\s\S]*?)<\/article>/gi)].map(match=>{
    const block=match[2],title=block.match(/<span[^>]*class=["']title["'][^>]*>([\s\S]*?)<\/span>/i),link=block.match(/href=["'](https:\/\/www\.baltimoresoundstage\.com\/events\/[^"']+)["']/i);
    return title&&link?{'@type':'MusicEvent',name:text(title[1]),startDate:match[1].replace(' ','T'),url:link[1],eventStatus:/cancelled|canceled/i.test(text(block))?'EventCancelled':'EventScheduled',location:{name:source.venue.name,geo:{latitude:source.venue.lat,longitude:source.venue.lon}}}:null;
  }).filter(Boolean);
}

function safeUrl(value, fallback) {
  try { const url = new URL(value || fallback, fallback); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}

export function publishedAttendance(event, sourceUrl){
  // Only an explicit organizer forecast is attendance. Venue capacity, ticket
  // availability and RSVP/follower counts cannot stand in for turnout.
  const count=Number(event.expectedAttendance);
  return event.expectedAttendance!=null&&Number.isFinite(count)&&count>=0&&count<=1000000&&/^https:\/\//.test(sourceUrl||'')?
    {expectedAttendance:count,attendanceBasis:'organizer_estimate',attendanceSourceUrl:sourceUrl,attendanceConfidence:.75}:{};
}

export function normalizePublicEvent(event, market, source, now = Date.now()) {
  if (event.private || event.allDay || event.isAllDay || /cancel|postpon|reschedul/i.test(String(event.eventStatus || '')) || /OnlineEventAttendanceMode/.test(String(event.eventAttendanceMode || ''))) return null;
  const start = zonedEventTime(event.startDate, market.timeZone);
  if (!start) return null;
  const reportedEnd = zonedEventTime(event.endDate, market.timeZone);
  const end = reportedEnd && Date.parse(reportedEnd) > Date.parse(start) ? reportedEnd : null;
  if ((end ? Date.parse(end) < now - 90 * 60_000 : Date.parse(start) < now - 6 * HOUR) || Date.parse(start) > now + 36 * HOUR) return null;
  const venue = [event.location].flat().find(place => place && typeof place === 'object');
  const geo = venue?.geo;
  const known = (source.venues || []).find(place => place.name.toLowerCase() === String(venue?.name || '').toLowerCase());
  const lat = geo?.latitude == null ? known?.lat : Number(geo.latitude), lon = geo?.longitude == null ? known?.lon : Number(geo.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || distanceKm(market.center, { lat, lon }) > market.radiusKm) return null;
  const name = String(event.name || '').trim(), eventType = [event['@type']].flat().join(' ');
  // A sports or arena source may describe its listings only as "A vs. B";
  // its configured classification supplies the missing category.
  const context = [name, venue?.name, eventType, event.description, source.classification].join(' ');
  if (!name || publicData.isTicketAddon(name) || /webinar|virtual|online.only|exhibition|gallery|workshop|seminar|campus.tour|all.day.entry|standard.entry|standard.admission|standard.experience/i.test(context)) return null;
  const performers = [event.performer].flat().filter(Boolean);
  const classification = performers.map(p => p['@type']).flat().join(' ');
  if (!/sports|concert|festival|convention|conference|football|basketball|baseball|hockey|soccer|stadium|arena|theatre|theater|comedy|performing|music|graduation|commencement|fairground|circus|danceevent|homecoming|prom\b|tailgate|bonfire|reunion|gala|party|social|community|screening/i.test(context + ' ' + classification)) return null;
  const url = safeUrl(event.url || event.offers?.url, source.url);
  return { id: 'public:' + (url || `${name}:${lat}:${lon}`) + ':' + start, name: name.slice(0, 180), venue: String(venue?.name || known?.name || '').slice(0, 160), lat, lon, eventStart: start, eventEnd: end, url, source: source.name, sourceUrl: source.url, eventType, classification, ...publishedAttendance(event,url||source.url), fetchedAt: new Date(now).toISOString() };
}

export function nextPublicPage(html, current) {
  for (const match of String(html).matchAll(/<a\b[^>]*>/gi)) {
    if (!/\btitle=["']Next page \d+["']/i.test(match[0])) continue;
    const href = match[0].match(/\bhref=["']([^"']+)["']/i)?.[1];
    try { const next = new URL(href?.replace(/&amp;/g, '&'), current), base = new URL(current); if (next.origin === base.origin && next.pathname === base.pathname && next.href !== base.href) return next.href; } catch { /* no valid next page */ }
  }
  return null;
}

async function publicPage(url, request) {
  const key = request === fetch ? url : null;
  if (key && cache.has(key)) return cache.get(key);
  const task = (async () => {
    const response = await request(url, { signal: AbortSignal.timeout(15_000), headers: { Accept: 'text/html', 'User-Agent': USER_AGENT } });
    if (!response.ok) throw Error('Public calendar unavailable');
    const html = await response.text();
    if (!/<html|application\/ld\+json/i.test(html)) throw Error('Invalid public calendar');
    return html;
  })();
  if (key) cache.set(key, task);
  return task;
}

export async function publicEventCalendars(market, now = Date.now(), request = fetch) {
  const sources = market.publicCalendars || [];
  if (!sources.length) return { status: 'not_supported', events: [], sources: [] };
  const results = await Promise.all(sources.map(async source => {
    let url = source.url, loaded = 0, error = false, truncated = false;
    const events = [], seenPages = new Set();
    for (let page = 0; url && page < Math.min(6, source.maxPages || 1); page++) {
      if (seenPages.has(url)) break;
      seenPages.add(url);
      try {
        const html = await publicPage(url, request), records = [...structuredEvents(html),...publishedVenueEvents(html,source)];
        if (!records.length) throw Error('No machine-readable public calendar');
        loaded++;
        events.push(...records.map(event => normalizePublicEvent(event, market, { ...source, url }, now)).filter(Boolean));
        // Stop once dated listings have passed the forecast horizon; do not crawl an entire city catalogue.
        const dated = records.map(e => zonedEventTime(e.startDate, market.timeZone)).filter(Boolean).map(Date.parse);
        if (dated.length && Math.min(...dated) > now + 36 * HOUR) { url = null; break; }
        url = source.maxPages > 1 ? nextPublicPage(html, url) : null;
      } catch { error = true; break; }
    }
    truncated = !!url || !!source.nextOnly;
    return { events, source: { name: source.name, url: source.url, status: error ? loaded ? 'partial' : 'unavailable' : 'active', fetchedAt: loaded ? new Date(now).toISOString() : null, pages: loaded, eventCount: events.length, truncated } };
  }));
  const events = [...new Map(results.flatMap(r => r.events).map(e => [publicData.eventIdentity(e), e])).values()].sort((a, b) => a.eventStart.localeCompare(b.eventStart));
  const succeeded = results.filter(r => r.source.status === 'active').length;
  return { status: succeeded === sources.length ? 'active' : results.some(r => r.source.pages) ? 'partial' : 'unavailable', fetchedAt: new Date(now).toISOString(), events, sources: results.map(r => r.source), truncated: results.some(r => r.source.truncated) };
}
