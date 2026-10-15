// Manual check for the first-install reload. Not part of `npm test`: it needs a
// browser and two packages that are deliberately not dependencies.
//
//   npm install --no-save playwright@1.56.1 leaflet@1.9.4
//   cp -r dist /tmp/serve && python3 -m http.server 8097 --directory /tmp/serve &
//   WAIT_MS=11000 node scripts/check-release-reload.mjs http://localhost:8097 /tmp/serve
//
// It serves a mutable copy because it bumps every shared version string to
// simulate shipping a release. Expect a first install and a repeat visit to make
// one navigation each, and the version bump to make two: a new driver must not
// load the app twice, while an existing one must still pick up the new release.
// WAIT_MS below ~10000 reports a false failure — the new worker needs time to
// precache every required asset before it can activate.
const [root, serveDir] = process.argv.slice(2);
const JS = readFileSync('node_modules/leaflet/dist/leaflet.js','utf8');
const CSS = readFileSync('node_modules/leaflet/dist/leaflet.css','utf8');

const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
// One persistent context so the service worker survives between visits.
const context = await browser.newContext({
  viewport:{width:390,height:844}, serviceWorkers:'allow',
  geolocation:{latitude:39.2904,longitude:-76.6122}, permissions:['geolocation']
});
await context.route('**/*', route => {
  const url = route.request().url();
  if (url.includes('leaflet.js')) return route.fulfill({contentType:'application/javascript',body:JS});
  if (url.includes('leaflet.css')) return route.fulfill({contentType:'text/css',body:CSS});
  if (url.startsWith(root)) return route.continue();
  return route.abort();
});
const page = await context.newPage();
let navs = 0;
page.on('framenavigated', f => { if (f === page.mainFrame()) navs++; });

const visit = async label => {
  navs = 0;
  await page.goto(root + '/index.html', {waitUntil:'domcontentloaded'});
  await page.waitForTimeout(Number(process.env.WAIT_MS || 6000));
  const info = await page.evaluate(async () => ({
    controller: !!navigator.serviceWorker?.controller,
    regs: (await navigator.serviceWorker?.getRegistrations?.() || []).length,
    flags: Object.keys(sessionStorage).filter(k => k.startsWith('hb-release-reload')),
    ctrlUrl: navigator.serviceWorker?.controller?.scriptURL?.split('/').pop(),
    reg: await (async () => { const r = (await navigator.serviceWorker.getRegistrations())[0];
      return r && {active: r.active?.scriptURL?.split('/').pop(), waiting: r.waiting?.scriptURL?.split('/').pop(),
                   installing: r.installing?.scriptURL?.split('/').pop()}; })()
  })).catch(e => ({lost:String(e).slice(0,40)}));
  console.log(label, JSON.stringify({navigations: navs, ...info}));
  return navs;
};

const first = await visit('FIRST INSTALL ');
const repeat = await visit('REPEAT VISIT  ');

// Now ship a new release: bump every version string the shell and worker share.
for (const f of ['index.html','sw.js']) {
  const p = serveDir + '/' + f;
  writeFileSync(p, readFileSync(p,'utf8').replaceAll('262','263'));
}
const upgraded = await visit('AFTER v263    ');

console.log('\nRESULT ' + JSON.stringify({
  firstInstallReloads: first - 1, repeatReloads: repeat - 1, upgradeReloads: upgraded - 1,
  verdict: (first === 1 && upgraded > 1) ? 'PASS' : 'FAIL'
}));
await browser.close();
