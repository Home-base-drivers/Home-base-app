(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HomeBaseDemandHistory=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
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
  function html(rows,esc){const trends=compare(rows);return '<h3>NEIGHBORHOOD DEMAND HISTORY</h3><p>Consented foreground-shift snapshots. These are model changes, not confirmed ride counts or Uber surge payments.</p>'+
    (trends.length?trends.slice(0,12).map(r=>'<p><b>'+esc(r.area)+'</b> · '+Math.round(r.score*100)+'/100 · '+(r.stale?'stale':r.delta===null?'baseline needed':r.delta>.03?'rising':r.delta<-.03?'falling':'steady')+' · '+r.count+' snapshots<br><small>'+esc(new Date(r.observedAt).toLocaleString('en-US',{timeZone:'America/New_York'}))+' ET'+(r.arrivals===null?'':' · '+r.arrivals+' nearby arrival windows · '+r.exits+' exit windows')+'</small></p>').join(''):'<p>No history yet. In Profile, sign in and enable “Help evaluate the forecast model”, then start a shift. Snapshots are taken every five minutes while the app is visible.</p>')+
    '<p>Actual gross earnings with online hours are evaluated separately in Earnings. Historical screenshots without a capture date cannot be linked to a specific event. No automatic retraining from model scores.</p>';}
  return{compare,eventPhase,context,html};
});
