const CACHE='home-base-v115';
const ASSETS=['./','index.html','manifest.webmanifest','favicon.svg','icon-192.png','icon-512.png','homebase-logo.png','baltimore-map.jpg','provider-signals.json','homebase-live.js?v=37','homebase-earnings.js?v=110','homebase-earnings.css?v=110','homebase-planner.js?v=114','homebase-config.js?v=111','homebase-backend.js?v=112','homebase-growth.js?v=112','homebase-growth.css?v=111','homebase-demand-history.js?v=113','baltimore-market.js?v=72','homebase-heat.js?v=95','baltimore-demand-areas.geojson'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 await Promise.allSettled(ASSETS.map(async path=>{const response=await fetch(path,{cache:'reload'});if(response.ok)await cache.put(path,response);}));
 for(const path of ['index.html','homebase-earnings.js?v=110','homebase-earnings.css?v=110','homebase-planner.js?v=114','homebase-config.js?v=111','homebase-backend.js?v=112','homebase-growth.js?v=112','homebase-growth.css?v=111','homebase-heat.js?v=95','homebase-demand-history.js?v=113','baltimore-market.js?v=72'])if(!await cache.match(path))throw Error('Required app asset could not be cached');
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 const url=new URL(event.request.url);
 if(event.request.mode==='navigate'){
  event.respondWith((async()=>{try{const response=await fetch(event.request);if(!response.ok)throw Error('Page unavailable');const cache=await caches.open(CACHE);await cache.put('index.html',response.clone());return response;}catch{return await caches.match('index.html')||new Response('Home Base is offline. Reconnect and reload.',{status:503,headers:{'Content-Type':'text/plain'}});}})());return;
 }
 if(url.pathname.endsWith('/provider-signals.json')||url.pathname.endsWith('/homebase-heat.js')){
  event.respondWith((async()=>{try{const response=await fetch(event.request,{cache:'no-store'});if(!response.ok)throw Error('Feed unavailable');const cache=await caches.open(CACHE);await cache.put(url.pathname,response.clone());return response;}catch{return await caches.match(url.pathname)||new Response('{}',{status:503,headers:{'Content-Type':'application/json'}});}})());return;
 }
 event.respondWith((async()=>{const cached=await caches.match(event.request);if(cached)return cached;const response=await fetch(event.request);if(response.ok){const cache=await caches.open(CACHE);await cache.put(event.request,response.clone());}return response;})());
});
