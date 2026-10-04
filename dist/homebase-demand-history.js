(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HomeBaseDemandHistory=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SCREENSHOT_BENCHMARKS=[
    {id:'uber-baltimore-shared-20261003-0205',source:'Uber Driver screenshot · IMG_3400.jpeg',record_type:'uber_reference',observed_at:'2026-10-03T02:05:00-04:00',market:'Baltimore metro',capture_clock:'2:04',capture_note:'Observation time uses the first-share time per user instruction. The image status bar shows 2:04; the file name does not contain a date.',driver_status:'offline',visible_surge_amounts_usd:[1.75,2.25,2.75,3.75,3.75,5,6.5],visible_wait_windows_minutes:[[1,6],[1,1],[1,2]],visual_summary:'Uber reference display: several surge labels and short wait indicators across the Baltimore map.'},
    {id:'homebase-baltimore-shared-20261003-0215-3401',source:'Home Base screenshot · IMG_3401.jpeg',record_type:'homebase_output',observed_at:'2026-10-03T02:15:00-04:00',market:'Baltimore city neighborhoods',capture_clock:'2:07',visual_summary:'Neighborhood close view: stronger shading around central nightlife areas, with low-signal gaps at the edges.'},
    {id:'homebase-baltimore-shared-20261003-0215-3402',source:'Home Base screenshot · IMG_3402.jpeg',record_type:'homebase_output',observed_at:'2026-10-03T02:15:00-04:00',market:'Baltimore metro overview',capture_clock:'2:07',visual_summary:'Regional view: mostly blank county areas with a few isolated heat patches.'},
    {id:'homebase-baltimore-shared-20261003-0215-3403',source:'Home Base screenshot · IMG_3403.jpeg',record_type:'homebase_output',observed_at:'2026-10-03T02:15:00-04:00',market:'Baltimore city and nearby neighborhoods',capture_clock:'2:08',visual_summary:'Closer view: several neighborhood labels and localized patches, with substantial unshaded space between them.'},
    {id:'uber-baltimore-shared-20261004-0025',source:'Uber Driver screenshots · IMG_3461.jpeg + IMG_3462.jpeg',record_type:'uber_reference',observed_at:'2026-10-04T00:25:00-04:00',market:'Baltimore metro',capture_clock:'12:24 AM',capture_note:'First shared 12:25 AM ET; both zoom levels are one snapshot, not two independent samples. Uber showed “You’re offline”; visible map incentives/wait estimates are reference signals only, not completed trips or confirmed requests.',driver_status:'offline',visible_bonus_badges_usd:[1.5,2.25,2.75,3.5],visible_wait_windows_minutes:[[1,1],[1,2],[1,3],[1,4],[1,5],[1,6],[1,7],[1,11]],views:[{image:'IMG_3461.jpeg',scale:'neighborhood detail'},{image:'IMG_3462.jpeg',scale:'metro overview'}],area_observations:[{area:'Downtown',band:'very_high'},{area:'Canton / Inner Harbor',band:'very_high'},{area:'Federal Hill / Fells Point',band:'high'},{area:'Anneslie / Carney',band:'high'},{area:'Parkville / Overlea',band:'high'},{area:'Rosedale / Essex',band:'elevated'},{area:'Dundalk / Brooklyn Park',band:'elevated'},{area:'Arbutus / Woodlawn',band:'moderate'}],visual_summary:'Uber reference display at late Saturday night: broad red/orange activity across central and north/east Baltimore, with the strongest pink/magenta fields near Downtown, Canton and the waterfront; distinct lower-intensity edges. Multiple short 1–11 minute wait labels and +$1.50–$3.50 bonus badges are visible across both scales. Qualitative map-reading only; no numeric request-volume label.'},
    {id:'uber-baltimore-shared-20261004-1457-3466-3467',source:'Uber Driver screenshots · IMG_3466.jpeg + IMG_3467.jpeg',record_type:'uber_reference',observed_at:'2026-10-04T14:57:00-04:00',captured_at:'2026-10-04T14:55:00-04:00',market:'Baltimore metro',capture_clock:'2:55 PM (inferred from current share time)',capture_hour_local:14,capture_note:'Two zoom levels of one offline Uber map snapshot; counted once. First shared at 2:57 PM ET. AM/PM inferred from the current share time because the screenshot clock omits it. Heat and wait labels are reference signals, not confirmed requests.',driver_status:'offline',visible_wait_windows_minutes:[[1,2],[1,3]],views:[{image:'IMG_3466.jpeg',scale:'city detail'},{image:'IMG_3467.jpeg',scale:'metro overview'}],area_observations:[{area:'Anneslie / Towson',band:'high'},{area:'Downtown / central Baltimore',band:'high'},{area:'West Baltimore / Arbutus',band:'elevated'},{area:'Baltimore Highlands / Brooklyn Park',band:'elevated'}],visual_summary:'Uber map shows broad red-orange activity across central Baltimore and north toward Anneslie, with secondary warm areas to the west and south; several short 1–3 minute wait labels. One event marker is visible downtown; BWI waiting-lot marker appears in the regional view.'},
    {id:'uber-baltimore-shared-20261004-1457-3463',source:'Uber Driver screenshot · IMG_3463.jpeg',record_type:'uber_reference',observed_at:'2026-10-04T14:57:00-04:00',captured_at:null,market:'Baltimore metro',capture_clock:'10:18 AM',capture_hour_local:10,captured_at:'2026-10-04T10:18:00-04:00',capture_note:'Screenshot was taken Sunday morning, October 4, 2026. First shared at 2:57 PM ET; use the distinct capture time for the transient signal and hour-of-week pattern. Uber showed “You’re offline”; map shading, incentives and wait labels are reference signals, not confirmed completed trips.',driver_status:'offline',visible_bonus_badges_usd:[1.5,1.75,3.75,4.5,4.5,7.25,7.5],visible_wait_windows_minutes:[[1,2],[1,7]],area_observations:[{area:'Downtown / central Baltimore',band:'very_high'},{area:'Towson / Anneslie',band:'high'},{area:'Carney / Parkville',band:'very_high'},{area:'Dundalk / Essex',band:'very_high'},{area:'West Baltimore / Woodlawn',band:'high'}],visual_summary:'Uber reference screenshot shows intense magenta/pink demand shading across central Baltimore and several separate north, east and west zones, with displayed +$1.50–$7.50 incentive badges and short wait labels. Clock AM/PM is not visible.'},
    {id:'uber-baltimore-shared-20261004-1817-3476-3477',source:'Uber Driver screenshots · IMG_3476.jpeg + IMG_3477.jpeg',record_type:'uber_reference',observed_at:'2026-10-04T18:17:00-04:00',captured_at:'2026-10-04T18:15:00-04:00',market:'Baltimore metro',capture_clock:'6:15 PM',capture_hour_local:18,capture_note:'Two zoom levels of one Sunday-evening map snapshot; counted once. First shared at 6:17 PM ET. Uber showed “You’re offline”; map shading, incentive badges and wait labels are reference signals, not confirmed trips or active ride requests.',driver_status:'offline',visible_bonus_badges_usd:[2.5,2.5],visible_wait_windows_minutes:[[1,13],[1,6],[1,2],[1,3]],views:[{image:'IMG_3476.jpeg',scale:'metro overview'},{image:'IMG_3477.jpeg',scale:'neighborhood detail'}],area_observations:[{area:'Downtown / Inner Harbor',band:'high'},{area:'Mount Vernon / Station North',band:'high'},{area:'Canton / waterfront',band:'high'},{area:'Towson / Carney',band:'elevated'},{area:'Arbutus / West Baltimore',band:'elevated'},{area:'Glen Burnie / BWI corridor',band:'moderate'}],visual_summary:'Sunday 6:15 PM reference map: broad warm demand shading through central Baltimore and north toward Towson/Carney, with additional west/south patches. The close view shows short 1–13 minute wait estimates and two +$2.50 incentive badges near the Inner Harbor/waterfront. Heat and displayed incentives are qualitative driver-app signals.'},
  ];
  function seedScreenshotBenchmarks(){try{let rows=JSON.parse(localStorage.getItem('homeBaseDemandBenchmarks')||'[]');if(!Array.isArray(rows))rows=[];rows=rows.filter(row=>row&&row.id!=='uber-baltimore-2026-10-03-0204');for(const benchmark of SCREENSHOT_BENCHMARKS)if(!rows.some(row=>row&&row.id===benchmark.id))rows.push(benchmark);localStorage.setItem('homeBaseDemandBenchmarks',JSON.stringify(rows));return rows;}catch{return SCREENSHOT_BENCHMARKS;}}
  const screenshotBenchmarks=seedScreenshotBenchmarks();
  function compare(rows,now=Date.now()){
    const groups=new Map();
    for(const row of rows||[]){const time=Date.parse(row.observed_at),score=Number(row.modeled_score);
      if(row.modeled_score==null||!Number.isFinite(time)||time>now||now-time>90*86400000||!Number.isFinite(score)||score<0||score>1)continue;
      const key=row.area;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({...row,time,score});}
    return [...groups].map(([area,items])=>{items.sort((a,b)=>b.time-a.time);const latest=items[0],prior=items.find(r=>latest.time-r.time>=15*60000&&latest.time-r.time<=90*60000);
      return{area,score:latest.score,observedAt:latest.observed_at,count:items.length,arrivals:latest.event_arrivals??null,exits:latest.event_exits??null,delta:prior?latest.score-prior.score:null,stale:now-latest.time>15*60000};}).sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt));
  }
  function matchingAreaObservation(row,name){
    return(row.area_observations||[]).find(item=>{
      const aliases=String(item.area||'').toLowerCase().split(/[\\/&,]+/).map(value=>value.replace(/[^a-z0-9]+/g,' ').trim()).filter(Boolean);
      return aliases.some(alias=>alias.length>=4&&name.includes(alias));
    });
  }
  function recurrenceFor(areaName,when,isBaltimore){
    if(!isBaltimore)return{distinctDates:0,band:null,confidence:0};
    const target=when instanceof Date?when:new Date(when),name=String(areaName||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    if(!Number.isFinite(+target))return{distinctDates:0,band:null,confidence:0};
    const bands={moderate:1,elevated:2,high:3,very_high:4},counts=new Map(),marketParts=date=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'numeric',hour12:false}).formatToParts(date).map(x=>[x.type,x.value]));return{hour:Number(p.hour)%24,day:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(p.weekday)};},targetLocal=marketParts(target),targetHour=targetLocal.hour,targetDay=targetLocal.day;
    for(const row of screenshotBenchmarks){
      if(row.record_type!=='uber_reference'||!Number.isFinite(Number(row.capture_hour_local)))continue;
      const stamp=Date.parse(row.observed_at),captured=new Date(stamp),age=+target-stamp;
      if(!Number.isFinite(stamp)||age<0||age>120*86400000||marketParts(captured).day!==targetDay)continue;
      const delta=Math.abs(Number(row.capture_hour_local)-targetHour);if(Math.min(delta,24-delta)>1)continue;
      const item=matchingAreaObservation(row,name);if(!item)continue;
      const key=captured.toLocaleDateString('en-CA',{timeZone:'America/New_York'});
      const old=counts.get(key);if(!old||bands[item.band]>bands[old.band])counts.set(key,{band:item.band,stamp});
    }
    const dates=[...counts.values()];
    if(dates.length<2)return{distinctDates:dates.length,band:dates.sort((a,b)=>b.stamp-a.stamp)[0]?.band||null,confidence:0};
    const ageDays=dates.reduce((sum,row)=>sum+(+target-row.stamp)/86400000,0)/dates.length;
    const confidence=Math.min(.08,.02*(dates.length-1))*Math.exp(-ageDays/90);
    return{distinctDates:dates.length,band:dates.sort((a,b)=>b.stamp-a.stamp)[0].band,confidence};
  }
  function adjustWeight(weight,areaName,when,parts,isBaltimore,now=Date.now()){
    const base=Number(weight),hour=Number(parts&&parts.hour),day=Number(parts&&parts.day),target=when instanceof Date?when.getTime():Date.parse(when);
    if(!Number.isFinite(base)||base<=0||!isBaltimore||!Number.isFinite(hour)||!Number.isFinite(day)||!Number.isFinite(target))return base;
    const name=String(areaName||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(),bandWeight={very_high:.16,high:.12,elevated:.08,moderate:.04},windowMs=30*60000;
    let weightOut=base;
    for(const row of screenshotBenchmarks){
      if(row.record_type!=='uber_reference'||(Object.prototype.hasOwnProperty.call(row,'captured_at')&&!row.captured_at))continue;
      const captured=Date.parse(row.captured_at||row.observed_at),age=now-captured,forecastOffset=target-captured;
      if(!Number.isFinite(captured)||age<0||age>windowMs||forecastOffset<0||forecastOffset>windowMs)continue;
      const item=matchingAreaObservation(row,name);if(!item)continue;
      const decay=Math.max(0,1-Math.max(age,forecastOffset)/windowMs);
      weightOut*=1+(bandWeight[item.band]||0)*decay;
    }
    const recurrence=recurrenceFor(areaName,new Date(target),isBaltimore),recurrenceWeight={very_high:.08,high:.06,elevated:.04,moderate:.02};
    if(recurrence.confidence>0&&recurrence.band)weightOut*=1+recurrenceWeight[recurrence.band]*(recurrence.confidence/.08);
    return weightOut;
  }
  function eventPhase(event,when=Date.now()){
    const start=Date.parse(event.eventStart),end=Date.parse(event.eventEnd);if(!Number.isFinite(start))return'unknown';
    if(when<start)return start-when<=90*60000?'arrival':'upcoming';
    if(!Number.isFinite(end))return'unknown_end';
    if(when<=end)return'during';return when-end<=90*60000?'exit':'ended';
  }
  function context(area,when=new Date()){
    const events=(area?.sources||[]).filter(s=>s.eventStart).map(s=>({eventStart:s.eventStart,eventEnd:s.eventEnd}));
    return{modeled_score:typeof demandAreaScore==='function'?Math.min(1,Math.max(0,demandAreaScore(area,when))):null,
      event_arrivals:Math.min(100,events.filter(e=>eventPhase(e,+when)==='arrival').length),
      event_exits:Math.min(100,events.filter(e=>eventPhase(e,+when)==='exit').length)};
  }
  function benchmarkHtml(row,esc){
    let detail=esc(row.visual_summary||'');
    if(row.record_type==='uber_reference'){const amounts=(row.visible_bonus_badges_usd||row.visible_surge_amounts_usd||[]).map(value=>'+$'+Number(value).toFixed(2)).join(', '),waits=(row.visible_wait_windows_minutes||[]).map(pair=>pair[0]===pair[1]?pair[0]+' min':pair[0]+'–'+pair[1]+' min').join(', ');detail='Uber displayed bonus/incentive badges '+amounts+' · wait indicators '+waits+' · driver status '+esc(row.driver_status);}
    return '<p><b>'+esc(row.source)+'</b> · '+esc(row.market)+' · '+esc(row.record_type==='uber_reference'?'external reference':'Home Base model output')+'<br><small>First shared '+esc(new Date(row.observed_at).toLocaleString('en-US',{timeZone:'America/New_York'}))+' ET · screenshot clock '+esc(row.capture_clock||'not visible')+'</small><br><small>'+detail+'</small>'+(row.capture_note?'<br><small>'+esc(row.capture_note)+'</small>':'')+'</p>';
  }
  function html(rows,esc){const trends=compare(rows),benchmarks=Array.isArray(screenshotBenchmarks)?screenshotBenchmarks:[];
    const benchmarkSection='<h4>SCREENSHOT HISTORY</h4>'+(benchmarks.length?benchmarks.map(row=>benchmarkHtml(row,esc)).join(''):'<p>No reference screenshots stored.</p>');
    const modelHistory=trends.length?trends.slice(0,12).map(r=>'<p><b>'+esc(r.area)+'</b> · '+Math.round(r.score*100)+'/100 · '+(r.stale?'stale':r.delta===null?'baseline needed':r.delta>.03?'rising':r.delta<-.03?'falling':'steady')+' · '+r.count+' snapshots<br><small>'+esc(new Date(r.observedAt).toLocaleString('en-US',{timeZone:'America/New_York'}))+' ET'+(r.arrivals===null?'':' · '+r.arrivals+' nearby arrival windows · '+r.exits+' exit windows')+'</small></p>').join(''):'<p>No Home Base shift history yet. In Profile, enable Help evaluate the forecast model, then start a shift. Model snapshots are taken every five minutes while the app is visible.</p>';
    return '<h3>NEIGHBORHOOD DEMAND HISTORY</h3><p>Home Base shift scores are calculated by its model. They are not confirmed ride counts or Uber surge payments.</p>'+benchmarkSection+modelHistory+'<p>Screenshot records preserve the first-share time and the clock visible in the image. Screenshot activity bands are low-confidence, per-neighborhood reference signals. Their immediate effect fades within 30 minutes. A separate recurrence prior is only learned after independent dated screenshots repeat in the same neighborhood, weekday, and hour window; duplicate zoom views count once, and ambiguous AM/PM captures are excluded. The prior is capped at 8% and decays over 90 days. Screenshots show app estimates, not confirmed requests or completed trips. They are not request counts or confirmed Uber activity. Displayed bonus and wait labels are stored as shown, not used as numeric training targets. Actual gross earnings with online hours are evaluated separately in Earnings.</p>';
  }
  return{compare,eventPhase,context,html,adjustWeight,recurrenceFor};
});
