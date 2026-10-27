import markets from '../config/provider-markets.json' with {type:'json'};
import publicData from '../dist/homebase-public-data.js';
import {distanceKm,structuredEvents,publishedVenueEvents,normalizePublicEvent,nextDataEvents,feedCandidates,tribeEvents,localistEvents} from './public-events.mjs';
import {fromArchive,archiveFallback} from './calendar-archive-core.mjs';
import {schoolPage,schoolCalendarLinks,schoolIcsEvents,publicSchoolUrl} from './school-events.mjs';

// Venue calendars change rarely and are small: keep a week of listings so the model
// sees what is coming, not only the next day and a half.
export const VENUE_HORIZON_HOURS=7*24;
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
// Saffire venue sites (e.g. Baltimore Convention Center) render their calendar in the
// browser from a public JSON web service; read that service directly.
function saffireDate(ms){const d=new Date(ms);return`${String(d.getUTCMonth()+1).padStart(2,'0')}/${String(d.getUTCDate()).padStart(2,'0')}/${d.getUTCFullYear()}`;}
function clockTime(text){const m=String(text||'').match(/(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m/i);if(!m)return null;let h=+m[1]%12;if(/p/i.test(m[3]))h+=12;return`${String(h).padStart(2,'0')}:${m[2]||'00'}`;}
export function saffireEvents(payload,source){
 const venue=source.venues?.[0],rows=[];
 for(const day of payload?.d?.Days||[]){const date=String(day.DateString||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!date)continue;const iso=`${date[3]}-${date[1]}-${date[2]}`;
  for(const slot of day.Times||[])for(const item of slot.Items||[]){if(item.IsPrivate||item.IsMemberOnly||!item.Name)continue;
   const range=String(item.EventTimeRangeString||''),parts=range.split(/\s*[-–]\s*/),start=clockTime(slot.HasSpecificTime?slot.TimeDisplay:'')||clockTime(parts[0]),end=start&&parts[1]?clockTime(parts[1]):null;
   // Conventions and expos usually publish only the day: model typical show hours
   // (9 AM-5 PM) and flag the time as approximate rather than dropping the event.
   rows.push({'@type':'Event',name:item.Name,startDate:`${iso}T${start||'09:00'}:00`,endDate:(end||(start?null:'17:00'))?`${iso}T${end||'17:00'}:00`:undefined,url:item.DetailURL||source.url,location:{name:item.Locations?.[0]?.Name||venue?.name},description:source.classification||'convention',approximateTime:!start,eventId:item.EventID});}
 }
 return rows;
}
export async function readSaffireCalendar(source,market,now=Date.now(),request=fetch,horizonHours=VENUE_HORIZON_HOURS){
 const api=source.api||new URL('/services/eventsservice.asmx',source.url).href,headers={'Content-Type':'application/json; charset=utf-8',Accept:'application/json','User-Agent':'HomeBaseDrivers/1.0 (+https://homebasedrivers.com)'};
 const common={day:'',categoryID:0,tagID:0,keywords:'%%',isFeatured:'false',fanPicks:'false',pastEvents:'false',allEvents:'false',memberEvents:'false',memberOnly:'false',showCategoryExceptionID:0,isolatedSchedule:0,customFieldFilters:[],searchInDescription:false};
 const post=async(method,body)=>{const r=await request(api+'/'+method,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('http_'+r.status);return r.json();};
 const days=await post('GetEventDays',{...common,startDate:saffireDate(now-86400000),endDate:saffireDate(now+horizonHours*3600000),currentUserItems:'false',myPicks:'false'});
 const dates=(days?.d||[]).filter(d=>/^\d{2}\/\d{2}\/\d{4}$/.test(d)).slice(0,60);
 return dates.length?saffireEvents(await post('GetEventDaysByList',{...common,dates:dates.join(',')}),source):[];
}
export async function readVenueCalendar(source,market,now=Date.now(),request=fetch,lookup,opts={}){
 if(source.adapter==='saffire'){
  try{const rows=await readSaffireCalendar(source,market,now,request,opts.horizonHours||VENUE_HORIZON_HOURS),events=[];if(opts.recordCount!=null)opts.recordCount+=rows.length;
   for(const row of rows){const why={},event=normalizePublicEvent(row,market,source,now,opts.horizonHours||VENUE_HORIZON_HOURS,why);if(!event&&opts.why)opts.why[why.reason||'other']=(opts.why[why.reason||'other']||0)+1;if(event)events.push({...event,demandEligible:true,timePrecision:row.approximateTime?'approximate':'minute',...(row.approximateTime?{timeNote:'Hours not published; modeled 9 AM-5 PM'}:{}),locationPrecision:'venue'});}
   return{source:{name:source.name,url:source.url,status:'active',pages:2,eventCount:events.length,truncated:false,fetchedAt:new Date(now).toISOString(),method:'saffire-api'},discoveredSources:[],events:[...new Map(events.map(e=>[publicData.eventIdentity(e),e])).values()],context:[]};
  }catch(e){return{source:{name:source.name,url:source.url,status:'unavailable',pages:0,eventCount:0,truncated:false,fetchedAt:null,method:'saffire-api',reason:String(e?.message||'network_error').slice(0,60)},discoveredSources:[],events:[],context:[]};}
 }
 const queue=[source.url],visited=new Set(),feeds=new Set(),events=[],context=[],methods=new Set();let pages=0,parsed=false,failed=false,limited=false,reason='',firstBody='',firstUrl='',listingRecords=0;
 for(let n=0;queue.length&&n<4;n++){
  const url=queue.shift(),key=url.toLowerCase();if(visited.has(key)){n--;continue;}visited.add(key);
  try{const result=await schoolPage(url,request,lookup);pages++;if(n===0){firstBody=result.body;firstUrl=result.url;}
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
   if(n===0)listingRecords=records.length;
   parsed ||= !!ics||records.length>0;limited ||= !!ics?.recurrenceLimited;
   if(opts.recordCount!=null)opts.recordCount+=records.length;
   for(const row of records){const why={},event=normalizePublicEvent(row,market,source,now,opts.horizonHours||VENUE_HORIZON_HOURS,why);if(!event&&opts.why)opts.why[why.reason||'other']=(opts.why[why.reason||'other']||0)+1;if(event)events.push({...event,demandEligible:true,timePrecision:'minute',locationPrecision:row.location?.geo?'venue':source.venues?.find(v=>v.name.toLowerCase()===String(event.venue).toLowerCase())?.locationPrecision||'venue'});
    else if(/^\d{4}-\d{2}-\d{2}$/.test(row.startDate||'')&&Date.parse(row.startDate+'T12:00:00Z')>=now-86400000&&Date.parse(row.startDate+'T12:00:00Z')<=now+7*86400000)context.push({name:row.name,eventDate:row.startDate,id:source.url+':'+row.name+':'+row.startDate,demandEligible:false});
   }
   if(source.followEvents){const origin=new URL(result.url).origin,links=schoolCalendarLinks(result.body,result.url).filter(u=>new URL(u).origin===origin);links.filter(u=>/\.ics(?:\?|$)|[?&]ical/i.test(u)).forEach(u=>feeds.add(u));queue.push(...links.filter(u=>/(?:\/events?\/[^/?]+|\.ics(?:\?|$)|[?&]ical)/i.test(u)&&!visited.has(u.toLowerCase())&&!queue.includes(u)));}
  }catch(e){failed=true;if(!reason)reason=String(e?.message||'').slice(0,60)||'network_error';}
 }
 // Listing pages with no data of their own (WordPress venue plugins, aggregators):
 // read each listed event's own page, which usually carries schema.org Event data.
 if(firstBody&&!listingRecords&&(source.followEvents||source.detailPages)){
  const origin=new URL(firstUrl).origin,max=Number(source.maxDetails)||24,links=new Set();
  for(const m of firstBody.matchAll(/href=["']([^"'#]+)["']/gi)){let u;try{u=new URL(m[1].replace(/&amp;/g,'&'),firstUrl);}catch{continue;}
   if(u.origin!==origin||!/\/events?\/[^/?#]{3,}/i.test(u.pathname)||/\/(?:category|tag|page|feed|calendar|list|month|week|day)\b|ical|season-pass|gift-card/i.test(u.pathname+u.search))continue;
   u.hash='';links.add(u.href);if(links.size>=max)break;}
  const list=[...links].filter(u=>!visited.has(u.toLowerCase()));let next=0,read=0;
  await Promise.all(Array.from({length:Math.min(4,list.length)},async()=>{while(next<list.length){const u=list[next++];try{const r=await schoolPage(u,request,lookup);read++;
   const rows=structuredEvents(r.body);if(opts.recordCount!=null)opts.recordCount+=rows.length;
   for(const row of rows){const why={},event=normalizePublicEvent({url:u,...row},market,source,now,opts.horizonHours||VENUE_HORIZON_HOURS,why);if(!event&&opts.why)opts.why[why.reason||'other']=(opts.why[why.reason||'other']||0)+1;if(event)events.push({...event,demandEligible:true,timePrecision:'minute',locationPrecision:row.location?.geo?'venue':'venue'});}
   if(rows.length)parsed=true;}catch{}}}));
  if(read){pages+=read;methods.add('detail-pages');}
 }
 limited ||= queue.length>0;
 if(!parsed&&!reason)reason='no_event_data';
 return{source:{name:source.name,url:source.url,status:!parsed?'unavailable':failed||limited?'partial':'active',pages,eventCount:events.length,truncated:limited,fetchedAt:parsed?new Date(now).toISOString():null,...(methods.size?{method:[...methods].join('+')}:{}),...(reason&&!parsed?{reason}:{})},discoveredSources:[...feeds].filter(url=>url!==source.url).map(url=>({...source,url})),events:[...new Map(events.map(e=>[publicData.eventIdentity(e),e])).values()],context};
}
// archive: saved daily-check results (calendar-archive-core.mjs). A calendar read
// successfully today is served from it; a calendar that fails falls back to it.
export async function venueCalendars(market,sources,now=Date.now(),request=fetch,lookup,archive=null){
 const results=[];let next=0;await Promise.all(Array.from({length:Math.min(6,sources.length)},async()=>{while(next<sources.length){const source=sources[next++];
  const saved=archive&&fromArchive(archive,source,now,market.timeZone,VENUE_HORIZON_HOURS);
  results.push(saved||archiveFallback(archive,source,await readVenueCalendar(source,market,now,request,lookup),now,VENUE_HORIZON_HOURS));}}));
 return{status:results.length&&results.every(r=>r.source.status==='active')?'active':results.some(r=>r.source.status!=='unavailable')?'partial':'unavailable',fetchedAt:new Date(now).toISOString(),sources:results.map(r=>r.source),discoveredSources:results.flatMap(r=>r.discoveredSources||[]),events:[...new Map(results.flatMap(r=>r.events).map(e=>[publicData.eventIdentity(e),e])).values()],context:results.flatMap(r=>r.context)};
}
