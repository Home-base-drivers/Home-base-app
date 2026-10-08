import registry from '../config/school-calendar-sources.json' with {type:'json'};
import {distanceKm} from './public-events.mjs';
import {discoverSchools,schoolCalendars} from './school-events.mjs';

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
 return async input=>{
  const market=schoolSearchMarket(input),key=JSON.stringify(market),stamp=now();
  if(cache.size>100)cache.delete(cache.keys().next().value);if(pages.size>500)pages.delete(pages.keys().next().value);
  let entry=cache.get(key);
  if(!entry||stamp-entry.stamp>30*60000){
   const task=discoverSchools(market,request).then(d=>({schools:mergeSchoolRegistry(market,d.schools),discoveryStatus:d.status}));
   entry={stamp,task};cache.set(key,entry);
  }
  const discovery=await entry.task,cursor=Number(input.cursor)||0;
  if(!Number.isInteger(cursor)||cursor<0||cursor>discovery.schools.length)throw Error('Invalid school page');
  const selected=discovery.schools.slice(cursor,cursor+12),pageKey=key+':'+cursor;
  let page=pages.get(pageKey);
  if(!page||stamp-page.stamp>30*60000){page={stamp,task:schoolCalendars(market,[...selected,...(cursor===0?districtSchoolCalendars(market,discovery.schools):[])],stamp,request,lookup)};pages.set(pageKey,page);}
  const result=await page.task,nextCursor=cursor+selected.length<discovery.schools.length?cursor+selected.length:null;
  return{...result,discoveryStatus:discovery.discoveryStatus,schoolCount:discovery.schools.length,checkedCount:cursor+selected.length,nextCursor,center:market.center,radiusKm:market.radiusKm,exhaustive:false};
 };
}
