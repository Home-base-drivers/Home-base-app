import {distanceKm} from './public-events.mjs';
import {publicSchoolUrl} from './school-events.mjs';

export const DISCOVERY_TTL=24*3600000;
export function calendarArea(market){return{lat:Math.round(market.center.lat*4)/4,lon:Math.round(market.center.lon*4)/4};}
export function localCalendarSources(rows,market){
 return(rows||[]).filter(s=>s&&typeof s.name==='string'&&s.name.length<=300&&publicSchoolUrl(s.url)&&JSON.stringify(s).length<=20000).filter(s=>{
  const points=Number.isFinite(s.lat)&&Number.isFinite(s.lon)?[s]:s.venues?.filter(v=>Number.isFinite(v.lat)&&Number.isFinite(v.lon))||[];
  return points.length?points.some(p=>distanceKm(market.center,p)<=market.radiusKm):Number.isFinite(s.registryCenter?.lat)&&Number.isFinite(s.registryCenter?.lon)&&distanceKm(market.center,s.registryCenter)<=market.radiusKm;
 });
}
export function mergeCalendarSources(...lists){return[...new Map(lists.flat().filter(s=>s.url).map(s=>[s.url,s])).values()];}

// Requests use the driver's verified JWT. Database RLS remains the authority.
export function cloudCalendarRegistry({url,key,authorization,userId,request=fetch}){
 const headers={apikey:key,Authorization:authorization,'Content-Type':'application/json'};
 async function rest(path,options={}){const r=await request(url+'/rest/v1/'+path,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Private calendar registry unavailable');if(options.method==='POST'||r.status===204){await r.body?.cancel();return null;}return r.json();}
 return{
  async load(market){
   const area=calendarArea(market),latRange=market.radiusKm/110+.15,lonRange=Math.min(180,latRange/Math.max(.01,Math.cos(market.center.lat*Math.PI/180)));
   // Paginate the owner's nearby history; no other driver's rows or remote cities.
   const sources=[];for(let offset=0;;offset+=500){const query=new URLSearchParams({select:'definition',user_id:'eq.'+userId,and:`(lat.gte.${market.center.lat-latRange},lat.lte.${market.center.lat+latRange},lon.gte.${market.center.lon-lonRange},lon.lte.${market.center.lon+lonRange})`,order:'url',limit:'500',offset:String(offset)});const rows=await rest('user_calendar_sources?'+query);sources.push(...rows.map(r=>r.definition));if(rows.length<500)break;}
   const areas=await rest('user_calendar_areas?'+new URLSearchParams({select:'discovered_at,status',user_id:'eq.'+userId,lat:'eq.'+area.lat,lon:'eq.'+area.lon,radius_km:'eq.'+market.radiusKm}));
   return{sources:localCalendarSources(sources,market),discoveredAt:Date.parse(areas[0]?.discovered_at)||0,discoveryStatus:areas[0]?.status||'unavailable'};
  },
  async save(market,sources,discoveredAt,status){
   const area=calendarArea(market),rows=localCalendarSources(sources,market).map(s=>{const p=Number.isFinite(s.lat)?s:s.venues?.filter(v=>Number.isFinite(v.lat)&&Number.isFinite(v.lon)).sort((a,b)=>distanceKm(market.center,a)-distanceKm(market.center,b))[0]||s.registryCenter;return{user_id:userId,url:s.url,lat:Math.round(p.lat*4)/4,lon:Math.round(p.lon*4)/4,definition:s};});
   for(let i=0;i<rows.length;i+=100)await rest('user_calendar_sources?on_conflict=user_id,url',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rows.slice(i,i+100))});
   if(discoveredAt)await rest('user_calendar_areas?on_conflict=user_id,lat,lon,radius_km',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({user_id:userId,...area,radius_km:market.radiusKm,discovered_at:new Date(discoveredAt).toISOString(),status})});
  }
 };
}
