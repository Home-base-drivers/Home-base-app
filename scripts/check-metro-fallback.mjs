// Manual check for the offline metro fallback. Not part of `npm test`: it needs
// a browser and two packages that are deliberately not dependencies.
//
//   npm install --no-save playwright@1.56.1 leaflet@1.9.4
//   python3 -m http.server 8099 --directory dist &
//   node scripts/check-metro-fallback.mjs http://localhost:8099 after 25.7743,-80.1937
//
// Third argument 'before' hides HomeBaseMetros to reproduce the old behaviour.
// Every external host is aborted, standing in for unreachable Overpass and
// Nominatim mirrors, so this measures what a driver sees with no live venue data.
// Expect Miami to render route cards with 'after' and none with 'before', an
// unlisted metro (39.0997,-94.5786) to render none either way, and Baltimore
// (39.2904,-76.6122) to keep using its own richer set.
import {readFileSync} from 'node:fs';

const root = process.argv[2], mode = process.argv[3] || 'after';
const [lat, lon] = (process.argv[4] || '25.7743,-80.1937').split(',').map(Number);
const LEAFLET_JS = readFileSync('node_modules/leaflet/dist/leaflet.js', 'utf8');
const LEAFLET_CSS = readFileSync('node_modules/leaflet/dist/leaflet.css', 'utf8');

const browser = await chromium.launch({executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const context = await browser.newContext({
  viewport: {width: 390, height: 844},
  geolocation: {latitude: lat, longitude: lon}, permissions: ['geolocation'],
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
});

const blocked = [];
await context.route('**/*', route => {
  const url = route.request().url();
  if (url.includes('leaflet.js')) return route.fulfill({contentType: 'application/javascript', body: LEAFLET_JS});
  if (url.includes('leaflet.css')) return route.fulfill({contentType: 'text/css', body: LEAFLET_CSS});
  // The release bump makes the service worker reload the page mid-probe; keep it
  // out so this measures the route logic only.
  if (/\/sw\.js/.test(url)) return route.abort();
  if (url.startsWith(root)) return route.continue();
  // Everything external dies, standing in for a dead Overpass/Nominatim/tile host.
  blocked.push(url.replace(/^https?:\/\//, '').slice(0, 42));
  return route.abort();
});

const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 90)));
const navs = [];
page.on('framenavigated', f => { if (f === page.mainFrame()) navs.push(f.url().slice(0, 70)); });
// 'before' re-tests the old behaviour by removing the new module.
if (mode === 'before') await page.addInitScript(() => {
  Object.defineProperty(window, 'HomeBaseMetros', {get: () => undefined, set: () => {}, configurable: true});
});
await page.goto(root + '/index.html', {waitUntil: 'domcontentloaded'});
await page.waitForTimeout(1200);
const tryEval = async fn => { try { return await page.evaluate(fn); } catch (e) { navs.push('EVAL-LOST: ' + String(e).slice(0, 40)); } };
await tryEval(() => document.querySelector('#launchSkip')?.click());
await page.waitForTimeout(400);
await tryEval(() => window.refreshLocation?.());
await page.waitForFunction(() => /refreshed|unavailable|denied|could not/i.test(
  document.querySelector('#updated')?.textContent || ''), null, {timeout: 25000}).catch(() => {});
await page.waitForTimeout(1500);

const probe = () => page.evaluate(() => ({
  status: document.querySelector('#updated')?.textContent?.trim(),
  routeSource: document.querySelector('.route-source')?.textContent?.trim(),
  stopCards: document.querySelectorAll('.route-stop').length,
  emptyCards: document.querySelectorAll('.route-stop.empty').length,
  stopText: [...document.querySelectorAll('.route-stop')].slice(0, 6).map(n => n.innerText.replace(/\s+/g, ' ').trim().slice(0, 58)),
  bestMove: document.body.innerText.match(/BEST MOVE RIGHT NOW\s*([^\n]{0,70})/)?.[1]?.trim(),
  moduleLoaded: !!window.HomeBaseMetros
}));
let dom;
try { dom = await probe(); }
catch (e) { await page.waitForTimeout(800); try { dom = await probe(); } catch (e2) { dom = {probeFailed: String(e2).slice(0, 60)}; } }
console.log(JSON.stringify({mode, at: [lat, lon], ...dom,
  navigations: navs, osmBlocked: blocked.filter(u => /overpass|nominatim/.test(u)).length,
  errors: errors.slice(0, 2)}, null, 1));
await browser.close();
