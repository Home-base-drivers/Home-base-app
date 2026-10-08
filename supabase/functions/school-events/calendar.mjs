var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// dist/homebase-public-data.js
var require_homebase_public_data = __commonJS({
  "dist/homebase-public-data.js"(exports, module) {
    (function(root, factory) {
      const api = factory();
      if (typeof module === "object" && module.exports) module.exports = api;
      else root.HomeBasePublicData = api;
    })(typeof globalThis !== "undefined" ? globalThis : exports, function() {
      const HOUR2 = 36e5;
      function isTicketAddon(name) {
        return /\b(?:add[ -]?ons?|parking|premium seating|pinstripe pass|not a concert ticket|vip (?:upgrade|package)|meet\s*(?:&|and)\s*greet)\b/i.test(String(name || ""));
      }
      function eventIdentity(event) {
        const token2 = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""), start = new Date(event.eventStart).getTime(), name = String(event.name || "").split(" \xB7 ")[0];
        const sports = /sport|baseball|football|basketball|hockey|soccer/i.test([event.eventType, event.classification, event.genre].join(" ")) || event.tags?.source === "public sports feed";
        const location = token2(event.venue) || Number(event.lat).toFixed(3) + ":" + Number(event.lon).toFixed(3);
        return (sports ? "sports" : token2(name)) + ":" + location + ":" + start;
      }
      function distance(a, b) {
        const rad = (n) => n * Math.PI / 180, h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
        return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
      }
      function point(item) {
        return item && item.lat != null && item.lon != null && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)) && Math.abs(Number(item.lat)) <= 90 && Math.abs(Number(item.lon)) <= 180;
      }
      function matchingMarkets(payload, lat, lon) {
        return (payload?.markets || []).filter((m) => point(m.center) && distance([lat, lon], [Number(m.center.lat), Number(m.center.lon)]) <= Number(m.radiusKm || 0)).sort((a, b) => distance([lat, lon], [a.center.lat, a.center.lon]) - distance([lat, lon], [b.center.lat, b.center.lon]));
      }
      function calendarFresh(feed, generatedAt, now) {
        const fetched = Date.parse(feed?.fetchedAt || generatedAt || "");
        return Number.isFinite(fetched) && now - fetched <= 24 * HOUR2 && now - fetched >= -5 * 6e4;
      }
      function eventsForLocation(payload, lat, lon, now = Date.now()) {
        const rows = [], seen = /* @__PURE__ */ new Set();
        for (const market of matchingMarkets(payload, lat, lon)) for (const feed of [market.ticketmaster, market.publicRecords]) {
          if (!feed || !["active", "partial", "stale"].includes(feed.calendarStatus || feed.status) || !calendarFresh(feed, payload.generatedAt, now)) continue;
          for (const e of feed.events || []) {
            const start = Date.parse(e.eventStart), end = Date.parse(e.eventEnd || "");
            if (isTicketAddon(e.name) || !point(e) || !Number.isFinite(start) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(e.eventStart) || start > now + 12 * HOUR2 || (Number.isFinite(end) && end > start ? end < now - 90 * 6e4 : start < now - 6 * HOUR2) || distance([lat, lon], [Number(e.lat), Number(e.lon)]) > 65) continue;
            const key = eventIdentity(e);
            if (seen.has(key)) continue;
            seen.add(key);
            rows.push({ ...e, lat: Number(e.lat), lon: Number(e.lon), eventStart: new Date(start), eventEnd: Number.isFinite(end) && end > start ? new Date(end) : null });
          }
        }
        return rows.sort((a, b) => a.eventStart - b.eventStart);
      }
      function placesForLocation(payload, lat, lon, radiusKm = 20, now = Date.now()) {
        const rows = [], seen = /* @__PURE__ */ new Set();
        for (const market of matchingMarkets(payload, lat, lon)) for (const p of market.publicPlaces?.places || []) {
          if (!point(p) || !p.name || distance([lat, lon], [Number(p.lat), Number(p.lon)]) > radiusKm) continue;
          if (!p.tags?.gazetteerArea && now - Number(p.tags?.publicFetchedAt || 0) > 7 * 24 * HOUR2) continue;
          const key = String(p.name).toLowerCase() + ":" + Number(p.lat).toFixed(4) + ":" + Number(p.lon).toFixed(4);
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push({ ...p, lat: Number(p.lat), lon: Number(p.lon) });
        }
        rows.sort((a, b) => distance([lat, lon], [a.lat, a.lon]) - distance([lat, lon], [b.lat, b.lon]));
        const cells = /* @__PURE__ */ new Map();
        return rows.filter((p) => {
          const key = Math.floor(p.lat * 100) + ":" + Math.floor(p.lon * 100) + ":" + p.cat, n = cells.get(key) || 0;
          cells.set(key, n + 1);
          return n < 6;
        }).slice(0, 900);
      }
      function calendarCoverage(payload, lat, lon, now = Date.now()) {
        const markets = matchingMarkets(payload, lat, lon), feeds = markets.flatMap((m) => [m.ticketmaster, m.publicRecords]).filter(Boolean), usable = feeds.filter((f) => ["active", "partial", "stale"].includes(f.calendarStatus || f.status) && calendarFresh(f, payload.generatedAt, now));
        const sources = [...new Map(markets.flatMap((m) => m.publicRecords?.sources || []).map((s) => [s.url, s])).values()];
        const dates = usable.map((f) => Date.parse(f.fetchedAt || payload.generatedAt)).filter(Number.isFinite);
        return { status: !markets.length ? "unsupported" : !usable.length ? "unavailable" : usable.some((f) => (f.calendarStatus || f.status) === "stale") ? "stale" : usable.some((f) => (f.calendarStatus || f.status) === "partial" || f.calendarTruncated || f.truncated) ? "partial" : "active", fetchedAt: dates.length ? new Date(Math.min(...dates)).toISOString() : null, sourceCount: sources.filter((s) => s.pages > 0).length, failedSources: sources.filter((s) => s.status === "unavailable").length, ticketmasterConfigured: markets.some((m) => m.ticketmaster?.status && !["not_configured", "not_supported"].includes(m.ticketmaster.status)) };
      }
      return { matchingMarkets, eventsForLocation, placesForLocation, calendarCoverage, isTicketAddon, eventIdentity };
    });
  }
});

// config/school-calendar-sources.json
var school_calendar_sources_default = {
  sources: [
    {
      name: "Morgan State University",
      lat: 39.3448,
      lon: -76.5844,
      url: "https://events.morgan.edu",
      adapter: "localist",
      kind: "college"
    },
    {
      name: "Towson University",
      lat: 39.3933,
      lon: -76.6122,
      url: "https://events.towson.edu",
      adapter: "localist",
      kind: "college"
    },
    {
      name: "University of Maryland, Baltimore County",
      lat: 39.2555,
      lon: -76.7113,
      url: "https://umbc.edu/events/",
      kind: "college"
    },
    {
      name: "Mercy High School",
      lat: 39.36714,
      lon: -76.58874,
      url: "https://www.mercyhighschool.com/quicklinks/calendar",
      kind: "high_school",
      campusVenues: [
        "Mercy High School",
        "Mary Ella Marion \u201976 Court",
        "Sisters of Mercy Field",
        "Mary Ella Marion \u201976 Court, Sisters of Mercy Field",
        "The Harry and Jeanette Weinberg Auditorium",
        "The Votta Family Dining Hall"
      ],
      coordinateSource: "https://www.openstreetmap.org/way/31119916"
    },
    {
      name: "Dulaney High School",
      lat: 39.460917,
      lon: -76.612039,
      url: "https://dulaneyhs.bcps.org/calendar",
      kind: "high_school"
    },
    {
      name: "Towson High School",
      lat: 39.3914,
      lon: -76.6014,
      url: "https://towsonhs.bcps.org/calendar",
      kind: "high_school"
    },
    {
      name: "Coppin State University",
      lat: 39.31104,
      lon: -76.6581,
      url: "https://www.coppin.edu/events",
      kind: "college",
      coordinateSource: "https://www.openstreetmap.org/way/124259655"
    },
    {
      name: "Loyola University Maryland",
      lat: 39.3465,
      lon: -76.61913,
      url: "https://www.loyola.edu/events/",
      kind: "college",
      coordinateSource: "https://www.geonames.org/4361355/"
    }
  ]
};

// scripts/public-events.mjs
var import_homebase_public_data = __toESM(require_homebase_public_data(), 1);
var HOUR = 36e5;
function distanceKm(a, b) {
  const rad = (n) => n * Math.PI / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function zonedEventTime(value, timeZone) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const calendar = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  const calendarDate = new Date(Date.UTC(+calendar[1], +calendar[2] - 1, +calendar[3]));
  if (calendarDate.getUTCFullYear() !== +calendar[1] || calendarDate.getUTCMonth() + 1 !== +calendar[2] || calendarDate.getUTCDate() !== +calendar[3] || +calendar[4] > 23 || +calendar[5] > 59 || +(calendar[6] || 0) > 59) return null;
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    const stamp = Date.parse(value);
    return Number.isFinite(stamp) ? new Date(stamp).toISOString() : null;
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match || !timeZone) return null;
  const [, y, m, d, h, minute, second = "0"] = match;
  const target = Date.UTC(+y, +m - 1, +d, +h, +minute, +second);
  const check = new Date(target);
  if (check.getUTCFullYear() !== +y || check.getUTCMonth() + 1 !== +m || check.getUTCDate() !== +d || +h > 23 || +minute > 59 || +second > 59) return null;
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  } catch {
    return null;
  }
  const wallStamp = (stamp) => {
    const p = Object.fromEntries(formatter.formatToParts(new Date(stamp)).filter((p2) => p2.type !== "literal").map((p2) => [p2.type, p2.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  };
  const candidates = /* @__PURE__ */ new Set();
  for (const delta of [-24 * HOUR, 0, 24 * HOUR]) {
    const probe = target + delta, offset = wallStamp(probe) - probe, stamp = target - offset;
    if (wallStamp(stamp) === target) candidates.add(stamp);
  }
  return candidates.size === 1 ? new Date([...candidates][0]).toISOString() : null;
}
function structuredEvents(html) {
  const events = [];
  const walk = (value) => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (!value || typeof value !== "object") return;
    if ([value["@type"]].flat().some((type) => /Event$/.test(String(type)))) events.push(value);
    if (value.geo && value.event && value.name) {
      for (const event of [value.event].flat()) if (event && event.location?.name === value.name && !event.location.geo) event.location.geo = value.geo;
    }
    for (const child of Object.values(value)) if (child && typeof child === "object") walk(child);
  };
  for (const match of String(html).matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(match[1].replace(/^\s*<!--|-->\s*$/g, "")));
    } catch {
    }
  }
  return events;
}
function publishedVenueEvents(html, source) {
  if (source.adapter !== "soundstage") return [];
  const text2 = (value) => String(value).replace(/<[^>]*>/g, " ").replace(/&#(?:0?38|x26);/gi, "&").replace(/&amp;/g, "&").replace(/&#(?:0?39|x27);/gi, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
  return [...String(html).matchAll(/<article\b[^>]*data-start=["'](\d{4}-\d{2}-\d{2} \d{2}:\d{2})["'][^>]*>([\s\S]*?)<\/article>/gi)].map((match) => {
    const block = match[2], title = block.match(/<span[^>]*class=["']title["'][^>]*>([\s\S]*?)<\/span>/i), link = block.match(/href=["'](https:\/\/www\.baltimoresoundstage\.com\/events\/[^"']+)["']/i);
    return title && link ? { "@type": "MusicEvent", name: text2(title[1]), startDate: match[1].replace(" ", "T"), url: link[1], eventStatus: /cancelled|canceled/i.test(text2(block)) ? "EventCancelled" : "EventScheduled", location: { name: source.venue.name, geo: { latitude: source.venue.lat, longitude: source.venue.lon } } } : null;
  }).filter(Boolean);
}
function safeUrl(value, fallback) {
  try {
    const url = new URL(value || fallback, fallback);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
function publishedAttendance(event, sourceUrl) {
  const count = Number(event.expectedAttendance);
  return event.expectedAttendance != null && Number.isFinite(count) && count >= 0 && count <= 1e6 && /^https:\/\//.test(sourceUrl || "") ? { expectedAttendance: count, attendanceBasis: "organizer_estimate", attendanceSourceUrl: sourceUrl, attendanceConfidence: 0.75 } : {};
}
function normalizePublicEvent(event, market, source, now = Date.now()) {
  if (event.private || event.allDay || event.isAllDay || /cancel|postpon|reschedul/i.test(String(event.eventStatus || "")) || /OnlineEventAttendanceMode/.test(String(event.eventAttendanceMode || ""))) return null;
  const start = zonedEventTime(event.startDate, market.timeZone);
  if (!start) return null;
  const reportedEnd = zonedEventTime(event.endDate, market.timeZone);
  const end = reportedEnd && Date.parse(reportedEnd) > Date.parse(start) ? reportedEnd : null;
  if ((end ? Date.parse(end) < now - 90 * 6e4 : Date.parse(start) < now - 6 * HOUR) || Date.parse(start) > now + 36 * HOUR) return null;
  const venue = [event.location].flat().find((place) => place && typeof place === "object");
  const geo = venue?.geo;
  const known = (source.venues || []).find((place) => place.name.toLowerCase() === String(venue?.name || "").toLowerCase());
  const lat = geo?.latitude == null ? known?.lat : Number(geo.latitude), lon = geo?.longitude == null ? known?.lon : Number(geo.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || distanceKm(market.center, { lat, lon }) > market.radiusKm) return null;
  const name = String(event.name || "").trim(), eventType = [event["@type"]].flat().join(" ");
  const context = [name, venue?.name, eventType, event.description].join(" ");
  if (!name || import_homebase_public_data.default.isTicketAddon(name) || /webinar|virtual|online.only|exhibition|gallery|workshop|seminar|campus.tour|all.day.entry|standard.entry|standard.admission|standard.experience/i.test(context)) return null;
  const performers = [event.performer].flat().filter(Boolean);
  const classification = performers.map((p) => p["@type"]).flat().join(" ");
  if (!/sports|concert|festival|convention|conference|football|basketball|baseball|hockey|soccer|stadium|arena|theatre|theater|comedy|performing|music|graduation|commencement|fairground|circus|danceevent|homecoming|prom\b|tailgate|bonfire|reunion|gala|party|social|community|screening/i.test(context + " " + classification)) return null;
  const url = safeUrl(event.url || event.offers?.url, source.url);
  return { id: "public:" + (url || `${name}:${lat}:${lon}`) + ":" + start, name: name.slice(0, 180), venue: String(venue?.name || known?.name || "").slice(0, 160), lat, lon, eventStart: start, eventEnd: end, url, source: source.name, sourceUrl: source.url, eventType, classification, ...publishedAttendance(event, url || source.url), fetchedAt: new Date(now).toISOString() };
}

// scripts/school-events.mjs
var DAY = 864e5;
var text = (s) => String(s || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
var token = (s) => text(s).toLowerCase().replace(/[^a-z0-9]/g, "");
function schoolEventRelevant(value) {
  const s = text(value).toLowerCase();
  if (/virtual|webinar|cancelled|canceled|postponed|reschedul|practice|rehearsal|office hours|class meeting|advising|club meeting|exam|registration deadline|ticket sale|volunteer application|cabanas|vip upgrade|parking pass|spirit week|dress.up|seminar|workshop|campus tour/.test(s)) return false;
  return /homecoming|prom\b|football|basketball|soccer|volleyball|baseball|lacrosse|hockey|concert|performance|theatre|theater|musical|graduation|commencement|festival|gala|reunion|tailgate|bonfire|carnival|dance\b|family weekend|parents.weekend|pep rally/.test(s);
}
function publicSchoolUrl(value, base) {
  try {
    const u = new URL(String(value).replace(/^webcal:/, "https:").replace(/&amp;/g, "&"), base);
    if (u.protocol !== "https:" || u.username || u.password || u.port && u.port !== "443" || !u.hostname.includes(".") || /[:\[\]]/.test(u.hostname) || /^\d+(?:\.\d+){3}$/.test(u.hostname) || /(^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname)) return null;
    return u.href;
  } catch {
    return null;
  }
}
function publicAddress(address) {
  if (address.includes(":")) return /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:db8:/i.test(address);
  const a = address.split(".").map(Number);
  if (a.length !== 4 || a.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return !(a[0] === 0 || a[0] === 10 || a[0] === 127 || a[0] >= 224 || a[0] === 169 && a[1] === 254 || a[0] === 172 && a[1] >= 16 && a[1] <= 31 || a[0] === 192 && [0, 168].includes(a[1]) || a[0] === 100 && a[1] >= 64 && a[1] <= 127 || a[0] === 198 && [18, 19, 51].includes(a[1]) || a[0] === 203 && a[1] === 0 && a[2] === 113);
}
async function schoolPage(url, request = fetch, lookup) {
  if (request === fetch && !lookup) lookup = async (host) => (await import("node:dns/promises")).resolve4(host);
  for (let hop = 0; hop < 4; hop++) {
    url = publicSchoolUrl(url);
    if (!url) throw Error("Invalid public calendar URL");
    if (lookup) {
      const addresses = await lookup(new URL(url).hostname);
      if (!addresses.length || addresses.some((a) => !publicAddress(a))) throw Error("Calendar host is not public");
    }
    const r = await request(url, { redirect: "manual", signal: AbortSignal.timeout(7e3), headers: { Accept: "text/html, text/calendar, application/json", "User-Agent": "HomeBase public school calendars (+https://github.com/Home-base-drivers/Home-base-app)" } });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      url = publicSchoolUrl(r.headers.get("location"), url);
      continue;
    }
    if (!r.ok) throw Error("Calendar unavailable");
    if (Number(r.headers?.get("content-length")) > 3e6) throw Error("Calendar too large");
    const body = await r.text();
    if (body.length > 3e6) throw Error("Calendar too large");
    return { url, body };
  }
  throw Error("Too many calendar redirects");
}
function schoolCalendarLinks(html, base) {
  const out = [];
  for (const m of String(html).matchAll(/<(?:a|link)\b[^>]*(?:href)=["']([^"']+)["'][^>]*>(?:([^<]*)<\/a>)?/gi)) {
    const url = publicSchoolUrl(m[1], base);
    if (!url || !/calendar|events?|athletic|homecoming|\.ics|ical|webcal/i.test(url + " " + m[2])) continue;
    if (/login|signin|sign-in|logout|oauth|private/i.test(url)) continue;
    out.push({ url, priority: /\.ics|ical|webcal/i.test(url) ? 3 : schoolEventRelevant(m[2]) ? 2 : /calendar|homecoming|athletic/i.test(url) ? 1 : 0 });
  }
  return [...new Set(out.sort((a, b) => b.priority - a.priority).map((x) => x.url))];
}
function icsTime(value, zone) {
  const m = String(value).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  return m ? zonedEventTime(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || "00"}${m[7] || ""}`, zone) : null;
}
function schoolIcsEvents(body, timeZone) {
  const events = [];
  let recurrenceLimited = false;
  const unfolded = String(body).replace(/\r?\n[ \t]/g, "");
  for (const block of unfolded.matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/g)) {
    const props = {};
    for (const line of block[1].split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const header = line.slice(0, i), key = header.split(";")[0];
      props[key] = { header, value: line.slice(i + 1).replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1") };
    }
    const start = props.DTSTART;
    if (!start || props.STATUS?.value === "CANCELLED" || props.CLASS && props.CLASS.value !== "PUBLIC") continue;
    if (props.RRULE) {
      recurrenceLimited = true;
      continue;
    }
    const zone = start.header.match(/TZID=([^;:]+)/)?.[1]?.replace(/^"|"$/g, "") || timeZone;
    const startDate = icsTime(start.value, zone) || (/^\d{8}$/.test(start.value) ? start.value.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3") : null);
    if (!startDate) continue;
    const geo = props.GEO?.value.split(";").map(Number);
    events.push({ "@type": "Event", name: props.SUMMARY?.value, startDate, endDate: icsTime(props.DTEND?.value, props.DTEND?.header.match(/TZID=([^;:]+)/)?.[1] || zone), location: { name: props.LOCATION?.value || "", ...geo?.length === 2 ? { geo: { latitude: geo[0], longitude: geo[1] } } : {} }, url: props.URL?.value, description: props.DESCRIPTION?.value });
  }
  return { events, recurrenceLimited };
}
function blackbaudSchoolEvents(html) {
  const rows = [];
  for (const m of String(html).matchAll(/<div\b[^>]*class=["'][^"']*event-detail[^"']*["'][^>]*>([\s\S]*?)(?=<\/li>)/gi)) {
    const b = m[1], title = b.match(/<h4[^>]*class=["'][^"']*event-title[^"']*["'][^>]*>([\s\S]*?)<\/h4>/i)?.[1], date = text(b.match(/class=["']start-date["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]), start = text(b.match(/class=["']start-time["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]), end = text(b.match(/class=["']end-time["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]).replace(/^to\s*/, ""), location = text(b.match(/class=["']location["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]);
    const d = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/), clock = (s2) => {
      const t = s2.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      return t && +t[1] >= 1 && +t[1] <= 12 ? String(+t[1] % 12 + (t[3].toUpperCase() === "PM" ? 12 : 0)).padStart(2, "0") + ":" + t[2] + ":00" : null;
    };
    if (!d || !title) continue;
    const day = `${d[3]}-${d[1].padStart(2, "0")}-${d[2].padStart(2, "0")}`, s = clock(start), e = clock(end);
    rows.push({ "@type": "Event", name: text(title), startDate: day + (s ? "T" + s : ""), endDate: e ? day + "T" + e : null, url: title.match(/href=["']([^"']+)/i)?.[1], location: { name: location } });
  }
  return rows;
}
function normalizeSchoolEvent(e, school, market, sourceUrl, now = Date.now()) {
  if (!schoolEventRelevant([e.name, e.description, e.eventStatus].join(" ")) || /OnlineEventAttendanceMode/.test(e.eventAttendanceMode || "") || e.private) return null;
  const name = text(e.name), location = [e.location].flat().find((v) => v && typeof v === "object") || {}, venue = text(location.name), geo = location.geo;
  let lat = geo?.latitude == null ? null : Number(geo.latitude), lon = geo?.longitude == null ? null : Number(geo.longitude);
  const onsite = token(venue) === token(school.name) || /^(?:home|campus|on campus)$/i.test(venue) || school.campusVenues?.some((v) => token(v) === token(venue));
  if (lat === null && lon === null && onsite) {
    lat = school.lat;
    lon = school.lon;
  }
  if (lat === null || lon === null || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || distanceKm(market.center, { lat, lon }) > market.radiusKm) return null;
  const url = publicSchoolUrl(e.url, sourceUrl) || sourceUrl, start = zonedEventTime(e.startDate, market.timeZone), end = zonedEventTime(e.endDate, market.timeZone);
  const common = { id: `school:${url}:${e.startDate}`, name, venue: venue || school.name, lat, lon, url, source: school.name + " public calendar", sourceUrl, fetchedAt: new Date(now).toISOString(), eventType: "school_event " + (e["@type"] || "Event"), classification: school.kind || "school", attendance: null, locationPrecision: geo ? "venue" : "campus" };
  if (!start) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.startDate || "")) return null;
    const day = Date.parse(e.startDate + "T12:00:00Z");
    if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== e.startDate || day < now - DAY || day > now + 7 * DAY) return null;
    return { ...common, eventDate: e.startDate, eventStart: null, eventEnd: null, timePrecision: "date", demandEligible: false };
  }
  const finish = end && Date.parse(end) > Date.parse(start) ? end : null;
  if (Date.parse(start) > now + 7 * DAY || (finish ? Date.parse(finish) < now - 90 * 6e4 : Date.parse(start) < now - 6 * 36e5)) return null;
  return { ...common, eventStart: start, eventEnd: finish, timePrecision: "minute", demandEligible: true };
}
function schoolsFromOsm(payload, market) {
  const seen = /* @__PURE__ */ new Set();
  return (payload?.elements || []).flatMap((e) => {
    const t = e.tags || {}, lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon, name = t.name, website = publicSchoolUrl(t.website || t["contact:website"]);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || distanceKm(market.center, { lat, lon }) > market.radiusKm) return [];
    if (!/university|college/.test(t.amenity || "") && /elementary|primary|kindergarten|nursery|middle school/i.test(name + " " + (t["school:level"] || ""))) return [];
    const key = token(name) + ":" + Math.round(lat * 1e3) + ":" + Math.round(lon * 1e3);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ name, lat, lon, url: website, kind: /university|college/.test(t.amenity || "") ? "college" : "high_school", coordinateSource: `https://www.openstreetmap.org/${e.type}/${e.id}` }];
  }).sort((a, b) => distanceKm(market.center, a) - distanceKm(market.center, b));
}
async function discoverSchools(market, request = fetch) {
  const radius = Math.min(65e3, market.radiusKm * 1e3), query = `[out:json][timeout:12];nwr(around:${radius},${market.center.lat},${market.center.lon})[name][amenity~"^(school|college|university)$"];out center tags 1000;`;
  for (const base of ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"]) try {
    const u = new URL(base);
    u.searchParams.set("data", query);
    const r = await request(u, { signal: AbortSignal.timeout(15e3), headers: { Accept: "application/json", "User-Agent": "HomeBase public school calendar discovery (+https://github.com/Home-base-drivers/Home-base-app)" } });
    if (!r.ok) continue;
    const p = await r.json();
    return { schools: schoolsFromOsm(p, market), status: p.remark || p.elements?.length >= 1e3 ? "partial" : "active" };
  } catch {
  }
  try {
    const q = `SELECT ?school ?schoolLabel ?location ?website WHERE { SERVICE wikibase:around { ?school wdt:P625 ?location . bd:serviceParam wikibase:center "Point(${market.center.lon} ${market.center.lat})"^^geo:wktLiteral . bd:serviceParam wikibase:radius "${market.radiusKm}" . } VALUES ?class { wd:Q3914 wd:Q3918 wd:Q189533 } ?school wdt:P31/wdt:P279* ?class . OPTIONAL { ?school wdt:P856 ?website . } SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . } } LIMIT 500`, u = new URL("https://query.wikidata.org/sparql");
    u.searchParams.set("query", q);
    u.searchParams.set("format", "json");
    const r = await request(u, { signal: AbortSignal.timeout(15e3), headers: { Accept: "application/sparql-results+json", "User-Agent": "HomeBase public school calendar discovery" } });
    if (r.ok) {
      const p = await r.json();
      return { schools: schoolsFromWikidata(p, market), status: "partial" };
    }
  } catch {
  }
  return { schools: [], status: "unavailable" };
}
function schoolsFromWikidata(payload, market) {
  const seen = /* @__PURE__ */ new Set();
  return (payload?.results?.bindings || []).flatMap((b) => {
    const coords = b.location?.value?.match(/^Point\((-?[\d.]+) (-?[\d.]+)\)$/), name = b.schoolLabel?.value, id = b.school?.value;
    if (!coords || !name || /^(?:Q\d+)$|primary|elementary|kindergarten|nursery|middle school/i.test(name) || !/^https?:\/\/www.wikidata.org\/entity\/Q\d+$/.test(id || "")) return [];
    const lat = Number(coords[2]), lon = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || distanceKm(market.center, { lat, lon }) > market.radiusKm || seen.has(id)) return [];
    seen.add(id);
    return [{ name, lat, lon, url: publicSchoolUrl(b.website?.value), kind: /university|college/i.test(name) ? "college" : "high_school", coordinateSource: id.replace("http:", "https:") }];
  });
}
function digitalSportsEvents(html, schools = []) {
  const rows = [];
  for (const m of String(html).matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>\s*<table\b[^>]*class=["']schedule-table["'][^>]*>([\s\S]*?)<\/table>/gi)) {
    const d = text(m[1]).match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})/i);
    if (!d) continue;
    const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"], day = `${d[3]}-${String(months.indexOf(d[1].toLowerCase()) + 1).padStart(2, "0")}-${d[2].padStart(2, "0")}`;
    for (const row of m[2].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
      if (cells.length < 3 || /cancel|postpon|<strike/i.test(row[1])) continue;
      const clock = text(cells[0]).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (!clock || +clock[1] > 12) continue;
      const links = [...cells[2].matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)], last = links.at(-1), venue = text(last?.[2]);
      const place = schools.find((s) => token(s.name) === token(venue) || s.campusVenues?.some((v) => token(v) === token(venue)));
      if (!place) continue;
      rows.push({ "@type": "SportsEvent", name: text(cells[1]) + " \xB7 " + text(cells[2]).split("@")[0], startDate: day + "T" + String(+clock[1] % 12 + (clock[3].toUpperCase() === "PM" ? 12 : 0)).padStart(2, "0") + ":" + clock[2] + ":00", url: last?.[1], location: { name: venue, geo: { latitude: place.lat, longitude: place.lon } } });
    }
  }
  return rows;
}
async function readSchoolCalendar(school, market, now = Date.now(), request = fetch, lookup) {
  if (!school.url) return { source: { name: school.name, url: null, status: "no_public_website", pages: 0, eventCount: 0 }, events: [], context: [] };
  const events = [], context = [], visited = /* @__PURE__ */ new Set(), queue = [school.url];
  let parsed = false, limited = false, failed = false, loaded = 0;
  for (let page = 0; queue.length && page < 5; page++) {
    const url = queue.shift();
    if (visited.has(url)) {
      page--;
      continue;
    }
    visited.add(url);
    try {
      const result2 = await schoolPage(url, request, lookup), body = result2.body;
      loaded++;
      let rows = [];
      if (school.adapter === "digitalsports") {
        rows = digitalSportsEvents(body, school.venues);
        parsed = /schedule-table/.test(body);
        limited = true;
      } else if (/BEGIN:VCALENDAR/.test(body)) {
        const ics = schoolIcsEvents(body, market.timeZone);
        rows = ics.events;
        limited ||= ics.recurrenceLimited;
        parsed = true;
      } else if (school.adapter === "localist" || /localist\.com|localist\.net|localist_platform/i.test(body)) {
        if (body.trim().startsWith("{")) {
          const payload = JSON.parse(body);
          parsed = true;
          limited ||= Number(payload.page?.total) > 100;
          rows = (payload.events || []).flatMap((w) => {
            const e = w.event;
            if (!e || e.private || e.rejected || e.experience === "virtual" || e.publish_status !== "published") return [];
            return (e.event_instances || []).map((i) => ({ "@type": "Event", name: e.title, startDate: i.event_instance?.start, endDate: i.event_instance?.end, url: e.localist_url, eventStatus: e.status, location: { name: e.location_name, geo: { latitude: e.geo?.latitude, longitude: e.geo?.longitude } }, description: Object.values(e.filters || {}).flat().map((f) => f.name).join(" ") }));
          });
        } else {
          const start = new Date(now - DAY).toISOString().slice(0, 10);
          queue.unshift(new URL("/api/2/events?start=" + start + "&days=9&pp=100", result2.url).href);
        }
      } else {
        rows = [...structuredEvents(body), ...blackbaudSchoolEvents(body)];
        parsed ||= rows.length > 0;
        const links = schoolCalendarLinks(body, result2.url);
        queue.push(...links.filter((link) => !visited.has(link)));
      }
      for (const row of rows) {
        const e = normalizeSchoolEvent(row, school, market, result2.url, now);
        if (e) (e.demandEligible ? events : context).push(e);
      }
    } catch {
      failed = true;
    }
  }
  limited ||= queue.some((u) => !visited.has(u));
  const unique = (rows) => [...new Map(rows.map((e) => [token(e.name) + ":" + e.lat.toFixed(3) + ":" + e.lon.toFixed(3) + ":" + (e.eventStart || e.eventDate), e])).values()];
  const result = unique(events), dates = unique(context);
  return { source: { name: school.name, url: school.url, status: !parsed ? "unavailable" : failed || limited ? "partial" : "active", pages: loaded, eventCount: result.length, dateOnlyCount: dates.length, truncated: limited, fetchedAt: parsed ? new Date(now).toISOString() : null }, events: result, context: dates };
}
async function schoolCalendars(market, schools, now = Date.now(), request = fetch, lookup) {
  let next = 0;
  const results = [];
  await Promise.all(Array.from({ length: Math.min(6, schools.length) }, async () => {
    while (next < schools.length) {
      const school = schools[next++];
      results.push(await readSchoolCalendar(school, market, now, request, lookup));
    }
  }));
  return { status: results.some((r) => ["active", "partial"].includes(r.source.status)) ? "partial" : "unavailable", fetchedAt: new Date(now).toISOString(), sources: results.map((r) => r.source), events: results.flatMap((r) => r.events), context: results.flatMap((r) => r.context) };
}

// config/provider-markets.json
var provider_markets_default = {
  schemaVersion: 2,
  markets: [
    {
      id: "baltimore",
      name: "Baltimore",
      center: {
        lat: 39.2904,
        lon: -76.6122
      },
      radiusKm: 58,
      flightawareAirport: {
        id: "KBWI",
        name: "BWI Airport",
        lat: 39.1774,
        lon: -76.6684
      },
      uberDestinations: [
        {
          name: "Downtown Baltimore",
          lat: 39.2904,
          lon: -76.6122
        },
        {
          name: "BWI Airport",
          lat: 39.1774,
          lon: -76.6684
        }
      ],
      sampleAreas: [
        {
          name: "Downtown",
          lat: 39.2904,
          lon: -76.6122
        },
        {
          name: "Inner Harbor",
          lat: 39.2851,
          lon: -76.6132
        },
        {
          name: "Harbor East",
          lat: 39.2831,
          lon: -76.6022
        },
        {
          name: "Fells Point",
          lat: 39.2825,
          lon: -76.5934
        },
        {
          name: "Canton",
          lat: 39.2803,
          lon: -76.5754
        },
        {
          name: "Federal Hill",
          lat: 39.275,
          lon: -76.6135
        },
        {
          name: "Mount Vernon",
          lat: 39.2984,
          lon: -76.6157
        },
        {
          name: "Station North",
          lat: 39.3114,
          lon: -76.6162
        },
        {
          name: "Charles Village",
          lat: 39.3271,
          lon: -76.619
        },
        {
          name: "Johns Hopkins Medical",
          lat: 39.2973,
          lon: -76.5903
        },
        {
          name: "Morgan State",
          lat: 39.3448,
          lon: -76.5844
        },
        {
          name: "West Baltimore",
          lat: 39.2998,
          lon: -76.6497
        },
        {
          name: "Hampden",
          lat: 39.3314,
          lon: -76.6315
        },
        {
          name: "Roland Park",
          lat: 39.3537,
          lon: -76.635
        },
        {
          name: "Waverly",
          lat: 39.3298,
          lon: -76.607
        },
        {
          name: "Hamilton-Lauraville",
          lat: 39.3564,
          lon: -76.5655
        },
        {
          name: "Belair-Edison",
          lat: 39.3169,
          lon: -76.5733
        },
        {
          name: "Highlandtown",
          lat: 39.2862,
          lon: -76.5688
        },
        {
          name: "Locust Point",
          lat: 39.2681,
          lon: -76.5904
        },
        {
          name: "Cherry Hill",
          lat: 39.2522,
          lon: -76.6216
        },
        {
          name: "Brooklyn",
          lat: 39.2387,
          lon: -76.6037
        },
        {
          name: "Catonsville",
          lat: 39.2721,
          lon: -76.7319
        },
        {
          name: "Arbutus",
          lat: 39.2546,
          lon: -76.6997
        },
        {
          name: "Towson",
          lat: 39.4015,
          lon: -76.6019
        },
        {
          name: "Parkville",
          lat: 39.3773,
          lon: -76.5397
        },
        {
          name: "Pikesville",
          lat: 39.3743,
          lon: -76.7225
        },
        {
          name: "Owings Mills",
          lat: 39.4195,
          lon: -76.7803
        },
        {
          name: "White Marsh",
          lat: 39.3837,
          lon: -76.4586
        },
        {
          name: "Essex",
          lat: 39.3093,
          lon: -76.475
        },
        {
          name: "Dundalk",
          lat: 39.2507,
          lon: -76.5205
        },
        {
          name: "Glen Burnie",
          lat: 39.1626,
          lon: -76.6247
        },
        {
          name: "BWI Airport",
          lat: 39.1774,
          lon: -76.6684
        },
        {
          name: "Columbia",
          lat: 39.2037,
          lon: -76.861
        },
        {
          name: "Ellicott City",
          lat: 39.2673,
          lon: -76.7983
        },
        {
          name: "Timonium",
          lat: 39.4371,
          lon: -76.6197
        },
        {
          name: "Cockeysville",
          lat: 39.4812,
          lon: -76.6439
        },
        {
          name: "Rosedale",
          lat: 39.3201,
          lon: -76.5155
        },
        {
          name: "Middle River",
          lat: 39.3343,
          lon: -76.4394
        },
        {
          name: "Brooklyn Park",
          lat: 39.2284,
          lon: -76.6164
        },
        {
          name: "Annapolis",
          lat: 38.9784,
          lon: -76.4922
        }
      ],
      countryCode: "US",
      timeZone: "America/New_York",
      placeRadiusKm: 20,
      publicCalendars: [
        {
          name: "Ticketmaster Baltimore public listings",
          url: "https://www.ticketmaster.com/discover/baltimore",
          maxPages: 6
        },
        {
          name: "Baltimore Soundstage calendar",
          url: "https://www.baltimoresoundstage.com/calendar/",
          adapter: "soundstage",
          venue: {
            name: "Baltimore Soundstage",
            lat: 39.2875169,
            lon: -76.607604,
            coordinateSource: "https://baltimore.org/listings/baltimore-soundstage/"
          }
        },
        {
          name: "Nevermore Hall published AXS calendar",
          url: "https://www.axs.com/venues/134269/nevermore-hall-baltimore-tickets",
          nextOnly: true
        },
        {
          name: "Ottobar published AXS calendar",
          url: "https://www.axs.com/venues/128508/ottobar-baltimore-tickets",
          nextOnly: true
        },
        {
          name: "Power Plant Live district calendar",
          url: "https://powerplantlive.com/events-and-entertainment/events",
          followEvents: true,
          venues: [
            {
              name: "Power Plant Live!",
              lat: 39.28936,
              lon: -76.60689,
              coordinateSource: "Home Base existing mapped venue anchor",
              locationPrecision: "venue_complex"
            },
            {
              name: "Luckie's Tavern",
              lat: 39.28936,
              lon: -76.60689,
              coordinateSource: "Home Base existing mapped venue anchor",
              locationPrecision: "venue_complex"
            }
          ]
        },
        {
          name: "Baltimore Convention Center calendar",
          url: "https://www.bccenter.org/events",
          followEvents: true,
          venues: [
            {
              name: "Baltimore Convention Center",
              lat: 39.28578,
              lon: -76.61802,
              coordinateSource: "Home Base existing mapped venue anchor",
              locationPrecision: "venue"
            }
          ]
        },
        {
          name: "CFG Bank Arena calendar",
          url: "https://cfgbankarena.com/events/",
          followEvents: true,
          venues: [
            {
              name: "CFG Bank Arena",
              lat: 39.28861,
              lon: -76.61889,
              coordinateSource: "Home Base existing mapped venue anchor",
              locationPrecision: "venue"
            }
          ]
        },
        {
          name: "M&T Bank Stadium calendar",
          url: "https://www.mandtbankstadium.com/events",
          followEvents: true,
          venues: [
            {
              name: "M&T Bank Stadium",
              lat: 39.278,
              lon: -76.6227,
              coordinateSource: "Home Base existing mapped venue anchor",
              locationPrecision: "venue"
            }
          ]
        },
        {
          name: "Maryland Stadium Authority events",
          url: "https://mdstad.com/events",
          followEvents: true,
          venues: [
            {
              name: "M&T Bank Stadium",
              lat: 39.278,
              lon: -76.6227,
              coordinateSource: "Home Base existing mapped venue anchor",
              locationPrecision: "venue"
            },
            {
              name: "Oriole Park at Camden Yards",
              lat: 39.2838,
              lon: -76.6217,
              coordinateSource: "Home Base existing mapped venue anchor",
              locationPrecision: "venue"
            }
          ]
        },
        {
          name: "Orioles Camden Yards calendar",
          url: "https://www.mlb.com/orioles/schedule",
          followEvents: true,
          venues: [
            {
              name: "Oriole Park at Camden Yards",
              lat: 39.2838,
              lon: -76.6217,
              coordinateSource: "Home Base existing mapped venue anchor",
              locationPrecision: "venue"
            }
          ]
        },
        {
          name: "Pier Six Pavilion calendar",
          url: "https://piersixbaltimore.com/event-dates/",
          followEvents: true,
          venues: [
            {
              name: "Pier Six Pavilion",
              lat: 39.284,
              lon: -76.6043,
              coordinateSource: "Home Base existing mapped venue anchor",
              locationPrecision: "venue"
            }
          ]
        },
        {
          name: "Maryland State Fairgrounds calendar",
          url: "https://marylandstatefair.com/events/",
          followEvents: true,
          venues: [
            {
              name: "Maryland State Fairgrounds",
              lat: 39.4371,
              lon: -76.6197,
              coordinateSource: "Home Base existing mapped venue anchor",
              locationPrecision: "venue"
            }
          ]
        },
        {
          name: "Baltimore City Recreation & Parks events",
          url: "https://www.baltimorecity.gov/bcrp/events",
          followEvents: true,
          venues: []
        },
        {
          name: "Baltimore City recreation sports calendar",
          url: "https://www.bcrpsports.org/calendar",
          followEvents: true,
          venues: []
        },
        {
          name: "Baltimore County Recreation & Parks calendar",
          url: "https://recandparks.baltimorecountymd.gov/MD/baltimore-co-md/catalog",
          followEvents: true,
          venues: []
        },
        {
          name: "Lake Roland calendar",
          url: "https://www.lakeroland.org/calendar/",
          followEvents: true,
          venues: []
        },
        {
          name: "Baltimore Peninsula calendar",
          url: "https://baltimorepeninsula.com/whats-happening/",
          followEvents: true,
          venues: []
        },
        {
          name: "Visit Baltimore community and venue calendar",
          url: "https://baltimore.org/events/",
          followEvents: true,
          venues: []
        }
      ]
    },
    {
      id: "north-jersey",
      name: "North Jersey",
      center: {
        lat: 40.94454,
        lon: -74.07542
      },
      radiusKm: 65,
      placeRadiusKm: 20,
      countryCode: "US",
      timeZone: "America/New_York",
      sampleAreas: [],
      uberDestinations: [],
      publicCalendars: [
        {
          name: "Ticketmaster New York public calendar",
          url: "https://www.ticketmaster.com/discover/new-york-city",
          maxPages: 6
        }
      ]
    },
    {
      id: "new-york",
      name: "New York",
      center: {
        lat: 40.758,
        lon: -73.9855
      },
      radiusKm: 65,
      placeRadiusKm: 20,
      countryCode: "US",
      timeZone: "America/New_York",
      sampleAreas: [],
      uberDestinations: [],
      publicCalendars: [
        {
          name: "Ticketmaster New York public calendar",
          url: "https://www.ticketmaster.com/discover/new-york-city",
          maxPages: 6
        }
      ]
    },
    {
      id: "london",
      name: "London",
      center: {
        lat: 51.5074,
        lon: -0.1278
      },
      radiusKm: 65,
      placeRadiusKm: 25,
      countryCode: "GB",
      timeZone: "Europe/London",
      sampleAreas: [],
      uberDestinations: [],
      publicCalendars: [
        {
          name: "Ticketmaster London public calendar",
          url: "https://www.ticketmaster.co.uk/discover/london",
          maxPages: 6
        },
        {
          name: "Hamilton published performances",
          url: "https://www.ticketmaster.co.uk/hamilton-tickets/artist/5218048?venueId=434783"
        },
        {
          name: "Les Mis\xE9rables published performances",
          url: "https://www.ticketmaster.co.uk/les-miserables-tickets/artist/803968?venueId=434617"
        },
        {
          name: "The Book of Mormon published performances",
          url: "https://www.ticketmaster.co.uk/the-book-of-mormon-london-tickets/artist/1747137"
        },
        {
          name: "Beetlejuice published performances",
          url: "https://www.ticketmaster.co.uk/beetlejuice-the-musical-tickets/artist/5376080"
        },
        {
          name: "Avenue Q published performances",
          url: "https://www.ticketmaster.co.uk/avenue-q-tickets/artist/973986"
        },
        {
          name: "Sinatra published performances",
          url: "https://www.ticketmaster.co.uk/sinatra-the-musical-tickets/artist/5674208"
        }
      ]
    }
  ]
};

// scripts/venue-calendars.mjs
var import_homebase_public_data2 = __toESM(require_homebase_public_data(), 1);
function registeredVenueCalendars(market) {
  return [...new Map(provider_markets_default.markets.filter((m) => distanceKm(market.center, m.center) <= m.radiusKm + market.radiusKm).flatMap((m) => m.publicCalendars || []).map((s) => [s.url, { ...s, kind: "venue" }])).values()];
}
function venuesFromOsm(payload, market) {
  return (payload?.elements || []).flatMap((e) => {
    const t = e.tags || {}, lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon, url = publicSchoolUrl(t.website || t["contact:website"]);
    if (!url || !t.name || !Number.isFinite(lat) || !Number.isFinite(lon) || distanceKm(market.center, { lat, lon }) > market.radiusKm) return [];
    return [{ name: t.name + " public calendar", url, kind: "venue", followEvents: true, venues: [{ name: t.name, lat, lon, coordinateSource: `https://www.openstreetmap.org/${e.type}/${e.id}` }] }];
  });
}
async function discoverVenueCalendars(market, request = fetch) {
  const query = `[out:json][timeout:12];(nwr(around:${market.radiusKm * 1e3},${market.center.lat},${market.center.lon})[name][leisure~"^(stadium|park|sports_centre)$"];nwr(around:${market.radiusKm * 1e3},${market.center.lat},${market.center.lon})[name][amenity~"^(theatre|arts_centre|events_venue|conference_centre|nightclub)$"];);out center tags 1000;`;
  for (const base of ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"]) try {
    const url = new URL(base);
    url.searchParams.set("data", query);
    const r = await request(url, { signal: AbortSignal.timeout(15e3) });
    if (!r.ok) continue;
    const p = await r.json();
    return { sources: venuesFromOsm(p, market), status: p.remark || p.elements?.length >= 1e3 ? "partial" : "active" };
  } catch {
  }
  return { sources: [], status: "unavailable" };
}
async function readVenueCalendar(source, market, now = Date.now(), request = fetch, lookup) {
  const queue = [source.url], visited = /* @__PURE__ */ new Set(), events = [], context = [];
  let pages = 0, parsed = false, failed = false, limited = false;
  for (let n = 0; queue.length && n < 4; n++) {
    const url = queue.shift(), key = url.toLowerCase();
    if (visited.has(key)) {
      n--;
      continue;
    }
    visited.add(key);
    try {
      const result = await schoolPage(url, request, lookup);
      pages++;
      const ics = /BEGIN:VCALENDAR/.test(result.body) ? schoolIcsEvents(result.body, market.timeZone) : null;
      const records = ics?.events || [...structuredEvents(result.body), ...publishedVenueEvents(result.body, source)];
      parsed ||= !!ics || records.length > 0;
      limited ||= !!ics?.recurrenceLimited;
      for (const row of records) {
        const event = normalizePublicEvent(row, market, source, now);
        if (event) events.push({ ...event, demandEligible: true, timePrecision: "minute", locationPrecision: row.location?.geo ? "venue" : source.venues?.find((v) => v.name.toLowerCase() === String(event.venue).toLowerCase())?.locationPrecision || "venue" });
        else if (/^\d{4}-\d{2}-\d{2}$/.test(row.startDate || "") && Date.parse(row.startDate + "T12:00:00Z") >= now - 864e5 && Date.parse(row.startDate + "T12:00:00Z") <= now + 7 * 864e5) context.push({ name: row.name, eventDate: row.startDate, id: source.url + ":" + row.name + ":" + row.startDate, demandEligible: false });
      }
      if (source.followEvents) {
        const origin = new URL(result.url).origin;
        queue.push(...schoolCalendarLinks(result.body, result.url).filter((u) => new URL(u).origin === origin && /(?:\/events?\/[^/?]+|\.ics(?:\?|$)|[?&]ical)/i.test(u) && !visited.has(u.toLowerCase()) && !queue.includes(u)));
      }
    } catch {
      failed = true;
    }
  }
  limited ||= queue.length > 0;
  return { source: { name: source.name, url: source.url, status: !parsed ? "unavailable" : failed || limited ? "partial" : "active", pages, eventCount: events.length, truncated: limited, fetchedAt: parsed ? new Date(now).toISOString() : null }, events: [...new Map(events.map((e) => [import_homebase_public_data2.default.eventIdentity(e), e])).values()], context };
}
async function venueCalendars(market, sources, now = Date.now(), request = fetch, lookup) {
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, sources.length) }, async () => {
    while (next < sources.length) results.push(await readVenueCalendar(sources[next++], market, now, request, lookup));
  }));
  return { status: results.length && results.every((r) => r.source.status === "active") ? "active" : results.some((r) => r.source.status !== "unavailable") ? "partial" : "unavailable", fetchedAt: new Date(now).toISOString(), sources: results.map((r) => r.source), events: [...new Map(results.flatMap((r) => r.events).map((e) => [import_homebase_public_data2.default.eventIdentity(e), e])).values()], context: results.flatMap((r) => r.context) };
}

// scripts/school-service.mjs
function schoolSearchMarket(input) {
  const lat = Number(input?.lat), lon = Number(input?.lon);
  if (input?.lat == null || input?.lon == null || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw Error("A valid location is required");
  const timeZone = String(input.timeZone || "");
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
  } catch {
    throw Error("A valid local timezone is required");
  }
  return { center: { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 }, radiusKm: Math.min(65, Math.max(10, Number(input.radiusKm) || 35)), timeZone };
}
function mergeSchoolRegistry(market, discovered = []) {
  const seeds = school_calendar_sources_default.sources.filter((s) => distanceKm(market.center, s) <= market.radiusKm), rows = [...seeds];
  for (const s of discovered) if (!rows.some((r) => r.name.toLowerCase() === s.name.toLowerCase() && distanceKm(r, s) < 2)) rows.push(s);
  return rows;
}
function districtSchoolCalendars(market, schools) {
  if (distanceKm(market.center, { lat: 39.29, lon: -76.61 }) > 65) return [];
  return [{ name: "Baltimore City public school athletics", url: "https://baltimorecityschoolsathletics.digitalsports.com/pages/schedule/league-schedule.php", adapter: "digitalsports", venues: schools }, { name: "Baltimore County public school athletics", url: "https://baltimorecountyathletics.digitalsports.com/pages/schedule/league-schedule.php", adapter: "digitalsports", venues: schools }];
}
async function scheduledSchoolCalendars(market, now = Date.now(), request = fetch) {
  if (!Number.isFinite(market.center?.lat) || !Number.isFinite(market.center?.lon) || !market.timeZone) return { status: "unavailable", fetchedAt: null, sources: [], events: [], context: [], schoolCount: 0, checkedCount: 0, discoveryStatus: "unavailable", exhaustive: false };
  const discovery = await discoverSchools(market, request), schools = mergeSchoolRegistry(market, discovery.schools);
  const result = await schoolCalendars(market, [...schools.slice(0, 36), ...districtSchoolCalendars(market, schools)], now, request);
  return { ...result, discoveryStatus: discovery.status, checkedCount: Math.min(36, schools.length), schoolCount: schools.length, exhaustive: false };
}
function makeSchoolSearch({ request = fetch, lookup, now = () => Date.now() } = {}) {
  const cache = /* @__PURE__ */ new Map(), pages = /* @__PURE__ */ new Map();
  return async (input) => {
    const market = schoolSearchMarket(input), key = JSON.stringify(market), stamp = now();
    if (input.refresh === true && Number(input.cursor || 0) === 0) {
      cache.delete(key);
      for (const k of pages.keys()) if (k.startsWith(key + ":")) pages.delete(k);
    }
    if (cache.size > 100) cache.delete(cache.keys().next().value);
    if (pages.size > 500) pages.delete(pages.keys().next().value);
    let entry = cache.get(key);
    if (!entry || stamp - entry.stamp > 30 * 6e4) {
      const task = Promise.all([discoverSchools(market, request), discoverVenueCalendars(market, request)]).then(([d, v]) => {
        const venues = [...new Map([...registeredVenueCalendars(market), ...v.sources].map((s) => [s.url, s])).values()];
        return { schools: [...venues, ...mergeSchoolRegistry(market, d.schools)], discoveryStatus: d.status === "active" && v.status === "active" ? "active" : "partial" };
      });
      entry = { stamp, task };
      cache.set(key, entry);
    }
    const discovery = await entry.task, cursor = Number(input.cursor) || 0;
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > discovery.schools.length) throw Error("Invalid school page");
    const selected = discovery.schools.slice(cursor, cursor + 12), pageKey = key + ":" + cursor;
    let page = pages.get(pageKey);
    if (!page || stamp - page.stamp > 30 * 6e4) {
      page = { stamp, task: Promise.all([schoolCalendars(market, [...selected.filter((s) => s.kind !== "venue"), ...cursor === 0 ? districtSchoolCalendars(market, discovery.schools.filter((s) => s.kind !== "venue")) : []], stamp, request, lookup), venueCalendars(market, selected.filter((s) => s.kind === "venue"), stamp, request, lookup)]).then((results) => ({ status: results.some((r) => r.status !== "unavailable") ? "partial" : "unavailable", sources: results.flatMap((r) => r.sources), events: results.flatMap((r) => r.events), context: results.flatMap((r) => r.context), fetchedAt: new Date(stamp).toISOString() })) };
      pages.set(pageKey, page);
    }
    const result = await page.task, nextCursor = cursor + selected.length < discovery.schools.length ? cursor + selected.length : null;
    return { ...result, discoveryStatus: discovery.discoveryStatus, schoolCount: discovery.schools.length, checkedCount: cursor + selected.length, nextCursor, center: market.center, radiusKm: market.radiusKm, exhaustive: false };
  };
}
export {
  districtSchoolCalendars,
  makeSchoolSearch,
  mergeSchoolRegistry,
  scheduledSchoolCalendars,
  schoolSearchMarket
};
