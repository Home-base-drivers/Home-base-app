import { publicEventCalendars, publishedAttendance } from './public-events.mjs';
import { scheduledSchoolCalendars } from './school-service.mjs';
import {venueCalendars} from './venue-calendars.mjs';
import {fromArchive,archiveFallback} from './calendar-archive-core.mjs';
import publicData from '../dist/homebase-public-data.js';
const jsonGetter=request=>async url=>{const r=await request(url,{signal:AbortSignal.timeout(12000),headers:{Accept:'application/json','User-Agent':'HomeBase public event context (github.com/Home-base-drivers/Home-base-app)'}});if(!r.ok)throw Error('Public source unavailable');return r.json();};
export const CAMPUS_CALENDARS=[{id:'towson',name:'Towson University',origin:'https://events.towson.edu'},{id:'morgan',name:'Morgan State University',origin:'https://events.morgan.edu'}];
// One campus Localist calendar. Includes yesterday: an evening performance can matter after midnight.
export async function readCampusCalendar(source,now=Date.now(),request=fetch,horizonHours=36){
  const name=source.name+' public calendar',days=Math.max(3,Math.ceil(horizonHours/24)+2);
  try{const p=await jsonGetter(request)(source.origin+'/api/2/events?start='+new Date(now-86400000).toISOString().slice(0,10)+'&days='+days+'&pp=100'),events=normalizeCampusEvents(p,now,source,horizonHours);
    return{events,source:{name,url:source.origin,status:'active',pages:1,eventCount:events.length,truncated:Number(p.page?.total)>100,fetchedAt:new Date(now).toISOString(),method:'localist-api'},discoveredSources:[],context:[]};}
  catch(e){return{events:[],source:{name,url:source.origin,status:'unavailable',pages:0,eventCount:0,reason:String(e?.message||'network_error').slice(0,60)},discoveredSources:[],context:[]};}
}
const validTime=value=>typeof value==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value));
export function normalizeCampusEvents(payload,now=Date.now(),source={id:"towson",name:"Towson University",origin:"https://events.towson.edu"},horizonHours=36){
  const rows=[];
  for(const wrapper of payload?.events||[]){const e=wrapper.event;if(!e||e.private||e.rejected||e.experience==='virtual'||e.status==='cancelled'||e.publish_status!=='published')continue;
    const lat=Number(e.geo?.latitude),lon=Number(e.geo?.longitude);if(e.geo?.latitude==null||e.geo?.longitude==null||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<38||lat>40||lon< -78||lon> -75)continue;
    for(const instance of e.event_instances||[]){const i=instance.event_instance;if(!i||i.all_day||!validTime(i.start)||(i.end!=null&&(!validTime(i.end)||Date.parse(i.end)<=Date.parse(i.start)))||(i.end?Date.parse(i.end)<now-90*60000:Date.parse(i.start)<now-6*3600000)||Date.parse(i.start)>now+horizonHours*3600000)continue;
      rows.push({id:source.id+':'+String(i.id),name:String(e.title||'Campus event').slice(0,180),venue:String(e.location_name||source.name).slice(0,160),lat,lon,eventStart:new Date(i.start).toISOString(),eventEnd:i.end?new Date(i.end).toISOString():null,url:typeof e.localist_url==='string'&&e.localist_url.startsWith(source.origin+'/')?e.localist_url:null,source:source.name+' public calendar',fetchedAt:new Date(now).toISOString(),attendance:null,...publishedAttendance(e,e.localist_url||source.origin),eventType:'campus',classification:Object.values(e.filters||{}).flat().map(f=>f.name).join(' ')});}
  }return [...new Map(rows.map(r=>[r.id,r])).values()];
}
export function normalizeWeather(payload){return(payload?.properties?.periods||[]).filter(p=>validTime(p.startTime)&&validTime(p.endTime)).map(p=>({start:p.startTime,end:p.endTime,rainProbability:p.probabilityOfPrecipitation?.value==null?null:Math.max(0,Math.min(100,Number(p.probabilityOfPrecipitation.value))),source:'National Weather Service forecast'}));}
export async function publicRecords(market,now=Date.now(),request=fetch,archive=null){
  if(!/baltimore/i.test(market.name)){
    // Same reader (JSON-LD, venue adapters, feeds, detail pages) and saved-archive
    // fallback as Baltimore's venue calendars.
    const [calendar,schools]=await Promise.all([(market.publicCalendars||[]).length?venueCalendars(market,market.publicCalendars,now,request,undefined,archive):publicEventCalendars(market,now,request),scheduledSchoolCalendars(market,now,request)]);
    return{status:calendar.status==='active'||schools.status==='partial'?'active':calendar.status,fetchedAt:calendar.fetchedAt||schools.fetchedAt,calendarStatus:schools.schoolCount?'partial':calendar.status,calendarTruncated:!!(calendar.truncated||calendar.sources?.some(s=>s.truncated))||schools.schoolCount>schools.checkedCount,sources:[...calendar.sources,...schools.sources],events:[...calendar.events,...schools.events],schoolContext:schools.context,schoolCoverage:{schoolCount:schools.schoolCount,checkedCount:schools.checkedCount,discoveryStatus:schools.discoveryStatus,exhaustive:false},weatherStatus:'not_supported',weather:[]};
  }
  const get=jsonGetter(request);
  const [campusResults,calendar,weather,schools]=await Promise.all([
    Promise.all(CAMPUS_CALENDARS.map(source=>{const key={name:source.name+' public calendar',url:source.origin};return fromArchive(archive,key,now,market.timeZone,36)||readCampusCalendar(source,now,request).then(live=>archiveFallback(archive,key,live,now,36));})),
    venueCalendars(market,market.publicCalendars||[],now,request,undefined,archive),
    get('https://api.weather.gov/points/39.2904,-76.6122').then(p=>{const url=p.properties?.forecastHourly;if(typeof url!=='string'||!url.startsWith('https://api.weather.gov/'))throw Error('Invalid forecast URL');return get(url);}).then(normalizeWeather).then(value=>({status:'active',value}),()=>({status:'unavailable',value:[]})),
    scheduledSchoolCalendars(market,now,request)
  ]);
  const sources=[...campusResults.map(c=>c.source),...(calendar.sources||[]),...schools.sources],loaded=sources.filter(s=>s.status==='active').length;
  const calendarStatus=loaded===sources.length?'active':sources.some(s=>s.pages)?'partial':'unavailable';
  return{status:calendarStatus!=='unavailable'||weather.status==='active'?'active':'unavailable',fetchedAt:new Date(now).toISOString(),calendarStatus:schools.schoolCount?'partial':calendarStatus,weatherStatus:weather.status,calendarTruncated:sources.some(s=>s.truncated)||schools.schoolCount>schools.checkedCount,sources,events:[...new Map([...campusResults.flatMap(c=>c.events),...calendar.events,...schools.events].map(e=>[publicData.eventIdentity(e),e])).values()],schoolContext:[...schools.context,...calendar.context],schoolCoverage:{schoolCount:schools.schoolCount,checkedCount:schools.checkedCount,discoveryStatus:schools.discoveryStatus,exhaustive:false},weather:weather.value};
}
