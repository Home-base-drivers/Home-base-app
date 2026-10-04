(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HomeBaseDemandHistory=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SCREENSHOT_BENCHMARKS=[
    {id:'uber-baltimore-shared-20261003-0205',source:'Uber Driver screenshot · IMG_3400.jpeg',record_type:'uber_reference',observed_at:'2026-10-03T02:05:00-04:00',market:'Baltimore metro',capture_clock:'2:04',capture_note:'Observation time uses the first-share time per user instruction. The image status bar shows 2:04; the file name does not contain a date.',driver_status:'offline',visible_surge_amounts_usd:[1.75,2.25,2.75,3.75,3.75,5,6.5],visible_wait_windows_minutes:[[1,6],[1,1],[1,2]],visual_summary:'Uber reference display: several surge labels and short wait indicators across the Baltimore map.'},
    {id:'homebase-baltimore-shared-20261003-0215-3401',source:'Home Base screenshot · IMG_3401.jpeg',record_type:'homebase_output',observed_at:'2026-10-03T02:15:00-04:00',market:'Baltimore city neighborhoods',capture_clock:'2:07',visual_summary:'Neighborhood close view: stronger shading around central nightlife areas, with low-signal gaps at the edges.'},
    {id:'homebase-baltimore-shared-20261003-0215-3402',source:'Home Base screenshot · IMG_3402.jpeg',record_type:'homebase_output',observed_at:'2026-10-03T02:15:00-04:00',market:'Baltimore metro overview',capture_clock:'2:07',visual_summary:'Regional view: mostly blank county areas with a few isolated heat patches.'},
    {id:'homebase-baltimore-shared-20261003-0215-3403',source:'Home Base screenshot · IMG_3403.jpeg',record_type:'homebase_output',observed_at:'2026-10-03T02:15:00-04:00',market:'Baltimore city and nearby neighborhoods',capture_clock:'2:08',visual_summary:'Closer view: several neighborhood labels and localized patches, with substantial unshaded space between them.'},
    {id:'uber-baltimore-shared-20261004-0025',source:'Uber Driver screenshots · IMG_3461.jpeg + IMG_3462.jpeg',record_type:'uber_reference',observed_at:'2026-10-04T00:25:00-04:00',market:'Baltimore metro',capture_clock:'12:24 AM',capture_note:'First shared 12:25 AM ET; both zoom levels are one snapshot, not two independent samples. Uber showed “You’re offline”; visible map incentives/wait estimates are reference signals only, not completed trips or confirmed requests.',driver_status:'offline',visible_bonus_badges_usd:[1.5,2.25,2.75,3.5],visible_wait_windows_minutes:[[1,1],[1,2],[1,3],[1,4],[1,5],[1,6],[1,7],[1,11]],views:[{image:'IMG_3461.jpeg',scale:'neighborhood detail'},{image:'IMG_3462.jpeg',scale:'metro overview'}],area_observations:[{area:'Downtown',band:'very_high'},{area:'Canton / Inner Harbor',band:'very_high'},{area:'Federal Hill / Fells Point',band:'high'},{area:'Anneslie / Carney',band:'high'},{area:'Parkville / Overlea',band:'high'},{area:'Rosedale / Essex',band:'elevated'},{area:'Dundalk / Brooklyn Park',band:'elevated'},{area:'Arbutus / Woodlawn',band:'moderate'}],visual_summary:'Uber reference display at late Saturday night: broad red/orange activity across central and north/east Baltimore, with the strongest pink/magenta fields near Downtown, Canton and the waterfront; distinct lower-intensity edges. Multiple short 1–11 minute wait labels and +$1.50–$3.50 bonus badges are visible across both scales. Qualitative map-reading only; no numeric request-volume label.'}
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
  function adjustWeight(weight,areaName,when,parts,isBaltimore,now=Date.now()){
    const base=Number(weight),hour=Number(parts&&parts.hour),day=Number(parts&&parts.day);
    if(!Number.isFinite(base)||base<=0||!isBaltimore||!Number.isFinite(hour)||!Number.isFinite(day))return base;
    const target=when instanceof Date?when.getTime():Date.parse(when);
    if(!Number.isFinite(target))return base;
    const weekendLateNight=(day===5||day===6||day===0&&hour<3)&&(hour>=21||hour<3);
    if(!weekendLateNight)return base;
    const name=String(areaName||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const bandWeight={very_high:.16,high:.12,elevated:.08,moderate:.04},windowMs=30*60000;
    const references=screenshotBenchmarks.filter(row=>row.record_type==='uber_reference'&&Array.isArray(row.area_observations));
    let selected=null;
    for(const row of references){
      const captured=Date.parse(row.observed_at),age=now-captured,forecastOffset=target-captured;
      if(!Number.isFinite(captured)||age<0||age>windowMs||forecastOffset<0||forecastOffset>windowMs)continue;
      for(const item of row.area_observations){
        const aliases=String(item.area||'').toLowerCase().split(/[\\/&,]+/).map(value=>value.replace(/[^a-z0-9]+/g,' ').trim()).filter(Boolean);
        if(aliases.some(alias=>alias.length>=4&&name.includes(alias))&&(!selected||captured>Date.parse(selected.row.observed_at)))selected={row,item,age,forecastOffset};
      }
    }
    if(!selected)return base;
    const decay=Math.max(0,1-Math.max(selected.age,selected.forecastOffset)/windowMs);
    return base*(1+(bandWeight[selected.item.band]||0)*decay);
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
    return '<h3>NEIGHBORHOOD DEMAND HISTORY</h3><p>Home Base shift scores are calculated by its model. They are not confirmed ride counts or Uber surge payments.</p>'+benchmarkSection+modelHistory+'<p>Screenshot records preserve the first-share time and the clock visible in the image. Screenshot activity bands are low-confidence, per-neighborhood reference signals. They can influence only the matching Baltimore neighborhood and forecast times within 30 minutes of the screenshot’s first-share time, then expire from the live model while remaining archived here. They are not request counts or confirmed Uber activity. Displayed bonus and wait labels are stored as shown, not used as numeric training targets. Actual gross earnings with online hours are evaluated separately in Earnings.</p>';
  }
  return{compare,eventPhase,context,html,adjustWeight};
});
