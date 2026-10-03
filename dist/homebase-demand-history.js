(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HomeBaseDemandHistory=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SCREENSHOT_BENCHMARK={id:'uber-baltimore-2026-10-03-0204',source:'Uber Driver map screenshot',observed_at:'2026-10-03T02:04:00-04:00',market:'Baltimore metro',capture_note:'User confirmed the screenshot is current. The status bar shows 2:04; the date and AM/PM are inferred from the upload session, not embedded in the image.',driver_status:'offline',visible_surge_amounts_usd:[1.75,2.25,2.75,3.75,3.75,5,6.5],visible_wait_windows_minutes:[[1,6],[1,1],[1,2]],interpretation:'External app display only; approximate metro view. Values are not trip counts, requests, or a Home Base forecast.'};
  function seedScreenshotBenchmark(){try{const rows=JSON.parse(localStorage.getItem('homeBaseDemandBenchmarks')||'[]');if(!Array.isArray(rows))return[SCREENSHOT_BENCHMARK];if(!rows.some(row=>row&&row.id===SCREENSHOT_BENCHMARK.id)){rows.push(SCREENSHOT_BENCHMARK);localStorage.setItem('homeBaseDemandBenchmarks',JSON.stringify(rows));}return rows;}catch{return[SCREENSHOT_BENCHMARK];}}
  const screenshotBenchmarks=seedScreenshotBenchmark();
  function compare(rows,now=Date.now()){
    const groups=new Map();
    for(const row of rows||[]){const time=Date.parse(row.observed_at),score=Number(row.modeled_score);
      if(row.modeled_score==null||!Number.isFinite(time)||time>now||now-time>90*86400000||!Number.isFinite(score)||score<0||score>1)continue;
      const key=row.area;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({...row,time,score});}
    return [...groups].map(([area,items])=>{items.sort((a,b)=>b.time-a.time);const latest=items[0],prior=items.find(r=>latest.time-r.time>=15*60000&&latest.time-r.time<=90*60000);
      return{area,score:latest.score,observedAt:latest.observed_at,count:items.length,arrivals:latest.event_arrivals??null,exits:latest.event_exits??null,delta:prior?latest.score-prior.score:null,stale:now-latest.time>15*60000};}).sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt));
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
    const amounts=(row.visible_surge_amounts_usd||[]).map(value=>'+$'+Number(value).toFixed(2)).join(', '),waits=(row.visible_wait_windows_minutes||[]).map(pair=>pair[0]===pair[1]?pair[0]+' min':pair[0]+'–'+pair[1]+' min').join(', ');
    return '<p><b>'+esc(row.source)+'</b> · '+esc(row.market)+' · external benchmark<br><small>'+esc(new Date(row.observed_at).toLocaleString('en-US',{timeZone:'America/New_York'}))+' ET · Uber displayed '+amounts+' · wait indicators '+waits+' · '+esc(row.driver_status)+'</small><br><small>'+esc(row.capture_note)+'</small></p>';
  }
  function html(rows,esc){const trends=compare(rows),benchmarks=Array.isArray(screenshotBenchmarks)?screenshotBenchmarks:[];
    const benchmarkSection='<h4>EXTERNAL REFERENCE SNAPSHOTS</h4>'+(benchmarks.length?benchmarks.map(row=>benchmarkHtml(row,esc)).join(''):'<p>No reference screenshots stored.</p>');
    const modelHistory=trends.length?trends.slice(0,12).map(r=>'<p><b>'+esc(r.area)+'</b> · '+Math.round(r.score*100)+'/100 · '+(r.stale?'stale':r.delta===null?'baseline needed':r.delta>.03?'rising':r.delta<-.03?'falling':'steady')+' · '+r.count+' snapshots<br><small>'+esc(new Date(r.observedAt).toLocaleString('en-US',{timeZone:'America/New_York'}))+' ET'+(r.arrivals===null?'':' · '+r.arrivals+' nearby arrival windows · '+r.exits+' exit windows')+'</small></p>').join(''):'<p>No Home Base shift history yet. In Profile, enable Help evaluate the forecast model, then start a shift. Model snapshots are taken every five minutes while the app is visible.</p>';
    return '<h3>NEIGHBORHOOD DEMAND HISTORY</h3><p>Home Base shift scores are calculated by its model. They are not confirmed ride counts or Uber surge payments.</p>'+benchmarkSection+modelHistory+'<p>Screenshot values are a separate reference and do not train Home Base automatically. Actual gross earnings with online hours are evaluated separately in Earnings.</p>';
  }
  return{compare,eventPhase,context,html};
});
