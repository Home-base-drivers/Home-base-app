/* Public calendars age separately from short-lived pricing proxies. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HomeBasePublicData=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const HOUR=3600000;
  // The data-only refresh workflow publishes here about every ten minutes;
  // the copy bundled with each release remains the offline fallback.
  const LIVE_SIGNALS_URL='https://raw.githubusercontent.com/Home-base-drivers/Home-base-app/signals/provider-signals.json';
  function snapshotTime(payload,now=Date.now()){const t=Date.parse(payload&&payload.generatedAt||'');return payload&&Array.isArray(payload.markets)&&Number.isFinite(t)&&t<=now+10*60000?t:NaN;}
  function newestSnapshot(payloads,now=Date.now()){let best=null,bestTime=-Infinity;for(const payload of payloads||[]){const t=snapshotTime(payload,now);if(Number.isFinite(t)&&t>bestTime){best=payload;bestTime=t;}}return best;}
  async function loadSnapshot(fetchJson,now=Date.now()){
    // One-minute buckets let the CDN absorb repeated loads without serving an old file for long.
    const results=await Promise.allSettled([fetchJson(LIVE_SIGNALS_URL+'?t='+Math.floor(now/60000)),fetchJson('./provider-signals.json?ts='+now)]);
    const best=newestSnapshot(results.filter(r=>r.status==='fulfilled').map(r=>r.value),now);
    if(!best)throw Error('Demand snapshot unavailable');
    return best;
  }
  function isTicketAddon(name){return /\b(?:add[ -]?ons?|parking|premium seating|pinstripe pass|not a concert ticket|vip (?:upgrade|package)|meet\s*(?:&|and)\s*greet)\b/i.test(String(name||''));}
  function eventIdentity(event){
    const token=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,''),start=new Date(event.eventStart).getTime(),name=String(event.name||'').split(' · ')[0];
    const sports=/sport|baseball|football|basketball|hockey|soccer/i.test([event.eventType,event.classification,event.genre].join(' '))||event.tags?.source==='public sports feed';
    const location=token(event.venue)||Number(event.lat).toFixed(3)+':'+Number(event.lon).toFixed(3);
    // One game may have different feed titles and ticket products. Separate
    // performances or simultaneous concerts retain their own titles.
    return(sports?'sports':token(name))+':'+location+':'+start;
  }
  function distance(a,b){const rad=n=>n*Math.PI/180,h=Math.sin(rad(b[0]-a[0])/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(rad(b[1]-a[1])/2)**2;return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
  function point(item){return item&&item.lat!=null&&item.lon!=null&&Number.isFinite(Number(item.lat))&&Number.isFinite(Number(item.lon))&&Math.abs(Number(item.lat))<=90&&Math.abs(Number(item.lon))<=180;}
  function matchingMarkets(payload,lat,lon){return(payload?.markets||[]).filter(m=>point(m.center)&&distance([lat,lon],[Number(m.center.lat),Number(m.center.lon)])<=Number(m.radiusKm||0)).sort((a,b)=>distance([lat,lon],[a.center.lat,a.center.lon])-distance([lat,lon],[b.center.lat,b.center.lon]));}
  function calendarFresh(feed,generatedAt,now){const fetched=Date.parse(feed?.fetchedAt||generatedAt||'');return Number.isFinite(fetched)&&now-fetched<=24*HOUR&&now-fetched>=-5*60000;}
  function eventsForLocation(payload,lat,lon,now=Date.now()){
    const rows=[],seen=new Set();
    // Neighboring markets contribute events too (Baltimore drivers also work DC and
    // Northern Virginia); the route ranks distant ones by drive time and size.
    const nearby=(payload?.markets||[]).filter(m=>point(m.center)&&distance([lat,lon],[Number(m.center.lat),Number(m.center.lon)])<=Number(m.radiusKm||0)+70);
    for(const market of nearby)for(const feed of [market.ticketmaster,market.publicRecords,market.publicSports]){
      if(!feed||!['active','partial','stale'].includes(feed.calendarStatus||feed.status)||!calendarFresh(feed,payload.generatedAt,now))continue;
      // Scoreboard state is only current for a short time; observed ends persist in the rows themselves.
      const scoreboard=feed===market.publicSports;
      if(scoreboard&&now-Date.parse(feed.fetchedAt||'')>45*60000)continue;
      for(const e of feed.events||[]){
        const start=Date.parse(e.eventStart),end=Date.parse(e.eventEnd||'');
        if(isTicketAddon(e.name)||!point(e)||!Number.isFinite(start)||!/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(e.eventStart)||start>now+12*HOUR||(Number.isFinite(end)&&end>start?end<now-90*60000:start<now-6*HOUR)||distance([lat,lon],[Number(e.lat),Number(e.lon)])>(market===nearby.find(m=>distance([lat,lon],[Number(m.center.lat),Number(m.center.lon)])<=Number(m.radiusKm||0))?65:110))continue;
        const key=eventIdentity(e);
        if(seen.has(key))continue;seen.add(key);
        rows.push({...e,lat:Number(e.lat),lon:Number(e.lon),eventStart:new Date(start),eventEnd:Number.isFinite(end)&&end>start?new Date(end):null});
      }
    }
    return consolidateEvents(rows);
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
    const dates=usable.map(f=>Date.parse(f.fetchedAt||payload.generatedAt)).filter(Number.isFinite);
    return{status:!markets.length?'unsupported':!usable.length?'unavailable':usable.some(f=>(f.calendarStatus||f.status)==='stale')?'stale':usable.some(f=>(f.calendarStatus||f.status)==='partial'||f.calendarTruncated||f.truncated)?'partial':'active',fetchedAt:dates.length?new Date(Math.min(...dates)).toISOString():null,sourceCount:sources.filter(s=>s.pages>0).length,failedSources:sources.filter(s=>s.status==='unavailable').length,ticketmasterConfigured:markets.some(m=>m.ticketmaster?.status&&!['not_configured','not_supported'].includes(m.ticketmaster.status))};
  }
  function alertsForLocation(payload,lat,lon,now=Date.now()){
    const rows=new Map();
    for(const market of matchingMarkets(payload,lat,lon)){const feed=market.weatherAlerts;if(!feed||!['active','partial','stale'].includes(feed.status)||now-Date.parse(feed.fetchedAt||'')>45*60000)continue;for(const a of feed.alerts||[])if(a&&a.id&&Date.parse(a.ends)>now)rows.set(a.id,a);}
    return [...rows.values()];
  }
  // Published bell times (school profile pages) for schools in the driver's market.
  function bellTimesForLocation(payload,lat,lon){
    const rows=[];for(const market of matchingMarkets(payload,lat,lon))for(const s of market.schoolBells?.schools||[])if(point(s)&&s.levels)rows.push(s);
    return rows;
  }
  const nameTokens=name=>String(name||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').split(' ').filter(t=>t.length>2&&!/^(school|schools|elementary|middle|high|the|and|academy|public|baltimore|city|of|for)$/.test(t));
  // Match a mapped school to a published bell record: within 400 m and sharing a
  // distinctive name word (a nearby school with a different name is not enough).
  function bellMatch(source,schools){
    if(!point(source))return null;const tokens=new Set(nameTokens(source.name));let best=null,bestKm=Infinity;
    for(const s of schools||[]){const km=distance([Number(source.lat),Number(source.lon)],[Number(s.lat),Number(s.lon)]);if(km>.4||km>=bestKm)continue;if(!nameTokens(s.name).some(t=>tokens.has(t)))continue;best=s;bestKm=km;}
    return best;
  }
  // One real-world event can arrive as several listings: the same show under two
  // titles ("Chicago" / "Chicago - The Musical"), two venue spellings ("Broadway
  // Theatre" / "Broadway Theatre-New York"), neighboring markets' feeds, or a
  // doors/show pair an hour apart. Timed-entry attractions (museum slots every
  // 30 minutes) are one all-day listing, not a crowd let-out.
  const TITLE_STOP=/^(the|a|an|and|of|at|in|with|live|tour|show|musical|presents?|new|york|ny|nyc|tickets?)$/;
  function titleText(name){return String(name||'').split(' · ')[0].toLowerCase().replace(/&/g,' and ').replace(/\([^)]*\)/g,' ').replace(/[–—]/g,'-');}
  function titleCore(name){const t=titleText(name).split(/\s+-\s+|:\s+|\s+\|\s+/)[0];return t.replace(/\bthe musical\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim().replace(/^the\s+/,'');}
  function titleTokens(name){return new Set(titleText(name).replace(/[^a-z0-9]+/g,' ').split(' ').filter(t=>t.length>1&&!TITLE_STOP.test(t)));}
  function venueKey(v){return String(v||'').toLowerCase().replace(/powered by.*$/,'').replace(/\btheatre\b/g,'theater').replace(/[-,]\s*(new york|ny|nyc|baltimore|md|washington|dc)\s*$/,'').replace(/[^a-z0-9]/g,'');}
  function startOf(e){const t=e?.eventStart instanceof Date?e.eventStart.getTime():Date.parse(e?.eventStart||'');return t;}
  function sportsEvent(e){return /sport|baseball|football|basketball|hockey|soccer/i.test([e.eventType,e.classification,e.genre].join(' '))||e.tags?.source==='public sports feed'||!!e.league;}
  function sameVenue(a,b){const va=venueKey(a.venue),vb=venueKey(b.venue);if(va&&vb&&(va===vb||va.length>4&&vb.length>4&&(va.includes(vb)||vb.includes(va))))return true;return point(a)&&point(b)&&distance([Number(a.lat),Number(a.lon)],[Number(b.lat),Number(b.lon)])<=.35&&(!va||!vb||va.slice(0,6)===vb.slice(0,6));}
  function sameTitle(a,b){
    const ca=titleCore(a.name),cb=titleCore(b.name);if(ca&&ca===cb)return true;
    const ta=titleTokens(a.name),tb=titleTokens(b.name);if(!ta.size||!tb.size)return false;
    let shared=0;for(const t of ta)if(tb.has(t))shared++;
    const small=Math.min(ta.size,tb.size);
    // All words of the shorter title appear in the longer one, or most words overlap.
    if(shared===small&&(small>=2||[...ta].some(t=>t.length>=4&&tb.has(t))))return true;
    return shared/(ta.size+tb.size-shared)>=.6;
  }
  function sameEvent(a,b){
    const sa=startOf(a),sb=startOf(b);if(!Number.isFinite(sa)||!Number.isFinite(sb)||!sameVenue(a,b))return false;
    const gap=Math.abs(sa-sb);
    if(sportsEvent(a)&&sportsEvent(b))return gap<=90*60000;
    return sameTitle(a,b)&&gap<=75*60000;
  }
  function richness(e){return(e.tags?.liveEvent?8:0)+(e.eventEnd?4:0)+(Number(e.expectedAttendance)>0?2:0)+(e.url?1:0);}
  function timedEntryText(e){return /\b(museum|exhibit(ion)?|immersive|experience|gallery|timed entry|general admission entry)\b/i.test([e.name,e.venue].join(' '))&&!/\b(gala|concert|party|benefit|fundraiser|live music)\b/i.test(e.name||'');}
  function localDay(t){return new Date(t-5*HOUR).toISOString().slice(0,10);}
  function consolidateEvents(events){
    const rows=(events||[]).filter(Boolean).slice().sort((a,b)=>startOf(a)-startOf(b)),groups=[];
    for(const e of rows){const g=groups.find(g=>g.items.some(x=>sameEvent(x,e)));if(g)g.items.push(e);else groups.push({items:[e]});}
    let merged=groups.map(g=>{
      const best=g.items.slice().sort((a,b)=>richness(b)-richness(a))[0];
      if(g.items.length===1)return best;
      const sources=[...new Set(g.items.map(x=>x.source||x.tags?.source).filter(Boolean))];
      const first=g.items.reduce((m,x)=>startOf(x)<startOf(m)?x:m,best);
      return{...best,eventStart:first.eventStart,mergedListings:g.items.length,...(sources.length?{mergedSources:sources}:{}),alsoListedAs:[...new Set(g.items.map(x=>String(x.name||'').split(' · ')[0]).filter(n=>n!==String(best.name||'').split(' · ')[0]))]};
    });
    // Timed-entry venues: 4+ listings in a day packed an hour or less apart (or a
    // museum/exhibit listing) collapse into one all-day row flagged timedEntry.
    const byVenue=new Map();
    merged.forEach((e,i)=>{const k=(venueKey(e.venue)||(point(e)?Number(e.lat).toFixed(3)+':'+Number(e.lon).toFixed(3):'?'))+'|'+localDay(startOf(e));if(!byVenue.has(k))byVenue.set(k,[]);byVenue.get(k).push(i);});
    const drop=new Set();
    for(const idx of byVenue.values()){
      const items=idx.map(i=>merged[i]).filter(e=>!sportsEvent(e));if(!items.length)continue;
      const starts=items.map(startOf).sort((a,b)=>a-b),gaps=starts.slice(1).map((t,i)=>t-starts[i]).sort((a,b)=>a-b);
      const packed=items.length>=4&&gaps[Math.floor(gaps.length/2)]<=60*60000;
      if(!packed&&!items.every(timedEntryText))continue;
      const keep=idx.find(i=>!sportsEvent(merged[i])),first=merged[keep],lastStart=starts[starts.length-1];
      merged[keep]={...first,eventStart:first.eventStart instanceof Date?new Date(starts[0]):new Date(starts[0]).toISOString(),eventEnd:first.eventStart instanceof Date?new Date(lastStart+HOUR):new Date(lastStart+HOUR).toISOString(),timedEntry:true,timedSlots:items.length,tags:{...(first.tags||{}),timedEntry:true}};
      for(const i of idx)if(i!==keep&&!sportsEvent(merged[i]))drop.add(i);
    }
    merged=merged.filter((_,i)=>!drop.has(i));
    return merged.sort((a,b)=>startOf(a)-startOf(b));
  }
  // Markets whose data this driver's screen uses: the one they are in plus neighbors
  // whose events reach them (same +70 km rule as eventsForLocation).
  function activeMarketIds(payload,lat,lon){return(payload?.markets||[]).filter(m=>point(m.center)&&distance([lat,lon],[Number(m.center.lat),Number(m.center.lon)])<=Number(m.radiusKm||0)+70).sort((a,b)=>distance([lat,lon],[a.center.lat,a.center.lon])-distance([lat,lon],[b.center.lat,b.center.lon])).map(m=>m.id);}
  // Tell the server which markets have a driver right now (market ids only), at most
  // every 10 minutes per set, so live feeds are refreshed only where drivers are.
  let lastActivity={key:'',at:0};
  async function reportActivity(config,payload,lat,lon,request=globalThis.fetch,now=Date.now(),force=false){
    const ids=activeMarketIds(payload,lat,lon),key=ids.join(',');
    if(!ids.length||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config?.supabaseUrl||'')||!config?.supabasePublishableKey||typeof request!=='function')return null;
    if(!force&&key===lastActivity.key&&now-lastActivity.at<10*60000)return null;
    lastActivity={key,at:now};
    try{const r=await request(config.supabaseUrl+'/functions/v1/market-activity',{method:'POST',headers:{apikey:config.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({markets:ids}),keepalive:true});return r&&r.ok?await r.json():null;}catch{return null;}
  }
  return{LIVE_SIGNALS_URL,reportActivity,activeMarketIds,newestSnapshot,loadSnapshot,alertsForLocation,bellTimesForLocation,bellMatch,matchingMarkets,eventsForLocation,placesForLocation,calendarCoverage,isTicketAddon,eventIdentity,consolidateEvents,sameEvent};
});
