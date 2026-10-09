import registry from '../config/school-calendar-sources.json' with {type:'json'};
import {distanceKm} from './public-events.mjs';
import {discoverSchools,schoolCalendars} from './school-events.mjs';
import {registeredVenueCalendars,discoverVenueCalendars,venueCalendars} from './venue-calendars.mjs';
import {calendarArea,localCalendarSources,mergeCalendarSources,DISCOVERY_TTL} from './calendar-registry.mjs';
export {cloudCalendarRegistry} from './calendar-registry.mjs';

export function schoolSearchMarket(input){
 const lat=Number(input?.lat),lon=Number(input?.lon);
 if(input?.lat==null||input?.lon==null||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw Error('A valid location is required');
 const timeZone=String(input.timeZone||'');try{new Intl.DateTimeFormat('en',{timeZone}).format();}catch{throw Error('A valid local timezone is required');}
 // No exact driver coordinate, name, or identity is sent to public sites or retained.
 return{center:{lat:Math.round(lat*100)/100,lon:Math.round(lon*100)/100},radiusKm:Math.min(65,Math.max(10,Number(input.radiusKm)||35)),timeZone};
}
export function mergeSchoolRegistry(market,discovered=[]){
 const seeds=registry.sources.filter(s=>distanceKm(market.center,s)<=market.radiusKm),rows=[...seeds];
 for(const s of discovered)if(!rows.some(r=>r.name.toLowerCase()===s.name.toLowerCase()&&distanceKm(r,s)<2))rows.push(s);
 return rows;
}
export function districtSchoolCalendars(market,schools){
 if(distanceKm(market.center,{lat:39.29,lon:-76.61})>65)return[];
 return[{name:'Baltimore City public school athletics',url:'https://baltimorecityschoolsathletics.digitalsports.com/pages/schedule/league-schedule.php',adapter:'digitalsports',venues:schools},{name:'Baltimore County public school athletics',url:'https://baltimorecountyathletics.digitalsports.com/pages/schedule/league-schedule.php',adapter:'digitalsports',venues:schools}];
}
export async function scheduledSchoolCalendars(market,now=Date.now(),request=fetch){
 if(!Number.isFinite(market.center?.lat)||!Number.isFinite(market.center?.lon)||!market.timeZone)return{status:'unavailable',fetchedAt:null,sources:[],events:[],context:[],schoolCount:0,checkedCount:0,discoveryStatus:'unavailable',exhaustive:false};
 const discovery=await discoverSchools(market,request),schools=mergeSchoolRegistry(market,discovery.schools);
 const result=await schoolCalendars(market,[...schools.slice(0,36),...districtSchoolCalendars(market,schools)],now,request);
 return{...result,discoveryStatus:discovery.status,checkedCount:Math.min(36,schools.length),schoolCount:schools.length,exhaustive:false};
}
export function makeSchoolSearch({request=fetch,lookup,now=()=>Date.now()}={}){
 const cache=new Map(),pages=new Map();
 return async (input,session={})=>{
  const market=schoolSearchMarket(input),key=(session.userId||'device:'+String(input.sessionKey||''))+JSON.stringify(market),stamp=now(),first=Number(input.cursor||0)===0;
  if(input.refresh===true&&first){for(const k of pages.keys())if(k.startsWith(key+':'))pages.delete(k);}
  if(cache.size>100)cache.delete(cache.keys().next().value);if(pages.size>500)pages.delete(pages.keys().next().value);
  let entry=cache.get(key);
  let registryStatus=session.registry?'synced':'device';
  if(first||!entry){
   let saved={sources:localCalendarSources(input.savedSources,market),discoveredAt:Number(input.discoveredAt)||0,discoveryStatus:'partial'};
   if(session.registry)try{saved=await session.registry.load(market);}catch{registryStatus='unavailable';saved={sources:[],discoveredAt:0};}
   const previous=entry?await entry.task:null;
   const task=(async()=>{
    const recent=Math.min(stamp,Math.max(previous?.discoveredAt||0,saved.discoveredAt||0)),discover=!recent||stamp-recent>DISCOVERY_TTL;
    const [d,v]=discover?await Promise.all([discoverSchools(market,request),discoverVenueCalendars(market,request)]):[{schools:[],status:saved.discoveryStatus||previous?.discoveryStatus},{sources:[],status:saved.discoveryStatus||previous?.discoveryStatus}];
    const center=calendarArea(market),seeds=[...registeredVenueCalendars(market),...mergeSchoolRegistry(market,d.schools)],schools=mergeCalendarSources(saved.sources,localCalendarSources(previous?.schools,market),seeds,v.sources).map(s=>({...s,registryCenter:s.registryCenter||center}));
    schools.push(...seeds.filter(s=>!s.url));
    const discoveryStatus=d.status==='active'&&v.status==='active'?'active':'partial',discoveredAt=discover?stamp:recent;
    if(session.registry)try{await session.registry.save(market,schools,discoveredAt,discoveryStatus);}catch{registryStatus='unavailable';}
    return{schools,discoveryStatus,discoveredAt,registryStatus};
   })();
   entry={stamp,task};cache.set(key,entry);
  }
  const discovery=await entry.task,cursor=Number(input.cursor)||0;registryStatus=discovery.registryStatus;
  if(!Number.isInteger(cursor)||cursor<0||cursor>discovery.schools.length)throw Error('Invalid school page');
  const selected=discovery.schools.slice(cursor,cursor+12),pageKey=key+':'+cursor;
  let page=pages.get(pageKey);
  if(!page||stamp-page.stamp>30*60000){page={stamp,task:Promise.all([schoolCalendars(market,[...selected.filter(s=>s.kind!=='venue'),...(cursor===0?districtSchoolCalendars(market,discovery.schools.filter(s=>s.kind!=='venue')):[])],stamp,request,lookup),venueCalendars(market,selected.filter(s=>s.kind==='venue'),stamp,request,lookup)]).then(results=>({status:results.some(r=>r.status!=='unavailable')?'partial':'unavailable',sources:results.flatMap(r=>r.sources),discoveredSources:results.flatMap(r=>r.discoveredSources||[]),events:results.flatMap(r=>r.events),context:results.flatMap(r=>r.context),fetchedAt:new Date(stamp).toISOString()}))};pages.set(pageKey,page);}
  const result=await page.task,newSources=localCalendarSources(result.discoveredSources.map(s=>({...s,registryCenter:s.registryCenter||calendarArea(market)})),market);
  if(newSources.length){const known=new Set(discovery.schools.map(s=>s.url));discovery.schools.push(...mergeCalendarSources(newSources).filter(s=>!known.has(s.url)));if(session.registry)try{await session.registry.save(market,newSources,0,discovery.discoveryStatus);}catch{registryStatus='unavailable';}}
  const nextCursor=cursor+selected.length<discovery.schools.length?cursor+selected.length:null;
  return{...result,discoveredSources:undefined,registryStatus,registrySources:first?localCalendarSources(discovery.schools,market):newSources,discoveredAt:discovery.discoveredAt,discoveryStatus:discovery.discoveryStatus,schoolCount:discovery.schools.length,checkedCount:cursor+selected.length,nextCursor,center:market.center,radiusKm:market.radiusKm,exhaustive:false};
 };
}
