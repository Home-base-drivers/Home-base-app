// Spoken safety warnings. Home Base says each new National Weather Service
// alert for the driver's area and each new nearby crash, closure or major
// traffic incident out loud once, so a moving driver hears it without looking.
// Drivers can turn it off ("mute safety alerts" or the speaker button on the
// conditions card). The same list is given to Home Base AI as context.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.HomeBaseSafety=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const MI=1.609344,KEY='homeBaseSafetyVoice',SPOKEN='homeBaseSafetySpoken';
 const km=(a,b)=>{const r=Math.PI/180,dLat=(b.lat-a.lat)*r,dLon=(b.lon-a.lon)*r,x=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLon/2)**2;return 12742*Math.asin(Math.sqrt(x));};
 const store=()=>{try{return typeof localStorage!=='undefined'?localStorage:null}catch{return null}};
 function settings(){try{return{enabled:true,radiusMi:3,...JSON.parse(store()?.getItem(KEY)||'{}')}}catch{return{enabled:true,radiusMi:3}}}
 function setEnabled(on){const s={...settings(),enabled:!!on};try{store()?.setItem(KEY,JSON.stringify(s))}catch{}render();return s;}
 let incidents=[],spoken=new Map(),button=null;
 try{spoken=new Map(Object.entries(JSON.parse(store()?.getItem(SPOKEN)||'{}')))}catch{}
 function remember(id,now){spoken.set(id,now);const cutoff=now-24*3600000;for(const [k,t] of spoken)if(t<cutoff)spoken.delete(k);try{store()?.setItem(SPOKEN,JSON.stringify(Object.fromEntries(spoken)))}catch{}}

 const ALERT_RANK={Extreme:4,Severe:3,Moderate:2,Minor:1};
 // Which weather alerts are worth interrupting a driver for: anything the NWS
 // marks as a safety alert, or Moderate+ alerts active now or starting within an hour.
 function alertsToSpeak(alerts,now){
  return(alerts||[]).filter(a=>a&&a.id&&Date.parse(a.ends)>now&&Date.parse(a.onset)<=now+3600000&&(a.safety||(ALERT_RANK[a.severity]||0)>=2||/warning/i.test(a.event||'')));
 }
 // Nearby incidents: major ones within the alert radius plus 2 miles, others within the radius.
 function incidentsToSpeak(list,where,now,radiusMi=3){
  if(!where)return[];
  return(list||[]).map(i=>({...i,miles:km(where,i)/MI})).filter(i=>{
   if(i.fetchedAt&&now-Date.parse(i.fetchedAt)>30*60000)return false;
   if(i.startedAt&&now-Date.parse(i.startedAt)>6*3600000&&!i.lanesClosed)return false;
   if(i.roadwork&&!i.allLanesClosed)return false;
   return i.severity==='major'?i.miles<=radiusMi+2:i.severity==='moderate'?i.miles<=radiusMi:i.miles<=Math.min(1.5,radiusMi);
  }).sort((a,b)=>a.miles-b.miles);
 }
 const clockOf=iso=>{try{return new Date(iso).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:typeof marketTimeZone==='string'?marketTimeZone:'America/New_York'})}catch{return''}};
 function alertSentence(a,now){
  const active=Date.parse(a.onset)<=now;
  return'Weather alert: '+a.event+(active?' in effect until '+clockOf(a.ends):' starting at '+clockOf(a.onset))+'.'+(a.safety?' Follow official guidance and drive with care.':' Expect slower roads and more ride requests.');
 }
 function incidentSentence(i){
  const what=/collision|crash|property damage|personal injury/i.test(i.type)?'Crash':/fire/i.test(i.type)?'Vehicle fire':/disabled/i.test(i.type)?'Disabled vehicle':/debris/i.test(i.type)?'Debris in the road':i.roadwork?'Lane closure':i.type;
  const lanes=i.allLanesClosed?'all lanes closed':i.lanesClosed?(i.lanesClosed===1?'one lane closed':i.lanesClosed+' lanes closed'):'';
  const road=String(i.road||'').replace(/\s*\([^)]*\)/g,'').replace(/\bprior to\b/ig,'before').replace(/\s+/g,' ').trim().toLowerCase().replace(/\b(i|us|md)\b/g,m=>m.toUpperCase()).replace(/(^|\s)([a-z])/g,(m,s,c)=>s+c.toUpperCase());
  return'Traffic alert: '+what+' on '+road+(lanes?', '+lanes:'')+', '+(i.miles<1?'less than a mile':'about '+Math.round(i.miles)+(Math.round(i.miles)===1?' mile':' miles'))+' away.';
 }
 // Returns the sentences that should be spoken now (and marks them spoken).
 function check({alerts=[],where=null,now=Date.now(),list=incidents}={}){
  const s=settings();if(!s.enabled)return[];
  const out=[];
  for(const a of alertsToSpeak(alerts,now)){const key='wx:'+a.id+':'+(Date.parse(a.onset)<=now?'on':'soon');if(spoken.has(key))continue;remember(key,now);out.push(alertSentence(a,now));}
  for(const i of incidentsToSpeak(list,where,now,s.radiusMi).slice(0,2)){const key='tr:'+i.id;if(spoken.has(key))continue;remember(key,now);out.push(incidentSentence(i));}
  return out;
 }
 function speak(text){
  const c=typeof window!=='undefined'?window.HomeBaseCopilot:null;
  if(c?.announce)return c.announce(text);
  try{const u=new SpeechSynthesisUtterance(text);u.rate=1;window.speechSynthesis.speak(u);}catch{}
 }
 function here(){try{if(Array.isArray(currentLocation)&&Number.isFinite(currentLocation[0]))return{lat:currentLocation[0],lon:currentLocation[1]};}catch{}return null;}
 function liveAlerts(){try{return Array.isArray(activeWeatherAlerts)?activeWeatherAlerts:[]}catch{return[]}}
 function tick(){const lines=check({alerts:liveAlerts(),where:here()});for(const line of lines){speak(line);try{window.HomeBaseShell?.setVoiceStatus?.(line,true)}catch{}}}
 // Context for Home Base AI: what is happening around the driver right now.
 function context(now=Date.now()){
  const where=here();
  return{weatherAlerts:liveAlerts().filter(a=>Date.parse(a.ends)>now).slice(0,4).map(a=>({event:a.event,severity:a.severity,onset:a.onset,ends:a.ends,headline:a.headline})),
   trafficIncidents:where?incidentsToSpeak(incidents,where,now,10).slice(0,8).map(i=>({type:i.type,road:i.road,direction:i.direction,lanesClosed:i.lanesClosed,allLanesClosed:i.allLanesClosed,severity:i.severity,miles:Math.round(i.miles*10)/10,startedAt:i.startedAt,source:i.source})):[],
   trafficCoverage:incidents.length?'Maryland CHART (state highways and interstates)':'none for this area',spokenAlerts:settings().enabled};
 }
 function setIncidents(list){incidents=Array.isArray(list)?list:[];}
 function render(){if(!button)return;const on=settings().enabled;button.textContent=on?'🔊':'🔇';button.setAttribute('aria-pressed',String(on));button.setAttribute('aria-label',on?'Spoken safety alerts on. Tap to mute.':'Spoken safety alerts muted. Tap to turn on.');button.title=button.getAttribute('aria-label');}
 if(typeof window!=='undefined'&&typeof document!=='undefined'){
  const mount=()=>{const card=document.getElementById('weatherTitle')?.closest('.condition-copy');if(!card||button)return;button=document.createElement('button');button.type='button';button.className='hb-safety-voice';button.style.cssText='margin-left:6px;background:none;border:0;font-size:16px;cursor:pointer;padding:2px';button.addEventListener('click',e=>{e.stopPropagation();const on=!settings().enabled;setEnabled(on);if(on)speak('Spoken safety alerts are on.');});card.after(button);render();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
  setInterval(tick,30000);setTimeout(tick,8000);
 }
 return{settings,setEnabled,setIncidents,check,context,alertsToSpeak,incidentsToSpeak,incidentSentence,alertSentence,tick};
});
