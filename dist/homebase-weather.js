/* Weather inputs for the demand model: official NWS alerts plus hourly
   precipitation intensity. Effects are modeled estimates, never ride counts. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HomeBaseWeather=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const HOUR=3600000;
  // Life-safety warnings are shown to drivers but never boost a destination.
  const SAFETY=/tornado warning|flash flood warning|flash flood emergency|blizzard warning|ice storm warning|extreme wind warning|hurricane warning|tropical storm warning|storm surge warning|dust storm warning|tsunami warning/i;
  function classifyAlert(event){
    const name=String(event||'');
    const kind=/winter|snow|ice|freez|sleet|blizzard|lake effect/i.test(name)?'winter'
      :/flood|hydrologic|coastal/i.test(name)?'flood'
      :/thunderstorm|tornado|hurricane|tropical|storm surge/i.test(name)?'storm'
      :/heat/i.test(name)?'heat'
      :/cold|wind chill|frost|freeze/i.test(name)?'cold'
      :/fog|smoke|air quality|dust/i.test(name)?'visibility'
      :/wind/i.test(name)?'wind':'other';
    return{kind,safety:SAFETY.test(name)};
  }
  function validStamp(value){return typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;}
  function normalizeAlerts(payload,now=Date.now()){
    const rows=[],seen=new Set();
    for(const feature of payload?.features||[]){
      const p=feature?.properties||{};
      if(p.status!=='Actual'||p.messageType==='Cancel'||!p.event)continue;
      const id=String(p.id||feature.id||''),onset=validStamp(p.onset)||validStamp(p.effective),ends=validStamp(p.ends)||validStamp(p.expires);
      if(!id||seen.has(id)||!onset||!ends||Date.parse(ends)<=now||Date.parse(onset)>now+36*HOUR)continue;
      seen.add(id);
      const {kind,safety}=classifyAlert(p.event);
      rows.push({id,event:String(p.event).slice(0,80),kind,safety,severity:String(p.severity||'Unknown'),urgency:String(p.urgency||'Unknown'),headline:String(p.headline||p.event).slice(0,240),areaDesc:String(p.areaDesc||'').slice(0,240),onset,ends,url:/^https:\/\/api\.weather\.gov\//.test(String(p['@id']||feature.id||''))?String(p['@id']||feature.id):null,source:'National Weather Service'});
    }
    const rank={Extreme:4,Severe:3,Moderate:2,Minor:1};
    return rows.sort((a,b)=>(b.safety-a.safety)||((rank[b.severity]||0)-(rank[a.severity]||0))||a.onset.localeCompare(b.onset));
  }
  function activeAlerts(alerts,time=Date.now()){const t=time instanceof Date?time.getTime():Number(time);return(alerts||[]).filter(a=>Date.parse(a.onset)<=t&&Date.parse(a.ends)>t);}
  function alertsUrl(lat,lon){return 'https://api.weather.gov/alerts/active?point='+Number(lat).toFixed(4)+','+Number(lon).toFixed(4);}
  // Open-Meteo hourly rows: precipitation (mm), snowfall (cm), temperature in
  // the requested unit. Missing values stay null rather than becoming zero.
  function hourlyRows(payload,temperatureUnit='fahrenheit'){
    const h=payload?.hourly||{},num=v=>v==null||!Number.isFinite(Number(v))?null:Number(v);
    return(h.time||[]).map((time,i)=>{
      const stamp=Date.parse(time),temp=num(h.temperature_2m?.[i]);
      return{time:stamp,probability:num(h.precipitation_probability?.[i])??0,precipitationMm:num(h.precipitation?.[i]),snowfallCm:num(h.snowfall?.[i]),temperatureF:temp==null?null:temperatureUnit==='celsius'?temp*9/5+32:temp};
    }).filter(r=>Number.isFinite(r.time));
  }
  function nearest(rows,time){const t=time instanceof Date?time.getTime():Number(time);const best=(rows||[]).reduce((b,r)=>!b||Math.abs(r.time-t)<Math.abs(b.time-t)?r:b,null);return best&&Math.abs(best.time-t)<=5400000?best:null;}
  const WEATHER_SENSITIVE=['event','transit','restaurant','nightlife','neighborhood','hotel','restaurant_district'];
  /* Modeled score added to weather-sensitive destinations. Probability alone
     gives 1-4 points (the original model); measurable intensity, snow, an
     active NWS precipitation alert or temperature extremes can raise it. */
  function demandBoost(category,hour,alerts=[],fallbackChance=0){
    if(!WEATHER_SENSITIVE.includes(category))return{boost:0,reasons:[]};
    const chance=hour?Number(hour.probability)||0:Number(fallbackChance)||0,reasons=[];
    let boost=chance>=75?4:chance>=50?2.5:chance>=25?1:0;
    if(boost)reasons.push(chance+'% precipitation chance');
    if(hour&&chance>=25){
      if(hour.snowfallCm!=null&&hour.snowfallCm>=0.2){boost=Math.max(boost,chance>=50?5:3);reasons.push('snow forecast ('+hour.snowfallCm.toFixed(1)+' cm/h)');}
      else if(hour.precipitationMm!=null&&hour.precipitationMm>=4){boost+=1.5;reasons.push('heavy rain forecast ('+hour.precipitationMm.toFixed(1)+' mm/h)');}
      else if(hour.precipitationMm!=null&&hour.precipitationMm>=1){boost+=.5;reasons.push('steady rain forecast ('+hour.precipitationMm.toFixed(1)+' mm/h)');}
    }
    const precip=(alerts||[]).find(a=>!a.safety&&['winter','flood','storm'].includes(a.kind));
    if(precip&&boost<3){boost=3;reasons.push('NWS '+precip.event);}
    const temp=hour?.temperatureF,extreme=temp!=null&&(temp<=20||temp>=95),thermal=(alerts||[]).find(a=>!a.safety&&['heat','cold'].includes(a.kind));
    if(extreme||thermal){boost+=1;reasons.push(thermal?'NWS '+thermal.event:Math.round(temp)+'°F temperature');}
    return{boost:Math.min(6,boost),reasons};
  }
  return{classifyAlert,normalizeAlerts,activeAlerts,alertsUrl,hourlyRows,nearest,demandBoost,WEATHER_SENSITIVE};
});
