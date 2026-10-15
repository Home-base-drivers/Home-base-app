// Manual check for the account/backup status wording. Not part of `npm test`:
// it needs a browser and two packages that are deliberately not dependencies.
//
//   npm install --no-save playwright@1.56.1 leaflet@1.9.4
//   python3 -m http.server 8099 --directory dist &
//   node scripts/check-sync-status.mjs http://localhost:8099
//
// It seeds each sync state into localStorage and re-renders Profile, printing the
// line a driver actually reads. Supabase is unreachable from a restricted
// session, which is itself the signed-out case; the signed-in rows are driven by
// setting HomeBaseCloudState directly, so this checks wording and state
// selection, not a real session. A real session needs the live account run.
import {readFileSync} from 'node:fs';
const root = process.argv[2];
const JS = readFileSync('node_modules/leaflet/dist/leaflet.js','utf8');
const CSS = readFileSync('node_modules/leaflet/dist/leaflet.css','utf8');
const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const context = await browser.newContext({viewport:{width:390,height:844}, serviceWorkers:'block',
  geolocation:{latitude:39.2904,longitude:-76.6122}, permissions:['geolocation']});
await context.route('**/*', route => {
  const url = route.request().url();
  if (url.includes('leaflet.js')) return route.fulfill({contentType:'application/javascript',body:JS});
  if (url.includes('leaflet.css')) return route.fulfill({contentType:'text/css',body:CSS});
  if (url.startsWith(root)) return route.continue();
  return route.abort();  // Supabase is unreachable here anyway
});
const page = await context.newPage();
await page.goto(root + '/index.html', {waitUntil:'domcontentloaded'});
await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelector('#launchSkip')?.click());
await page.waitForTimeout(400);

const NOW = Date.now();
const cases = [
  ['signed out        ', {}, {}],
  ['signed in, unlinked', {}, {signedIn:true}],
  ['linked, saving off ', {homeBaseCloudOwner:'u1', homeBaseCloudVersion:'7', homeBaseAutoCloud:'false'}, {signedIn:true}],
  ['saved 2 min ago    ', {homeBaseCloudOwner:'u1', homeBaseCloudVersion:'7', homeBaseAutoCloud:'true', homeBaseCloudSyncedAt:String(NOW-120000)}, {signedIn:true}],
  ['conflict           ', {homeBaseCloudOwner:'u1', homeBaseCloudVersion:'7', homeBaseAutoCloud:'true', homeBaseCloudSyncedAt:String(NOW-600000), homeBaseCloudFailedAt:String(NOW-1000), homeBaseCloudFailure:'conflict'}, {signedIn:true}],
  ['syncing            ', {homeBaseCloudOwner:'u1', homeBaseCloudVersion:'7', homeBaseAutoCloud:'true'}, {signedIn:true, busy:true}]
];
for (const [label, seed, session] of cases) {
  const text = await page.evaluate(({seed, session}) => {
    for (const k of ['homeBaseCloudOwner','homeBaseCloudVersion','homeBaseAutoCloud','homeBaseCloudSyncedAt','homeBaseCloudFailedAt','homeBaseCloudFailure']) localStorage.removeItem(k);
    for (const [k,v] of Object.entries(seed)) localStorage.setItem(k,v);
    globalThis.HomeBaseCloudState = session;
    document.querySelector('#backupCard')?.remove();
    window.renderProfile?.();
    return document.querySelector('#backupCloud')?.textContent || '(no element)';
  }, {seed, session});
  console.log(label + ' | ' + text);
}
const leftovers = await page.evaluate(() => document.body.innerText.includes('Cloud backup is not connected'));
console.log('\nold fixed claim still on screen: ' + leftovers);
await browser.close();
