(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.HomeBaseEarnings=api;
})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  const providers=['Uber','Lyft','Empower'];
  const periods={week:'This week',month:'This month',year:'This year',all:'All history'};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function dayKey(value,timezone='America/New_York'){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
    const part=name=>parts.find(p=>p.type===name).value;
    return part('year')+'-'+part('month')+'-'+part('day');
  }
  function recordDay(row,timezone){
    if(row.timePrecision&&row.startedAt&&Number.isFinite(Date.parse(row.startedAt)))return dayKey(row.startedAt,timezone);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date||''))return null;
    const date=new Date(row.date+'T12:00:00Z');
    return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===row.date?row.date:null;
  }
  function periodStart(period,today){
    if(period==='all')return null;
    if(period==='year')return today.slice(0,4)+'-01-01';
    if(period==='month')return today.slice(0,7)+'-01';
    const date=new Date(today+'T12:00:00Z');
    date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7));
    return date.toISOString().slice(0,10);
  }
  function historyView(records,{period='week',platform='All',now=new Date(),timezone='America/New_York'}={}){
    if(!Object.hasOwn(periods,period))period='week';
    const today=dayKey(now,timezone),start=periodStart(period,today),rows=[];
    let undated=0,future=0;
    const platforms=[...new Set(records.map(r=>r.platform).filter(Boolean))].sort();
    for(const row of records){
      if(platform!=='All'&&row.platform!==platform)continue;
      if(!Number.isFinite(row.earnings)||!['gross','payout'].includes(row.payType))continue;
      const date=recordDay(row,timezone);
      if(date&&(date>today||(row.timePrecision&&Date.parse(row.startedAt)>new Date(now).getTime()))){future++;continue;}
      if(!date){undated++;if(period!=='all')continue;}
      if(date&&start&&date<start)continue;
      rows.push({...row,displayDate:date});
    }
    rows.sort((a,b)=>(b.displayDate||'').localeCompare(a.displayDate||'')||(b.startedAt||'').localeCompare(a.startedAt||''));
    const totals={gross:0,payout:0,onlineHours:0,onlineGross:0,trips:0,miles:0,costs:0,rows:rows.length,hasGross:false,hasPayout:false,hasTrips:false};
    const perPlatform={},months={};
    for(const row of rows){
      const item=perPlatform[row.platform]||(perPlatform[row.platform]={gross:0,payout:0,rows:0});
      totals[row.payType]+=row.earnings;item[row.payType]+=row.earnings;item.rows++;
      if(row.payType==='gross')totals.hasGross=true;else totals.hasPayout=true;
      // Keep payouts separate: a transfer and its gross record can describe the same work.
      if(row.payType==='gross'){
        if(row.hoursType==='online'&&Number.isFinite(row.hours)&&row.hours>0){totals.onlineHours+=row.hours;totals.onlineGross+=row.earnings;}
        if(Number.isFinite(row.trips)&&row.trips>=0){totals.trips+=row.trips;totals.hasTrips=true;}
        if(Number.isFinite(row.miles)&&row.miles>=0)totals.miles+=row.miles;
        if(Number.isFinite(row.costs)&&row.costs>=0)totals.costs+=row.costs;
      }
      if(row.displayDate){
        const month=months[row.displayDate.slice(0,7)]||(months[row.displayDate.slice(0,7)]={gross:0,payout:0});
        month[row.payType]+=row.earnings;
      }
    }
    return {period,platform,today,start,rows,totals,platforms,perPlatform,months,undated,future,
      hourlyRate:totals.onlineHours>0?totals.onlineGross/totals.onlineHours:null};
  }
  function mount(root,{records,money,timezone,onOptions,view,onViewChange,importedCount,manualCount,weeklyGoal=0}){
    root.querySelector('.platform-connection-status')?.remove();
    const section=root.querySelector('#earningsCsv')?.closest('section');
    if(!section)return;
    section.id='earningsConnections';
    section.querySelector('h3').textContent='ACCOUNT CONNECTIONS';
    section.querySelector('.section-tag').textContent='EARNINGS';
    section.querySelector('.earnings-intro').textContent='Connect once for automatic updates when your platform is supported. CSV is available while account sync is being enabled.';
    const connections=document.createElement('div');connections.className='earnings-connections';
    connections.setAttribute('aria-label','Earnings account connections');
    const styleByProvider={Uber:'uber',Lyft:'lyft',Empower:'empower'};
    connections.innerHTML=providers.map(name=>{
      const count=records.filter(r=>r.platform===name&&!String(r.id).startsWith('shift:')).length;
      return '<button type="button" class="earnings-connection '+styleByProvider[name]+'" data-account="'+name+'" aria-label="'+name+' connection options"><span class="earnings-provider-mark" aria-hidden="true">'+(name==='Empower'?'E':name[0])+'</span><span><b>'+name+'</b><small>Automatic sync unavailable</small>'+(count?'<small>'+count+' imported records</small>':'')+'</span><span class="connection-chevron" aria-hidden="true">›</span></button>';
    }).join('');
    section.querySelector('.earnings-intro').after(connections);
    connections.querySelectorAll('[data-account]').forEach(button=>button.onclick=()=>onOptions(button.dataset.account));
    const fallback=document.createElement('details');fallback.id='csvFallback';fallback.className='earnings-fallback';
    fallback.innerHTML='<summary>Import CSV instead <span>Gridwise or platform export</span></summary>';
    const nodes=[...section.children].filter(node=>node.matches('.gridwise-sync-status,details,.csv-upload,.earnings-message'));
    const message=section.querySelector('.earnings-message');fallback.open=!!message?.textContent.trim();
    section.append(fallback);nodes.forEach(node=>fallback.append(node));
    const sync=fallback.querySelector('.gridwise-sync-status');
    if(sync){sync.querySelector('b').textContent=importedCount?'CSV history saved':'Automatic file detection';sync.querySelector('span').textContent='Select one or more files. Platforms and columns are detected, and repeat imports skip matching records. Files stay on this device.';}
    const old=root.querySelector('.dashboard-hero');if(old)old.remove();
    root.querySelectorAll('.workspace-section').forEach(node=>{if(node.querySelector('h3')?.textContent==='PLATFORM PERFORMANCE')node.remove();});
    const history=root.querySelector('#combinedLedger');history.innerHTML='';history.className='recorded-earnings';
    // Actual history is the main earnings view; planning forecasts remain available separately.
    const forecasts=root.querySelector('.forecast-strip');if(forecasts){const details=document.createElement('details');details.className='earnings-fallback';details.innerHTML='<summary>Planning forecasts</summary>';forecasts.before(details);details.append(forecasts);history.after(details);}
    for(const [id,label] of [['automaticCalibration','Forecast learning'],['backupCard','Backup & restore']]){
      const card=root.querySelector('#'+id);if(card){const details=document.createElement('details');details.className='earnings-fallback';details.innerHTML='<summary>'+label+'</summary>';card.before(details);details.append(card);}
    }
    const cost=root.querySelector('#costSave')?.closest('section');if(cost){const details=document.createElement('details');details.className='earnings-fallback';details.innerHTML='<summary>Costs & reserves</summary>';cost.before(details);details.append(cost);}
    let selection={period:view?.period||'week',platform:view?.platform||'All'};
    function render(){
      const known=records.some(r=>r.platform===selection.platform);if(selection.platform!=='All'&&!known)selection.platform='All';
      const data=historyView(records,{...selection,timezone}),t=data.totals;
      selection={period:data.period,platform:data.platform};
      const title=periods[data.period],max=Math.max(1,...Object.values(data.perPlatform).map(p=>Math.abs(p.gross)));
      history.innerHTML='<div class="earnings-history-head"><div><span>RECORDED GROSS EARNINGS</span><strong>'+(t.rows&&!t.hasGross?'Not provided':money(t.gross))+'</strong><small>'+title+' · '+t.rows+' records</small></div><span class="earnings-recorded-tag">ON DEVICE</span></div>'+
        '<div class="earnings-periods" role="group" aria-label="Earnings period">'+Object.entries(periods).map(([key,label])=>'<button type="button" data-period="'+key+'" aria-pressed="'+(key===data.period)+'">'+label+'</button>').join('')+'</div>'+
        '<label class="earnings-platform-filter">Platform<select id="earningsPlatformFilter"><option value="All">All platforms</option>'+data.platforms.map(name=>'<option'+(name===data.platform?' selected':'')+'>'+esc(name)+'</option>').join('')+'</select></label>'+
        '<div class="planner-metrics">'+[['Gross / online hour',data.hourlyRate===null?'Hours needed':money(data.hourlyRate)],['Recorded online hours',t.onlineHours?t.onlineHours.toFixed(1):'Not provided'],['Recorded trips',t.hasTrips?t.trips.toLocaleString():'Not provided'],['Recorded payouts',t.hasPayout?money(t.payout):'Not provided']].map(([label,value])=>'<div><span>'+label+'</span><b>'+value+'</b></div>').join('')+'</div>'+
        (weeklyGoal>0&&data.period==='week'&&data.platform==='All'?'<div class="completion"><div class="completion-label"><span>Weekly gross goal '+money(weeklyGoal)+'</span><b>'+Math.max(0,Math.min(100,Math.round(t.gross/weeklyGoal*100)))+'%</b></div><div class="goal-track"><i style="width:'+Math.max(0,Math.min(100,t.gross/weeklyGoal*100))+'%"></i></div></div>':'')+
        '<p class="earnings-data-note">Payouts are shown separately from gross earnings. Hourly rates use only gross records with explicitly online hours; active-trip time is excluded. Week starts Monday.</p>'+
        (!t.rows?'<p class="earnings-empty">'+(records.length?'No recorded earnings in this period. Choose another period or platform.':'No recorded earnings yet. Use a connection option above, or import a CSV.')+'</p>':'')+
        Object.entries(data.perPlatform).sort((a,b)=>b[1].gross-a[1].gross).map(([name,p])=>'<div class="earnings-platform"><div class="earnings-platform-head"><b>'+esc(name)+'</b><span>'+money(p.gross)+' gross'+(p.payout?' · '+money(p.payout)+' payouts':'')+'</span></div><div class="earnings-bar"><i style="width:'+Math.min(100,Math.abs(p.gross)/max*100)+'%"></i></div></div>').join('')+
        (Object.keys(data.months).length>1?'<details class="earnings-fallback"><summary>Monthly gross earnings</summary>'+Object.entries(data.months).sort((a,b)=>a[0].localeCompare(b[0])).map(([month,p])=>'<div class="earnings-month"><span>'+esc(month)+'</span><strong>'+money(p.gross)+'</strong></div>').join('')+'</details>':'')+
        '<p class="earnings-data-note">'+importedCount+' imported records · '+manualCount+' manual shifts.'+(data.undated?' '+data.undated+' undated records '+(data.period==='all'?'included in all history.':'available in All history.'):'')+(data.future?' '+data.future+' future-dated records excluded.':'')+'</p>'+
        '<details class="earnings-fallback"><summary>View recorded activity</summary><div class="earnings-activity">'+data.rows.slice(0,25).map(r=>'<div><span><b>'+esc(r.platform)+'</b><small>'+esc(r.displayDate||'Undated')+' · '+r.payType+'</small></span><b>'+money(r.earnings)+'</b></div>').join('')+'</div>'+(t.rows>25?'<p>Showing the latest 25 records. Save a backup for the complete history.</p>':'')+'</details>';
      history.querySelectorAll('[data-period]').forEach(button=>button.onclick=()=>{selection.period=button.dataset.period;onViewChange(selection);render();});
      history.querySelector('#earningsPlatformFilter').onchange=event=>{selection.platform=event.target.value;onViewChange(selection);render();};
    }
    render();
  }
  return {dayKey,recordDay,periodStart,historyView,mount};
});
