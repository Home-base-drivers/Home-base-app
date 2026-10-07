/* Public calendars age separately from short-lived pricing proxies. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HomeBasePublicData=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const HOUR=3600000;
  function distance(a,b){const rad=n=>n*Math.PI/180,h=Math.sin(rad(b[0]-a[0])/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(rad(b[1]-a[1])/2)**2;return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
  function point(item){return item&&item.lat!=null&&item.lon!=null&&Number.isFinite(Number(item.lat))&&Number.isFinite(Number(item.lon))&&Math.abs(Number(item.lat))<=90&&Math.abs(Number(item.lon))<=180;}
  function matchingMarkets(payload,lat,lon){return(payload?.markets||[]).filter(m=>point(m.center)&&distance([lat,lon],[Number(m.center.lat),Number(m.center.lon)])<=Number(m.radiusKm||0)).sort((a,b)=>distance([lat,lon],[a.center.lat,a.center.lon])-distance([lat,lon],[b.center.lat,b.center.lon]));}
  function calendarFresh(feed,generatedAt,now){const fetched=Date.parse(feed?.fetchedAt||generatedAt||'');return Number.isFinite(fetched)&&now-fetched<=24*HOUR&&now-fetched>=-5*60000;}
  function eventsForLocation(payload,lat,lon,now=Date.now()){
    const rows=[],seen=new Set();
    for(const market of matchingMarkets(payload,lat,lon))for(const feed of [market.ticketmaster,market.publicRecords]){
      if(!feed||!['active','partial','stale'].includes(feed.calendarStatus||feed.status)||!calendarFresh(feed,payload.generatedAt,now))continue;
      for(const e of feed.events||[]){
        const start=Date.parse(e.eventStart),end=Date.parse(e.eventEnd||'');
        if(!point(e)||!Number.isFinite(start)||!/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(e.eventStart)||start>now+12*HOUR||(Number.isFinite(end)&&end>start?end<now-90*60000:start<now-30*60000)||distance([lat,lon],[Number(e.lat),Number(e.lon)])>65)continue;
        const token=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,''),key=token(e.name)+':'+token(e.venue)+':'+start;
        if(seen.has(key))continue;seen.add(key);
        rows.push({...e,lat:Number(e.lat),lon:Number(e.lon),eventStart:new Date(start),eventEnd:Number.isFinite(end)&&end>start?new Date(end):null});
      }
    }
    return rows.sort((a,b)=>a.eventStart-b.eventStart);
  }
  function placesForLocation(payload,lat,lon,radiusKm=20,now=Date.now()){
    const rows=[],seen=new Set();
    for(const market of matchingMarkets(payload,lat,lon))for(const p of market.publicPlaces?.places||[]){
      if(!point(p)||!p.name||distance([lat,lon],[Number(p.lat),Number(p.lon)])>radiusKm)continue;
      if(!p.tags?.gazetteerArea&&now-Number(p.tags?.publicFetchedAt||0)>7*24*HOUR)continue;
      const key=String(p.name).toLowerCase()+':'+Number(p.lat).toFixed(4)+':'+Number(p.lon).toFixed(4);
      if(seen.has(key))continue;seen.add(key);rows.push({...p,lat:Number(p.lat),lon:Number(p.lon)});
    }
    // Keep a city-wide field while bounding mobile heat/ranking work. Small
    // cell/category quotas retain transit/medical/shopping among dense pubs.
    rows.sort((a,b)=>distance([lat,lon],[a.lat,a.lon])-distance([lat,lon],[b.lat,b.lon]));
    const cells=new Map();return rows.filter(p=>{const key=Math.floor(p.lat*100)+':'+Math.floor(p.lon*100)+':'+p.cat,n=cells.get(key)||0;cells.set(key,n+1);return n<6;}).slice(0,900);
  }
  function calendarCoverage(payload,lat,lon,now=Date.now()){
    const markets=matchingMarkets(payload,lat,lon),feeds=markets.flatMap(m=>[m.ticketmaster,m.publicRecords]).filter(Boolean),usable=feeds.filter(f=>['active','partial','stale'].includes(f.calendarStatus||f.status)&&calendarFresh(f,payload.generatedAt,now));
    const sources=[...new Map(markets.flatMap(m=>m.publicRecords?.sources||[]).map(s=>[s.url,s])).values()];
    return{status:!markets.length?'unsupported':!usable.length?'unavailable':usable.some(f=>(f.calendarStatus||f.status)==='stale')?'stale':usable.some(f=>(f.calendarStatus||f.status)==='partial'||f.calendarTruncated||f.truncated)?'partial':'active',sourceCount:sources.filter(s=>s.pages>0).length,failedSources:sources.filter(s=>s.status==='unavailable').length,ticketmasterConfigured:markets.some(m=>m.ticketmaster?.status!=='not_configured'&&m.ticketmaster?.status!=='not_supported')};
  }
  return{matchingMarkets,eventsForLocation,placesForLocation,calendarCoverage};
});
