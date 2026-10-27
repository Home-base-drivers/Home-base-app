import markets from '../config/provider-markets.json' with {type:'json'};
import publicData from '../dist/homebase-public-data.js';
import {distanceKm,structuredEvents,publishedVenueEvents,normalizePublicEvent,nextDataEvents,feedCandidates,tribeEvents,localistEvents} from './public-events.mjs';
import {schoolPage,schoolCalendarLinks,schoolIcsEvents,publicSchoolUrl} from './school-events.mjs';

export function registeredVenueCalendars(market){
 return [...new Map(markets.markets.filter(m=>distanceKm(market.center,m.center)<=m.radiusKm+market.radiusKm).flatMap(m=>m.publicCalendars||[]).map(s=>[s.url,{...s,kind:'venue'}])).values()];
}
export function venuesFromOsm(payload,market){
 return(payload?.elements||[]).flatMap(e=>{const t=e.tags||{},lat=e.lat??e.center?.lat,lon=e.lon??e.center?.lon,url=publicSchoolUrl(t.website||t['contact:website']);
  if(!url||!t.name||!Number.isFinite(lat)||!Number.isFinite(lon)||distanceKm(market.center,{lat,lon})>market.radiusKm)return[];
  return[{name:t.name+' public calendar',url,kind:'venue',followEvents:true,venues:[{name:t.name,lat,lon,coordinateSource:`https://www.openstreetmap.org/${e.type}/${e.id}`}]}];
 });
}
export async function discoverVenueCalendars(market,request=fetch){
 const query=`[out:json][timeout:12];(nwr(around:${market.radiusKm*1000},${market.center.lat},${market.center.lon})[name][leisure~"^(stadium|park|sports_centre)$"];nwr(around:${market.radiusKm*1000},${market.center.lat},${market.center.lon})[name][amenity~"^(theatre|arts_centre|events_venue|conference_centre|nightclub)$"];);out center tags 1000;`;
 for(const base of ['https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter'])try{const url=new URL(base);url.searchParams.set('data',query);const r=await request(url,{signal:AbortSignal.timeout(15000)});if(!r.ok)continue;const p=await r.json();return{sources:venuesFromOsm(p,market),status:p.remark||p.elements?.length>=1000?'partial':'active'};}catch{}
 return{sources:[],status:'unavailable'};
}
export async function readVenueCalendar(source,market,now=Date.now(),request=fetch,lookup,opts={}){
 const queue=[source.url],visited=new Set(),feeds=new Set(),events=[],context=[],methods=new Set();let pages=0,parsed=false,failed=false,limited=false,reason='';
 for(let n=0;queue.length&&n<4;n++){
  const url=queue.shift(),key=url.toLowerCase();if(visited.has(key)){n--;continue;}visited.add(key);
  try{const result=await schoolPage(url,request,lookup);pages++;
   const ics=/BEGIN:VCALENDAR/.test(result.body)?schoolIcsEvents(result.body,market.timeZone):null;
   let records=ics?.events||[...structuredEvents(result.body),...publishedVenueEvents(result.body,source)];
   if(records.length)methods.add(ics?'ics':'json-ld/adapter');
   // No schema.org data on the page: read the venue's own feeds (Next.js page data,
   // iCalendar, The Events Calendar REST API, Localist API).
   if(!ics&&!records.length&&n===0){
    const next=nextDataEvents(result.body);if(next.length){records=next;methods.add('next-data');}
    for(const feed of records.length?[]:feedCandidates(result.body,result.url)){
     try{const f=await schoolPage(feed.url,request,lookup),body=f.body;
      const rows=feed.kind==='tribe'?tribeEvents(body,source):feed.kind==='localist'?localistEvents(body):/BEGIN:VCALENDAR/.test(body)?schoolIcsEvents(body,market.timeZone).events:[];
      if(rows.length){records=rows;methods.add(feed.kind);break;}
     }catch{}
    }
   }
   parsed ||= !!ics||records.length>0;limited ||= !!ics?.recurrenceLimited;
   if(opts.recordCount!=null)opts.recordCount+=records.length;
   for(const row of records){const why={},event=normalizePublicEvent(row,market,source,now,opts.horizonHours||36,why);if(!event&&opts.why)opts.why[why.reason||'other']=(opts.why[why.reason||'other']||0)+1;if(event)events.push({...event,demandEligible:true,timePrecision:'minute',locationPrecision:row.location?.geo?'venue':source.venues?.find(v=>v.name.toLowerCase()===String(event.venue).toLowerCase())?.locationPrecision||'venue'});
    else if(/^\d{4}-\d{2}-\d{2}$/.test(row.startDate||'')&&Date.parse(row.startDate+'T12:00:00Z')>=now-86400000&&Date.parse(row.startDate+'T12:00:00Z')<=now+7*86400000)context.push({name:row.name,eventDate:row.startDate,id:source.url+':'+row.name+':'+row.startDate,demandEligible:false});
   }
   if(source.followEvents){const origin=new URL(result.url).origin,links=schoolCalendarLinks(result.body,result.url).filter(u=>new URL(u).origin===origin);links.filter(u=>/\.ics(?:\?|$)|[?&]ical/i.test(u)).forEach(u=>feeds.add(u));queue.push(...links.filter(u=>/(?:\/events?\/[^/?]+|\.ics(?:\?|$)|[?&]ical)/i.test(u)&&!visited.has(u.toLowerCase())&&!queue.includes(u)));}
  }catch(e){failed=true;if(!reason)reason=String(e?.message||'').slice(0,60)||'network_error';}
 }
 limited ||= queue.length>0;
 if(!parsed&&!reason)reason='no_event_data';
 return{source:{name:source.name,url:source.url,status:!parsed?'unavailable':failed||limited?'partial':'active',pages,eventCount:events.length,truncated:limited,fetchedAt:parsed?new Date(now).toISOString():null,...(methods.size?{method:[...methods].join('+')}:{}),...(reason&&!parsed?{reason}:{})},discoveredSources:[...feeds].filter(url=>url!==source.url).map(url=>({...source,url})),events:[...new Map(events.map(e=>[publicData.eventIdentity(e),e])).values()],context};
}
export async function venueCalendars(market,sources,now=Date.now(),request=fetch,lookup){
 const results=[];let next=0;await Promise.all(Array.from({length:Math.min(6,sources.length)},async()=>{while(next<sources.length)results.push(await readVenueCalendar(sources[next++],market,now,request,lookup));}));
 return{status:results.length&&results.every(r=>r.source.status==='active')?'active':results.some(r=>r.source.status!=='unavailable')?'partial':'unavailable',fetchedAt:new Date(now).toISOString(),sources:results.map(r=>r.source),discoveredSources:results.flatMap(r=>r.discoveredSources||[]),events:[...new Map(results.flatMap(r=>r.events).map(e=>[publicData.eventIdentity(e),e])).values()],context:results.flatMap(r=>r.context)};
}
