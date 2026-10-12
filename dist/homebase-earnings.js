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
    // GPS permission can be denied before a market timezone has been selected.
    timezone=timezone||Intl.DateTimeFormat().resolvedOptions().timeZone||'America/New_York';
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
  // Empower Baltimore Monthly Flex: the fee is set by the month's Empower
  // earnings (tier cap -> total fee). Published in the Empower driver app.
  const EMPOWER_FLEX=[[250,49.99],[500,99.99],[900,149.99],[1400,199.99],[2000,249.99],[2500,299.99],[3000,349.99],[3500,399.99],[Infinity,449.99]];
  function empowerFlexFee(gross){const g=Math.max(0,Number(gross)||0);if(!g)return 0;return EMPOWER_FLEX.find(([cap])=>g<=cap)[1];}
  // Uber pay shown to drivers is already after Uber's cut; Empower fares are kept
  // in full, minus the subscription. Vehicle costs are the same per hour on both.
  function compareEmpower({hours,uberRate,empowerRate}){
    const h=Math.max(0,Number(hours)||0),u=Math.max(0,Number(uberRate)||0),e=Math.max(0,Number(empowerRate)||0);
    const uberNet=h*u,empowerGross=h*e,fee=empowerFlexFee(empowerGross),empowerNet=empowerGross-fee;
    // Lowest Empower $/hr whose net equals Uber's net at these hours.
    let breakEven=null;for(const [cap,f] of EMPOWER_FLEX){const g=uberNet+f;if(g<=cap&&h>0){breakEven=g/h;break;}}
    return {hours:h,uberNet,empowerGross,fee,feeShare:empowerGross?fee/empowerGross:0,empowerNet,difference:empowerNet-uberNet,breakEven,better:empowerNet>uberNet?'Empower':empowerNet<uberNet?'Uber':'Even'};
  }
  function platformRate(records,name,now=new Date(),days=60){
    const since=now.getTime()-days*86400000;let g=0,h=0;
    for(const r of records||[])if(r.platform===name&&r.payType==='gross'&&r.hoursType==='online'&&r.hours>0&&Number.isFinite(r.earnings)&&(!r.startedAt||Date.parse(r.startedAt)>=since)){g+=r.earnings;h+=r.hours;}
    return h>=3?{rate:g/h,hours:h}:null;
  }
  // Pay per working hour: time out minus breaks (gas, food, car wash) is the
  // time actually working. Weekly trip bonuses are shown with and without,
  // since they are earned across the whole week's trips.
  function workingRate({earned,bonus=0,hoursOut,breakMinutes=0,goal=100,goalHours=3}){
    const e=Math.max(0,Number(earned)||0),b=Math.max(0,Number(bonus)||0),out=Math.max(0,Number(hoursOut)||0);
    const work=Math.max(0,out-Math.max(0,Number(breakMinutes)||0)/60),gh=Math.max(.25,Number(goalHours)||3),target=Math.max(0,Number(goal)||0)/gh;
    if(!(work>0))return null;
    const rate=e/work,withBonus=(e+b)/work;
    return {workingHours:work,rate,withBonus,perGoalWindow:rate*gh,perGoalWindowWithBonus:withBonus*gh,targetRate:target,
      meetsGoal:target>0?rate>=target:null,meetsGoalWithBonus:target>0?withBonus>=target:null,shortBy:target>0?Math.max(0,target*work-e):0};
  }
  function questPlan({target,done,reward}){
    const t=Math.max(0,Math.round(Number(target)||0)),d=Math.max(0,Math.round(Number(done)||0)),r=Math.max(0,Number(reward)||0);
    if(!(t>0))return null;
    return {target:t,done:Math.min(d,t),left:Math.max(0,t-d),reward:r,perTrip:r/t,complete:d>=t};
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
    const history=root.querySelector('#combinedLedger');history.className='recorded-earnings';
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
    renderEmpowerCompare();
    renderGoalPace();
    function renderGoalPace(){
      root.querySelector('#goalPace')?.remove();
      const saved=(()=>{try{return JSON.parse(localStorage.getItem('homeBaseGoalPace')||'{}')}catch(e){return {}}})();
      const f=(k,d='')=>esc(String(saved[k]??d));
      const box=document.createElement('section');box.id='goalPace';box.className='workspace-section';
      box.innerHTML='<h3>TODAY · PAY PER WORKING HOUR</h3><p class="earnings-data-note">Add up every app you drove for today. Breaks (gas, food, car wash) are not working time, so they come out of your hours. Pickup drives and short waits count, because fares are priced to cover them.</p>'+
        '<style>#goalPace .emp-in{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:8px 0}#goalPace .emp-in label{font-size:.6rem;color:var(--muted,#9fb3c0);display:grid;gap:4px}#goalPace .emp-in input{width:100%;min-height:38px;border-radius:8px;border:1px solid rgba(91,145,178,.5);background:#061018;color:#fff;font:700 .9rem Arial,sans-serif;padding:6px 8px}</style>'+
        '<div class="emp-in"><label>Earned today, all apps ($)<input type="number" min="0" step="0.01" data-k="earned" value="'+f('earned')+'" placeholder="e.g. 136.05"></label><label>Hours out<input type="number" min="0" step="0.25" data-k="out" value="'+f('out')+'" placeholder="e.g. 5"></label>'+
        '<label>Break minutes<input type="number" min="0" step="5" data-k="brk" value="'+f('brk','0')+'"></label><label>Trip bonus paid today ($)<input type="number" min="0" step="0.01" data-k="bonus" value="'+f('bonus','0')+'"></label>'+
        '<label>Goal ($)<input type="number" min="0" step="5" data-k="goal" value="'+f('goal','100')+'"></label><label>Every (hours)<input type="number" min="0.5" step="0.5" data-k="gh" value="'+f('gh','3')+'"></label></div><div class="goal-result"></div>'+
        '<details class="earnings-fallback"><summary>Weekly trip bonus</summary><div class="emp-in"><label>Trips needed<input type="number" min="0" step="1" data-k="qt" value="'+f('qt')+'" placeholder="e.g. 50"></label><label>Trips done<input type="number" min="0" step="1" data-k="qd" value="'+f('qd')+'"></label><label>Bonus ($)<input type="number" min="0" step="1" data-k="qr" value="'+f('qr')+'" placeholder="e.g. 67"></label></div><div class="quest-result"></div></details>';
      (root.querySelector('#empowerCompare')||history).after(box);
      const out=box.querySelector('.goal-result'),qout=box.querySelector('.quest-result');
      const update=()=>{const v={};box.querySelectorAll('[data-k]').forEach(i=>v[i.dataset.k]=i.value);try{localStorage.setItem('homeBaseGoalPace',JSON.stringify(v))}catch(e){}
        const r=workingRate({earned:v.earned,bonus:v.bonus,hoursOut:v.out,breakMinutes:v.brk,goal:v.goal,goalHours:v.gh}),gh=Number(v.gh)||3;
        if(!r||!(Number(v.earned)>0)){out.innerHTML='<p class="earnings-empty">Enter what you earned and how long you were out.</p>';}
        else{const hb=Number(v.bonus)>0,hrs=Math.floor(r.workingHours)+'h '+Math.round(r.workingHours%1*60)+'m';
          out.innerHTML='<div class="planner-metrics">'+[['Working time',hrs],['Per working hour',money(r.rate)],['Per '+gh+' hours',money(r.perGoalWindow)],hb?['With trip bonus',money(r.withBonus)+'/hr']:['Goal pace',money(r.targetRate)+'/hr']].map(([a,b])=>'<div><span>'+a+'</span><b>'+b+'</b></div>').join('')+'</div>'+
          '<p class="earnings-data-note"><b>'+(r.meetsGoal?'On goal':'Below goal')+'</b>'+(r.meetsGoal?' — '+money(r.perGoalWindow)+' every '+gh+' hours.':' by '+money(r.shortBy)+' for the time worked'+(hb&&r.meetsGoalWithBonus?'; the trip bonus puts you over.':'.'))+'</p>';}
        const q=questPlan({target:v.qt,done:v.qd,reward:v.qr});
        qout.innerHTML=q?'<p class="earnings-data-note"><b>'+(q.complete?'Bonus earned':q.left+' trips to go')+'</b> · each trip adds about '+money(q.perTrip)+' on top of its fare'+(q.complete?'.':'. In a bonus week, quick short trips help you reach it.')+'</p>':'';};
      box.querySelectorAll('[data-k]').forEach(i=>i.oninput=update);update();
    }
    function renderEmpowerCompare(){
      root.querySelector('#empowerCompare')?.remove();
      const saved=(()=>{try{return JSON.parse(localStorage.getItem('homeBaseEmpowerCompare')||'{}')}catch(e){return {}}})();
      const uberRec=platformRate(records,'Uber'),empRec=platformRate(records,'Empower');
      const box=document.createElement('section');box.id='empowerCompare';box.className='workspace-section';
      const val=(k,rec,fallback)=>saved[k]!=null&&saved[k]!==''?saved[k]:rec?rec.rate.toFixed(2):fallback;
      box.innerHTML='<h3>UBER VS EMPOWER · MONTHLY NET</h3><p class="earnings-data-note">Empower Monthly Flex fee is set by your Empower earnings that month. Enter pay per hour with a rider in the car (how both apps report trip time; neither counts the drive to the pickup) and the share of your online time spent with a rider.</p>'+
        '<style>#empowerCompare .emp-in{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:8px 0}#empowerCompare .emp-in label{font-size:.6rem;color:var(--muted,#9fb3c0);display:grid;gap:4px}#empowerCompare .emp-in input{width:100%;min-height:38px;border-radius:8px;border:1px solid rgba(91,145,178,.5);background:#061018;color:#fff;font:700 .9rem Arial,sans-serif;padding:6px 8px}</style><div class="emp-in"><label>Empower rider hrs/month<input type="number" min="0" step="1" data-k="hours" value="'+esc(String(saved.hours??20))+'"></label><label>Uber $/rider hr<input type="number" min="0" step="0.5" data-k="uber" value="'+esc(String(val('uber',uberRec,'')))+'" placeholder="e.g. 28"></label><label>Empower $/rider hr<input type="number" min="0" step="0.5" data-k="empower" value="'+esc(String(val('empower',empRec,'')))+'" placeholder="e.g. 53"></label><label>% of online time with rider<input type="number" min="10" max="100" step="1" data-k="util" value="'+esc(String(saved.util??62))+'"></label></div><div class="empower-result"></div>';
      history.after(box);
      const out=box.querySelector('.empower-result');
      const update=()=>{const v={};box.querySelectorAll('[data-k]').forEach(i=>v[i.dataset.k]=i.value);try{localStorage.setItem('homeBaseEmpowerCompare',JSON.stringify(v))}catch(e){}
        if(!(Number(v.hours)>0&&Number(v.uber)>0&&Number(v.empower)>0)){out.innerHTML='<p class="earnings-empty">Enter hours and both hourly rates to compare.</p>';return;}
        const c=compareEmpower({hours:v.hours,uberRate:v.uber,empowerRate:v.empower}),u=Math.min(1,Math.max(.1,(Number(v.util)||62)/100)),h=Number(v.hours);
        out.innerHTML='<div class="planner-metrics">'+[['Empower gross',money(c.empowerGross)],['Flex fee',money(c.fee)+' ('+Math.round(c.feeShare*100)+'%)'],['Empower net',money(c.empowerNet)],['Uber same hours',money(c.uberNet)],['Empower net / online hr',money(c.empowerNet/h*u)],['Uber / online hr',money(Number(v.uber)*u)]].map(([a,b])=>'<div><span>'+a+'</span><b>'+b+'</b></div>').join('')+'</div>'+
          '<p class="earnings-data-note"><b>'+(c.better==='Even'?'About even':c.better+' nets '+money(Math.abs(c.difference))+' more')+'</b> for '+c.hours+' rider hours (about '+Math.round(c.hours/u)+' online hours). '+(c.breakEven?'Empower wins once it pays more than '+money(c.breakEven)+' per rider hour.':'')+' Gas and car costs are the same on both, so they are left out.</p>';};
      box.querySelectorAll('[data-k]').forEach(i=>i.oninput=update);update();
    }
  }
  return {EMPOWER_FLEX,empowerFlexFee,workingRate,questPlan,compareEmpower,platformRate,dayKey,recordDay,periodStart,historyView,mount};
});
