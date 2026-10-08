(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HomeBaseSchoolEvents=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function mapEvents(rows,now=Date.now()){
  return(rows||[]).filter(e=>e.demandEligible===true&&e.timePrecision==='minute'&&Number.isFinite(Date.parse(e.eventStart))&&e.lat!=null&&e.lon!=null&&Number.isFinite(Number(e.lat))&&Number.isFinite(Number(e.lon))&&Date.parse(e.eventStart)<=now+12*3600000&&(e.eventEnd?Date.parse(e.eventEnd)>=now-90*60000:Date.parse(e.eventStart)>=now-6*3600000)).map(e=>({name:e.name,cat:'event',lat:Number(e.lat),lon:Number(e.lon),venue:e.venue,eventType:e.eventType,classification:e.classification,url:e.url,eventStart:new Date(e.eventStart),eventEnd:e.eventEnd?new Date(e.eventEnd):null,eventState:e.eventEnd&&Date.parse(e.eventStart)<=now&&Date.parse(e.eventEnd)>now?'Live':e.eventEnd&&Date.parse(e.eventEnd)<=now?'Departure':Date.parse(e.eventStart)<now?'Scheduled · end unverified':'Preview',tags:{providerEvent:true,publicCalendar:true,schoolEvent:true,source:e.source,sourceUrl:e.sourceUrl,sourceFetchedAt:e.fetchedAt,locationPrecision:e.locationPrecision}}));
 }
 async function page(config,location,timeZone,cursor=0,request=fetch){
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config?.supabaseUrl||'')||!/^sb_publishable_/.test(config?.supabasePublishableKey||''))throw Error('School calendar service unavailable');
  const r=await request(config.supabaseUrl+'/functions/v1/school-events',{method:'POST',headers:{apikey:config.supabasePublishableKey,'Content-Type':'application/json'},signal:AbortSignal.timeout(110000),body:JSON.stringify({lat:Math.round(location[0]*100)/100,lon:Math.round(location[1]*100)/100,timeZone,cursor,radiusKm:35})});
  if(!r.ok)throw Error('School calendar search unavailable');return r.json();
 }
 return{mapEvents,page};
});
