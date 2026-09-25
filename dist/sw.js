const CACHE='home-base-v46';
const ASSETS=['./','index.html','manifest.webmanifest','favicon.svg','icon-192.png','icon-512.png','homebase-logo.png','baltimore-map.jpg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
function refineMap(html){return html
.replace('.leaflet-tile-pane{filter:brightness(.91) contrast(1.08) saturate(.78)}.leaflet-heat-pane{mix-blend-mode:screen;opacity:.86}', '.leaflet-tile-pane{filter:brightness(.82) contrast(1.08) saturate(.66)}.leaflet-heat-pane{mix-blend-mode:screen;opacity:.68}')
.replace("const heatStops=[[.08,[0,120,66]],[.20,[0,210,92]],[.34,[130,225,52]],[.47,[255,218,40]],[.60,[255,148,25]],[.73,[255,72,28]],[.86,[255,35,47]],[1,[255,18,64]]]", "const heatStops=[[.08,[16,105,68]],[.20,[24,158,83]],[.34,[111,170,67]],[.47,[211,183,54]],[.60,[218,130,48]],[.73,[210,79,50]],[.86,[205,52,62]],[1,[218,38,67]]]")
.replace("alpha=Math.round(255*(.045+value*.48)*feather)", "alpha=Math.round(255*(.03+value*.34)*feather)")
.replace("[[1,.10,.16],[.74,.16,.31],[.48,.25,.54],[.24,.46,.78]]", "[[1,.07,.16],[.74,.11,.31],[.48,.17,.54],[.24,.27,.78]]");}
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).then(async r=>{const text=refineMap(await r.text()),out=new Response(text,{status:r.status,statusText:r.statusText,headers:r.headers});caches.open(CACHE).then(c=>c.put('index.html',out.clone()));return out}).catch(()=>caches.match('index.html')));return}e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r})))})
