const CACHE='home-base-v286';
const ASSETS=['homebase-school-events.js?v=4','homebase-public-data.js?v=5','homebase-sports.js?v=2','homebase-weather.js?v=1','data-attributions.txt','homebase-global-heat.js?v=3','./','index.html','manifest.webmanifest','favicon.svg','icon-192.png','icon-512.png','homebase-languages.js?v=2','homebase-voice.js?v=4','homebase-dispatch.js?v=2','homebase-internal-ai.js?v=3','homebase-plans.js?v=3','homebase-agent-client.js?v=8','homebase-copilot.js?v=50','homebase-live-assistant.js?v=7','homebase-chat.js?v=5','homebase-copilot.css?v=54','homebase-logo.png','baltimore-map.jpg','provider-signals.json','homebase-live.js?v=39','homebase-earnings.js?v=117','homebase-earnings.css?v=110','homebase-route-policy.js?v=14','homebase-planner.js?v=131','homebase-config.js?v=111','homebase-backend.js?v=133','homebase-growth.js?v=134','homebase-growth.css?v=113','homebase-demand-history.js?v=148','baltimore-market.js?v=73','homebase-metros.js?v=1','homebase-heat.js?v=112','baltimore-demand-areas.geojson'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 await Promise.allSettled(ASSETS.map(async path=>{const response=await fetch(path,{cache:'reload'});if(response.ok)await cache.put(path,response);}));
 for(const path of ['homebase-school-events.js?v=4','homebase-public-data.js?v=5','homebase-sports.js?v=2','homebase-weather.js?v=1','homebase-languages.js?v=2','homebase-voice.js?v=4','homebase-dispatch.js?v=2','homebase-copilot.js?v=50','homebase-live-assistant.js?v=7','homebase-chat.js?v=5','homebase-copilot.css?v=54','index.html','homebase-earnings.js?v=117','homebase-earnings.css?v=110','homebase-route-policy.js?v=14','homebase-planner.js?v=131','homebase-config.js?v=111','homebase-backend.js?v=133','homebase-growth.js?v=134','homebase-growth.css?v=113','homebase-heat.js?v=112','homebase-demand-history.js?v=148','baltimore-market.js?v=73','homebase-metros.js?v=1'])if(!await cache.match(path))throw Error('Required app asset could not be cached');
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 const url=new URL(event.request.url);
 if(event.request.mode==='navigate'){
  event.respondWith((async()=>{try{const response=await fetch(event.request,{cache:'no-store'});if(!response.ok)throw Error('Page unavailable');const cache=await caches.open(CACHE);await cache.put('index.html',response.clone());return response;}catch{return await caches.match('index.html')||new Response('Home Base is offline. Reconnect and reload.',{status:503,headers:{'Content-Type':'text/plain'}});}})());return;
 }
 if(url.pathname.endsWith('/provider-signals.json')||url.pathname.endsWith('/homebase-heat.js')||url.pathname.endsWith('/runtime-config.js')){
  event.respondWith((async()=>{try{const response=await fetch(event.request,{cache:'no-store'});if(!response.ok)throw Error('Feed unavailable');const cache=await caches.open(CACHE);await cache.put(url.pathname,response.clone());return response;}catch{return await caches.match(url.pathname)||new Response('{}',{status:503,headers:{'Content-Type':'application/json'}});}})());return;
 }
 event.respondWith((async()=>{
  try{
   const response=await fetch(event.request,{cache:'no-store'});
   if(response.ok){const cache=await caches.open(CACHE);await cache.put(event.request,response.clone());return response;}
   throw Error('Network asset unavailable');
  }catch{
   return await caches.match(event.request)||new Response('',{status:503});
  }
 })());
});
