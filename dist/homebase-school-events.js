(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HomeBaseSchoolEvents=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const sessionKey=globalThis.crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random();
 function mapEvents(rows,now=Date.now()){
  return(rows||[]).filter(e=>e.demandEligible===true&&e.timePrecision==='minute'&&Number.isFinite(Date.parse(e.eventStart))&&e.lat!=null&&e.lon!=null&&Number.isFinite(Number(e.lat))&&Number.isFinite(Number(e.lon))&&Date.parse(e.eventStart)<=now+12*3600000&&(e.eventEnd?Date.parse(e.eventEnd)>=now-90*60000:Date.parse(e.eventStart)>=now-6*3600000)).map(e=>({name:e.name,cat:'event',lat:Number(e.lat),lon:Number(e.lon),venue:e.venue,expectedAttendance:e.expectedAttendance,attendanceBasis:e.attendanceBasis,attendanceSourceUrl:e.attendanceSourceUrl,attendanceConfidence:e.attendanceConfidence,eventType:e.eventType,classification:e.classification,url:e.url,eventStart:new Date(e.eventStart),eventEnd:e.eventEnd?new Date(e.eventEnd):null,eventState:e.eventEnd&&Date.parse(e.eventStart)<=now&&Date.parse(e.eventEnd)>now?'Live':e.eventEnd&&Date.parse(e.eventEnd)<=now?'Departure':Date.parse(e.eventStart)<now?'Scheduled · end unverified':'Preview',tags:{providerEvent:true,publicCalendar:true,schoolEvent:true,source:e.source,sourceUrl:e.sourceUrl,sourceFetchedAt:e.fetchedAt,locationPrecision:e.locationPrecision}}));
 }
 async function page(config,location,timeZone,cursor=0,request=fetch){
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config?.supabaseUrl||'')||!/^sb_publishable_/.test(config?.supabasePublishableKey||''))throw Error('School calendar service unavailable');
  const session=rootSession(),identity=await session,storageKey='homeBaseCalendarRegistry:'+identity.owner;let saved={sources:[],areas:{}};
  try{saved=JSON.parse(globalThis.localStorage?.getItem(storageKey))||saved;}catch{}
  const lat=Math.round(location[0]*100)/100,lon=Math.round(location[1]*100)/100,area=Math.round(lat*4)/4+','+Math.round(lon*4)/4;
  const near=p=>{if(!Number.isFinite(p?.lat)||!Number.isFinite(p?.lon))return false;const rad=Math.PI/180,a=Math.sin((p.lat-lat)*rad/2)**2+Math.cos(lat*rad)*Math.cos(p.lat*rad)*Math.sin((p.lon-lon)*rad/2)**2;return 12742*Math.asin(Math.min(1,Math.sqrt(a)))<=35;};
  const sources=(saved.sources||[]).filter(s=>near(s)||s.venues?.some(near)||near(s.registryCenter));
  const r=await request(config.supabaseUrl+'/functions/v1/school-events',{method:'POST',headers:{apikey:config.supabasePublishableKey,'Content-Type':'application/json',...(identity.authorization?{Authorization:identity.authorization}:{})},signal:AbortSignal.timeout(110000),body:JSON.stringify({lat,lon,timeZone,cursor,sessionKey,radiusKm:35,refresh:cursor===0,...(!identity.authorization&&cursor===0?{savedSources:sources,discoveredAt:saved.areas?.[area]||0}:{})})});
  if(!r.ok)throw Error('School calendar search unavailable');const result=await r.json();
  if(Array.isArray(result.registrySources))try{saved.sources=[...new Map([...(saved.sources||[]),...result.registrySources].map(s=>[s.url,s])).values()];saved.areas={...saved.areas,[area]:result.discoveredAt};globalThis.localStorage?.setItem(storageKey,JSON.stringify(saved));}catch{result.registryStatus=identity.authorization?result.registryStatus:'device_storage_unavailable';}
  return result;
 }
 async function rootSession(){return globalThis.HomeBaseAccounts?.backend?.calendarSession?globalThis.HomeBaseAccounts.backend.calendarSession():{owner:'device'};}
 return{mapEvents,page};
});
