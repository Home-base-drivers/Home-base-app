// Published school bell times. Baltimore City Public Schools lists each
// school's opening and closing bell on its /page/<school number> profile.
// Coordinates come from the U.S. Census Bureau geocoder for the published
// street address. The registry is rebuilt weekly and carried between runs.
const USER_AGENT = 'HomeBase school bell times (+https://github.com/Home-base-drivers/Home-base-app)';
const WEEK = 7 * 86_400_000;
const TIME = /(\d{1,2}):(\d{2})\s*([AP])\.?\s*M\.?/i;

export function clock(value) {
  const m = TIME.exec(String(value || ''));
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (/p/i.test(m[3])) hour += 12;
  const minute = Number(m[2]);
  return hour < 24 && minute < 60 ? String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0') : null;
}

export function pageText(html) {
  return String(html)
    .replace(/\\u003C/gi, '<').replace(/\\u003E/gi, '>')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#x2F;/gi, '/').replace(/&#39;|&#x27;/gi, "'")
    .replace(/\s+/g, ' ');
}

// Returns {name, address, levels:{all|elementary|middle|high:{open,close}}} or null.
export function parseBellPage(html) {
  const title = /<title[^>]*>([^<]+)<\/title>/i.exec(String(html))?.[1] || '';
  const name = title.replace(/&#x2F;/gi, '/').replace(/&amp;/g, '&').replace(/\s*\|\s*Baltimore City Public Schools\s*$/i, '').trim();
  const text = pageText(html), levels = {};
  for (const m of text.matchAll(/(?:\b(elementary|middle|high)\s+school\s+)?(opening|closing)\s+bell\s*:\s*(\d{1,2}:\d{2}\s*[AP]\.?\s*M\.?)/gi)) {
    const level = (m[1] || 'all').toLowerCase(), time = clock(m[3]);
    if (!time) continue;
    levels[level] ||= {};
    levels[level][m[2].toLowerCase() === 'opening' ? 'open' : 'close'] ||= time;
  }
  for (const key of Object.keys(levels)) if (!levels[key].open || !levels[key].close || levels[key].close <= levels[key].open) delete levels[key];
  if (!name || /page not found/i.test(name) || !Object.keys(levels).length) return null;
  // The school's own address sits just above its bell times; menus elsewhere
  // on the page list other schools, so only the nearest preceding one counts.
  const bellAt = text.search(/(?:\b(?:elementary|middle|high)\s+school\s+)?opening\s+bell/i);
  const prefix = bellAt > 0 ? text.slice(Math.max(0, bellAt - 400), bellAt) : '';
  const address = [...prefix.matchAll(/(\d{1,5}\s+[A-Za-z][A-Za-z0-9.' -]{2,60}?)\s*,?\s+Baltimore\s*,?\s*(?:MD|Maryland)\s*,?\s*(\d{5})/gi)].at(-1);
  return { name, address: address ? `${address[1].trim()}, Baltimore, MD ${address[2]}` : null, levels };
}

export async function censusGeocode(address, request = fetch) {
  const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
  url.search = new URLSearchParams({ address, benchmark: 'Public_AR_Current', format: 'json' });
  const response = await request(url, { signal: AbortSignal.timeout(12_000), headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
  if (!response.ok) throw Error('Geocoder unavailable');
  const match = (await response.json())?.result?.addressMatches?.[0]?.coordinates;
  const lat = Number(match?.y), lon = Number(match?.x);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

// Pick the bell window that matches a school's level; "all" covers the whole school.
export function bellWindow(levels, stage) {
  const key = stage === 'primary' ? 'elementary' : stage;
  return levels?.[key] || levels?.all || levels?.elementary || levels?.middle || levels?.high || null;
}

export async function bcpssBellRegistry(previous, now = Date.now(), request = fetch, options = {}) {
  const maxId = options.maxId || 600, concurrency = options.concurrency || 4;
  if (previous?.schools?.length && previous.fetchedAt && now - Date.parse(previous.fetchedAt) < WEEK) return previous;
  const known = new Map((previous?.schools || []).map(s => [s.address, s]));
  const schools = [];
  let next = 1, loaded = 0, failed = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next <= maxId) {
      const id = next++, url = `https://www.baltimorecityschools.org/page/${id}`;
      try {
        const response = await request(url, { signal: AbortSignal.timeout(20_000), headers: { Accept: 'text/html', 'User-Agent': USER_AGENT } });
        if (response.status === 404) { await response.body?.cancel?.(); continue; }
        if (!response.ok) { failed++; await response.body?.cancel?.(); continue; }
        const school = parseBellPage(await response.text());
        loaded++;
        if (school) schools.push({ id, url, ...school });
      } catch { failed++; }
    }
  }));
  // A bad crawl must not replace a good registry.
  if (!schools.length || (previous?.schools?.length && schools.length < previous.schools.length * 0.6)) {
    return previous?.schools?.length ? { ...previous, status: 'stale' } : { status: 'unavailable', fetchedAt: null, schools: [] };
  }
  let geocoded = 0, cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < schools.length) {
      const school = schools[cursor++], prior = school.address && known.get(school.address);
      if (prior?.lat != null) { school.lat = prior.lat; school.lon = prior.lon; continue; }
      if (!school.address) continue;
      try { const point = await (options.geocode || censusGeocode)(school.address, request); if (point) { Object.assign(school, point); geocoded++; } } catch { /* without coordinates the record cannot be matched */ }
    }
  }));
  return {
    status: failed ? 'partial' : 'active', fetchedAt: new Date(now).toISOString(),
    source: 'Baltimore City Public Schools school profiles; coordinates from U.S. Census Bureau geocoder',
    pagesRead: loaded, failedPages: failed, geocoded,
    schools: schools.sort((a, b) => a.id - b.id)
  };
}
