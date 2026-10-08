import { distanceKm, zonedEventTime, structuredEvents } from './public-events.mjs';

const DAY=86400000;
const text=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
const token=s=>text(s).toLowerCase().replace(/[^a-z0-9]/g,'');
export function schoolEventRelevant(value){
 const s=text(value).toLowerCase();
 if(/virtual|webinar|cancelled|canceled|postponed|reschedul|practice|rehearsal|office hours|class meeting|advising|club meeting|exam|registration deadline|ticket sale|volunteer application|cabanas|vip upgrade|parking pass|spirit week|dress.up|seminar|workshop|campus tour/.test(s))return false;
 return /homecoming|prom\b|football|basketball|soccer|volleyball|baseball|lacrosse|hockey|concert|performance|theatre|theater|musical|graduation|commencement|festival|gala|reunion|tailgate|bonfire|carnival|dance\b|family weekend|parents.weekend|pep rally/.test(s);
}
export function publicSchoolUrl(value,base){
 try{const u=new URL(String(value).replace(/^webcal:/,'https:').replace(/&amp;/g,'&'),base);
  if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!u.hostname.includes('.')||/[:\[\]]/.test(u.hostname)||/^\d+(?:\.\d+){3}$/.test(u.hostname)||/(^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname))return null;
  return u.href;
 }catch{return null;}
}
export function publicAddress(address){
 if(address.includes(':'))return /^[23][0-9a-f]{3}:/i.test(address)&&!/^2001:db8:/i.test(address);
 const a=address.split('.').map(Number);if(a.length!==4||a.some(n=>!Number.isInteger(n)||n<0||n>255))return false;
 return !(a[0]===0||a[0]===10||a[0]===127||a[0]>=224||a[0]===169&&a[1]===254||a[0]===172&&a[1]>=16&&a[1]<=31||a[0]===192&&[0,168].includes(a[1])||a[0]===100&&a[1]>=64&&a[1]<=127||a[0]===198&&[18,19,51].includes(a[1])||a[0]===203&&a[1]===0&&a[2]===113);
}
export async function schoolPage(url,request=fetch,lookup){
 if(request===fetch&&!lookup)lookup=async host=>(await import('node:dns/promises')).resolve4(host);
 for(let hop=0;hop<4;hop++){
  url=publicSchoolUrl(url);if(!url)throw Error('Invalid public calendar URL');
  if(lookup){const addresses=await lookup(new URL(url).hostname);if(!addresses.length||addresses.some(a=>!publicAddress(a)))throw Error('Calendar host is not public');}
  const r=await request(url,{redirect:'manual',signal:AbortSignal.timeout(7000),headers:{Accept:'text/html, text/calendar, application/json','User-Agent':'HomeBase public school calendars (+https://github.com/Home-base-drivers/Home-base-app)'}});
  if([301,302,303,307,308].includes(r.status)){url=publicSchoolUrl(r.headers.get('location'),url);continue;}
  if(!r.ok)throw Error('Calendar unavailable');
  if(Number(r.headers?.get('content-length'))>3000000)throw Error('Calendar too large');
  const body=await r.text();if(body.length>3000000)throw Error('Calendar too large');return{url,body};
 }throw Error('Too many calendar redirects');
}
export function schoolCalendarLinks(html,base){
 const out=[];
 for(const m of String(html).matchAll(/<(?:a|link)\b[^>]*(?:href)=["']([^"']+)["'][^>]*>(?:([^<]*)<\/a>)?/gi)){
  const url=publicSchoolUrl(m[1],base);if(!url||!/calendar|events?|athletic|homecoming|\.ics|ical|webcal/i.test(url+' '+m[2]))continue;
  // Follow only links the school publishes. Login/private calendars are excluded.
  if(/login|signin|sign-in|logout|oauth|private/i.test(url))continue;
  out.push({url,priority:/\.ics|ical|webcal/i.test(url)?3:schoolEventRelevant(m[2])?2:/calendar|homecoming|athletic/i.test(url)?1:0});
 }
 return [...new Set(out.sort((a,b)=>b.priority-a.priority).map(x=>x.url))];
}
function icsTime(value,zone){
 const m=String(value).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
 return m?zonedEventTime(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]||'00'}${m[7]||''}`,zone):null;
}
export function schoolIcsEvents(body,timeZone){
 const events=[];let recurrenceLimited=false;
 const unfolded=String(body).replace(/\r?\n[ \t]/g,'');
 for(const block of unfolded.matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/g)){
  const props={};for(const line of block[1].split(/\r?\n/)){const i=line.indexOf(':');if(i<0)continue;const header=line.slice(0,i),key=header.split(';')[0];props[key]={header,value:line.slice(i+1).replace(/\\n/gi,' ').replace(/\\([,;\\])/g,'$1')};}
  const start=props.DTSTART;if(!start||props.STATUS?.value==='CANCELLED'||props.CLASS&&props.CLASS.value!=='PUBLIC')continue;
  // Never manufacture occurrences without expanding RRULE/EXDATE correctly.
  if(props.RRULE){recurrenceLimited=true;continue;}
  const zone=start.header.match(/TZID=([^;:]+)/)?.[1]?.replace(/^"|"$/g,'')||timeZone;
  const startDate=icsTime(start.value,zone)||(/^\d{8}$/.test(start.value)?start.value.replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3'):null);
  if(!startDate)continue;
  const geo=props.GEO?.value.split(';').map(Number);
  events.push({'@type':'Event',name:props.SUMMARY?.value,startDate,endDate:icsTime(props.DTEND?.value,props.DTEND?.header.match(/TZID=([^;:]+)/)?.[1]||zone),location:{name:props.LOCATION?.value||'',...(geo?.length===2?{geo:{latitude:geo[0],longitude:geo[1]}}:{})},url:props.URL?.value,description:props.DESCRIPTION?.value});
 }return{events,recurrenceLimited};
}
export function blackbaudSchoolEvents(html){
 const rows=[];
 for(const m of String(html).matchAll(/<div\b[^>]*class=["'][^"']*event-detail[^"']*["'][^>]*>([\s\S]*?)(?=<\/li>)/gi)){
  const b=m[1],title=b.match(/<h4[^>]*class=["'][^"']*event-title[^"']*["'][^>]*>([\s\S]*?)<\/h4>/i)?.[1],date=text(b.match(/class=["']start-date["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]),start=text(b.match(/class=["']start-time["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]),end=text(b.match(/class=["']end-time["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]).replace(/^to\s*/,''),location=text(b.match(/class=["']location["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]);
  const d=date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/),clock=s=>{const t=s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);return t&&+t[1]>=1&&+t[1]<=12?String((+t[1]%12)+(t[3].toUpperCase()==='PM'?12:0)).padStart(2,'0')+':'+t[2]+':00':null;};
  if(!d||!title)continue;const day=`${d[3]}-${d[1].padStart(2,'0')}-${d[2].padStart(2,'0')}`,s=clock(start),e=clock(end);
  rows.push({'@type':'Event',name:text(title),startDate:day+(s?'T'+s:''),endDate:e?day+'T'+e:null,url:title.match(/href=["']([^"']+)/i)?.[1],location:{name:location}});
 }return rows;
}
export function normalizeSchoolEvent(e,school,market,sourceUrl,now=Date.now()){
 if(!schoolEventRelevant([e.name,e.description,e.eventStatus].join(' '))||/OnlineEventAttendanceMode/.test(e.eventAttendanceMode||'')||e.private)return null;
 const name=text(e.name),location=[e.location].flat().find(v=>v&&typeof v==='object')||{},venue=text(location.name),geo=location.geo;
 let lat=geo?.latitude==null?null:Number(geo.latitude),lon=geo?.longitude==null?null:Number(geo.longitude);
 // Only explicitly identified campus venues may inherit the mapped school point.
 const onsite=token(venue)===token(school.name)||/^(?:home|campus|on campus)$/i.test(venue)||school.campusVenues?.some(v=>token(v)===token(venue));
 if(lat===null&&lon===null&&onsite){lat=school.lat;lon=school.lon;}
 if(lat===null||lon===null||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||distanceKm(market.center,{lat,lon})>market.radiusKm)return null;
 const url=publicSchoolUrl(e.url,sourceUrl)||sourceUrl,start=zonedEventTime(e.startDate,market.timeZone),end=zonedEventTime(e.endDate,market.timeZone);
 const common={id:`school:${url}:${e.startDate}`,name,venue:venue||school.name,lat,lon,url,source:school.name+' public calendar',sourceUrl,fetchedAt:new Date(now).toISOString(),eventType:'school_event '+(e['@type']||'Event'),classification:school.kind||'school',attendance:null,locationPrecision:geo?'venue':'campus'};
 if(!start){if(!/^\d{4}-\d{2}-\d{2}$/.test(e.startDate||''))return null;const day=Date.parse(e.startDate+'T12:00:00Z');if(!Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==e.startDate||day<now-DAY||day>now+7*DAY)return null;return{...common,eventDate:e.startDate,eventStart:null,eventEnd:null,timePrecision:'date',demandEligible:false};}
 const finish=end&&Date.parse(end)>Date.parse(start)?end:null;
 if(Date.parse(start)>now+7*DAY||(finish?Date.parse(finish)<now-90*60000:Date.parse(start)<now-6*3600000))return null;
 return{...common,eventStart:start,eventEnd:finish,timePrecision:'minute',demandEligible:true};
}
export function schoolsFromOsm(payload,market){
 const seen=new Set();return(payload?.elements||[]).flatMap(e=>{const t=e.tags||{},lat=e.lat??e.center?.lat,lon=e.lon??e.center?.lon,name=t.name,website=publicSchoolUrl(t.website||t['contact:website']);
  if(!name||!Number.isFinite(lat)||!Number.isFinite(lon)||distanceKm(market.center,{lat,lon})>market.radiusKm)return[];
  if(!/university|college/.test(t.amenity||'')&&/elementary|primary|kindergarten|nursery|middle school/i.test(name+' '+(t['school:level']||'')))return[];
  const key=token(name)+':'+Math.round(lat*1000)+':'+Math.round(lon*1000);if(seen.has(key))return[];seen.add(key);
  return[{name,lat,lon,url:website,kind:/university|college/.test(t.amenity||'')?'college':'high_school',coordinateSource:`https://www.openstreetmap.org/${e.type}/${e.id}`}];
 }).sort((a,b)=>distanceKm(market.center,a)-distanceKm(market.center,b));
}
export async function discoverSchools(market,request=fetch){
 const radius=Math.min(65000,market.radiusKm*1000),query=`[out:json][timeout:12];nwr(around:${radius},${market.center.lat},${market.center.lon})[name][amenity~"^(school|college|university)$"];out center tags 1000;`;
 for(const base of ['https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter'])try{const u=new URL(base);u.searchParams.set('data',query);const r=await request(u,{signal:AbortSignal.timeout(15000),headers:{Accept:'application/json','User-Agent':'HomeBase public school calendar discovery (+https://github.com/Home-base-drivers/Home-base-app)'}});if(!r.ok)continue;const p=await r.json();return{schools:schoolsFromOsm(p,market),status:p.remark||p.elements?.length>=1000?'partial':'active'};}catch{}
 // Independent public institution index when Overpass is unavailable.
 try{const q=`SELECT ?school ?schoolLabel ?location ?website WHERE { SERVICE wikibase:around { ?school wdt:P625 ?location . bd:serviceParam wikibase:center "Point(${market.center.lon} ${market.center.lat})"^^geo:wktLiteral . bd:serviceParam wikibase:radius "${market.radiusKm}" . } VALUES ?class { wd:Q3914 wd:Q3918 wd:Q189533 } ?school wdt:P31/wdt:P279* ?class . OPTIONAL { ?school wdt:P856 ?website . } SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . } } LIMIT 500`,u=new URL('https://query.wikidata.org/sparql');u.searchParams.set('query',q);u.searchParams.set('format','json');const r=await request(u,{signal:AbortSignal.timeout(15000),headers:{Accept:'application/sparql-results+json','User-Agent':'HomeBase public school calendar discovery'}});if(r.ok){const p=await r.json();return{schools:schoolsFromWikidata(p,market),status:'partial'};}}catch{}
 return{schools:[],status:'unavailable'};
}
export function schoolsFromWikidata(payload,market){
 const seen=new Set();return(payload?.results?.bindings||[]).flatMap(b=>{const coords=b.location?.value?.match(/^Point\((-?[\d.]+) (-?[\d.]+)\)$/),name=b.schoolLabel?.value,id=b.school?.value;
  if(!coords||!name||/^(?:Q\d+)$|primary|elementary|kindergarten|nursery|middle school/i.test(name)||!/^https?:\/\/www.wikidata.org\/entity\/Q\d+$/.test(id||''))return[];
  const lat=Number(coords[2]),lon=Number(coords[1]);if(!Number.isFinite(lat)||!Number.isFinite(lon)||distanceKm(market.center,{lat,lon})>market.radiusKm||seen.has(id))return[];seen.add(id);
  return[{name,lat,lon,url:publicSchoolUrl(b.website?.value),kind:/university|college/i.test(name)?'college':'high_school',coordinateSource:id.replace('http:','https:')}];
 });
}
export function digitalSportsEvents(html,schools=[]){
 const rows=[];
 for(const m of String(html).matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>\s*<table\b[^>]*class=["']schedule-table["'][^>]*>([\s\S]*?)<\/table>/gi)){
  const d=text(m[1]).match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})/i);if(!d)continue;
  const months=['january','february','march','april','may','june','july','august','september','october','november','december'],day=`${d[3]}-${String(months.indexOf(d[1].toLowerCase())+1).padStart(2,'0')}-${d[2].padStart(2,'0')}`;
  for(const row of m[2].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
   const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(c=>c[1]);if(cells.length<3||/cancel|postpon|<strike/i.test(row[1]))continue;
   const clock=text(cells[0]).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);if(!clock||+clock[1]>12)continue;
   const links=[...cells[2].matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)],last=links.at(-1),venue=text(last?.[2]);
   const place=schools.find(s=>token(s.name)===token(venue)||s.campusVenues?.some(v=>token(v)===token(venue)));if(!place)continue;
   rows.push({'@type':'SportsEvent',name:text(cells[1])+' · '+text(cells[2]).split('@')[0],startDate:day+'T'+String((+clock[1]%12)+(clock[3].toUpperCase()==='PM'?12:0)).padStart(2,'0')+':'+clock[2]+':00',url:last?.[1],location:{name:venue,geo:{latitude:place.lat,longitude:place.lon}}});
  }
 }return rows;
}
export async function readSchoolCalendar(school,market,now=Date.now(),request=fetch,lookup){
 if(!school.url)return{source:{name:school.name,url:null,status:'no_public_website',pages:0,eventCount:0},events:[],context:[]};
 const events=[],context=[],visited=new Set(),queue=[school.url];let parsed=false,limited=false,failed=false,loaded=0;
 for(let page=0;queue.length&&page<5;page++){
  const url=queue.shift();if(visited.has(url)){page--;continue;}visited.add(url);
  try{const result=await schoolPage(url,request,lookup),body=result.body;loaded++;let rows=[];
   if(school.adapter==='digitalsports'){rows=digitalSportsEvents(body,school.venues);parsed=/schedule-table/.test(body);limited=true;}
   else if(/BEGIN:VCALENDAR/.test(body)){const ics=schoolIcsEvents(body,market.timeZone);rows=ics.events;limited||=ics.recurrenceLimited;parsed=true;}
   else if(school.adapter==='localist'||/localist\.com|localist\.net|localist_platform/i.test(body)){
    if(body.trim().startsWith('{')){const payload=JSON.parse(body);parsed=true;limited||=Number(payload.page?.total)>100;rows=(payload.events||[]).flatMap(w=>{const e=w.event;if(!e||e.private||e.rejected||e.experience==='virtual'||e.publish_status!=='published')return[];return(e.event_instances||[]).map(i=>({'@type':'Event',name:e.title,startDate:i.event_instance?.start,endDate:i.event_instance?.end,url:e.localist_url,eventStatus:e.status,location:{name:e.location_name,geo:{latitude:e.geo?.latitude,longitude:e.geo?.longitude}},description:Object.values(e.filters||{}).flat().map(f=>f.name).join(' ')}));});}
    else{const start=new Date(now-DAY).toISOString().slice(0,10);queue.unshift(new URL('/api/2/events?start='+start+'&days=9&pp=100',result.url).href);}
   }else{rows=[...structuredEvents(body),...blackbaudSchoolEvents(body)];parsed||=rows.length>0;const links=schoolCalendarLinks(body,result.url);queue.push(...links.filter(link=>!visited.has(link)));}
   for(const row of rows){const e=normalizeSchoolEvent(row,school,market,result.url,now);if(e)(e.demandEligible?events:context).push(e);}
  }catch{failed=true;}
 }
 limited||=queue.some(u=>!visited.has(u));
 const unique=rows=>[...new Map(rows.map(e=>[token(e.name)+':'+e.lat.toFixed(3)+':'+e.lon.toFixed(3)+':'+(e.eventStart||e.eventDate),e])).values()];
 const result=unique(events),dates=unique(context);
 return{source:{name:school.name,url:school.url,status:!parsed?'unavailable':failed||limited?'partial':'active',pages:loaded,eventCount:result.length,dateOnlyCount:dates.length,truncated:limited,fetchedAt:parsed?new Date(now).toISOString():null},events:result,context:dates};
}
export async function schoolCalendars(market,schools,now=Date.now(),request=fetch,lookup){
 let next=0;const results=[];await Promise.all(Array.from({length:Math.min(6,schools.length)},async()=>{while(next<schools.length){const school=schools[next++];results.push(await readSchoolCalendar(school,market,now,request,lookup));}}));
 return{status:results.some(r=>['active','partial'].includes(r.source.status))?'partial':'unavailable',fetchedAt:new Date(now).toISOString(),sources:results.map(r=>r.source),events:results.flatMap(r=>r.events),context:results.flatMap(r=>r.context)};
}
