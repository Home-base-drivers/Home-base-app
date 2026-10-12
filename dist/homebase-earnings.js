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
  // Car costs from a bank/budget CSV (Rocket Money export). Only car and gas
  // rows are kept; every other row is dropped before anything is stored.
  const SKIP_CATEGORIES=/^(credit card payment|internal transfers|mortgage|bge|income|savings transfer)$/i;
  const GAS=/\bSHELL\b|SHEETZ|\bBP\b|BP#|CROWN\b|DASH IN|CONOCO|SUNOCO|RUTTER|BOLLA|VALERO|EXXON|CITGO|SPEEDWAY|\bGULF\b|CHEVRON|MARATHON|AMOCO|LUKOIL|QUICK CHECK|\bCMF\b/;
  function carExpenseType(name,category,amount){
    const n=String(name||'').toUpperCase(),c=String(category||''),a=Number(amount);
    if(!Number.isFinite(a)||a<=0||SKIP_CATEGORIES.test(c))return null;
    if(/CAR WASH|SUDSVILLE|ROYAL FARMS CW/.test(n))return 'Car wash';
    if(/ROYAL FARMS|WAWA|7-ELEVEN|SAMS CLUB|SAM'S CLUB|COSTCO GAS/.test(n))return a>=20&&(/ROYAL FARMS|WAWA|7-ELEVEN/.test(n)||/auto/i.test(c))?'Gas':null;
    if(GAS.test(n))return a>=10?'Gas':null;
    if(!/auto|transport/i.test(c))return null;
    if(/DRIVEEZ|EZPASS|E-ZPASS|TOLL/.test(n))return 'Tolls';
    if(/SPOTHERO|PABC|PARK|GARAGE/.test(n))return 'Parking';
    if(/MECANICO|MECHANIC|AUTO|TIRE|GEAR|FIRESTONE|JIFFY|VALVOLINE|PEP BOYS|MEINEKE|TRANSMISSION|OIL/.test(n))return 'Repairs & maintenance';
    if(/PROGRESSIVE|TRAVELERS|GEICO|STATE FARM|ALLSTATE|INSUR/.test(n))return 'Insurance';
    if(/CARMAX|ACURA FIN|ALLY AUTO|AUTO LOAN/.test(n))return 'Car payment';
    if(/MVA|CITY GOVT|BALTIMORECNTY|TICKET|CITATION/.test(n))return 'Tickets & registration';
    if(/U-HAUL|UBER|LYFT|SPIN|ZELLE FROM/.test(n))return null;
    return 'Other car';
  }
  function parseCsv(text){
    const rows=[];let row=[],cell='',q=false;
    for(let i=0;i<text.length;i++){const ch=text[i];
      if(q){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++}else q=false}else cell+=ch}
      else if(ch==='"')q=true;else if(ch===','){row.push(cell);cell=''}else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell=''}else cell+=ch}
    if(cell||row.length){row.push(cell);rows.push(row)}
    return rows.filter(r=>r.some(v=>v.trim()));
  }
  function carExpensesFromCsv(text){
    const [head,...body]=parseCsv(String(text||''));if(!head)return [];
    const col=re=>head.findIndex(h=>re.test(h.trim()));
    const di=col(/^date$/i),ni=col(/^name$|^description$|^merchant/i),ci=col(/^category$/i),ai=col(/^amount$/i),ii=col(/^ignored/i);
    if(di<0||ni<0||ai<0)return [];
    const out=[];
    for(const r of body){
      if(ii>=0&&String(r[ii]||'').trim())continue;
      const date=String(r[di]||'').slice(0,10),amount=Number(String(r[ai]).replace(/[$,]/g,'')),type=carExpenseType(r[ni],ci>=0?r[ci]:'',amount);
      if(type&&/^\d{4}-\d{2}-\d{2}$/.test(date))out.push({date,merchant:String(r[ni]).slice(0,60),amount:Math.round(amount*100)/100,type});
    }
    return out.sort((a,b)=>a.date.localeCompare(b.date));
  }
  const DAY=86400000,days=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/DAY)+1;
  const carKey=r=>r.date+'|'+r.merchant+'|'+r.amount;
  function carCostSummary(rows,{from,miles,milesAsOf,washMonthly=120,costTarget=20,dayEarned,dayHours,dayMiles,fullTimeDays=22,exclude=[],gasPrice,mpg,fillCost}={}){
    const skip=new Set(exclude||[]);rows=(rows||[]).filter(r=>!skip.has(carKey(r)));
    const inRange=rows.filter(r=>!from||r.date>=from);
    if(!inRange.length)return null;
    const start=from||inRange[0].date,end=inRange[inRange.length-1].date,span=days(start,end),byType={};
    for(const r of inRange)byType[r.type]=(byType[r.type]||0)+r.amount;
    const gas=byType.Gas||0,m=Number(miles)||0,asOf=milesAsOf||end;
    // Miles are pro-rated to the CSV's last date when they were counted later.
    const windowMiles=m>0?(asOf>end?m*span/days(start,asOf):m):0,pumpRate=Number(gasPrice)>0&&Number(mpg)>0?Number(gasPrice)/Number(mpg):null,receiptRate=windowMiles>0?gas/windowMiles:null,gasPerMile=pumpRate||receiptRate;
    const lastPayment=[...(rows||[])].reverse().find(r=>r.type==='Car payment'),fixedMonthly=(lastPayment?lastPayment.amount:0)+(Number(washMonthly)||0);
    const res={costTarget:Number(costTarget)||20,start,end,span,byType,gas,gasPer30:gas/span*30,windowMiles,gasPerMile,receiptRate,pumpRate,fixedMonthly};
    const e=Number(dayEarned),h=Number(dayHours),dm=Number(dayMiles);
    if(e>0&&h>0){const dayGas=gasPerMile&&dm>0?gasPerMile*dm:Number(fillCost)>0?Number(fillCost)*h/12:null,dayFixed=fixedMonthly/Math.max(1,Number(fullTimeDays)||22),net=e-(dayGas||0)-dayFixed;
      const repairsMonthly=(byType['Repairs & maintenance']||0)/span*30,dayRepairs=repairsMonthly/Math.max(1,Number(fullTimeDays)||22),costs=(dayGas||0)+dayFixed+dayRepairs;
      res.day={gross:e,hours:h,grossRate:e/h,gas:dayGas,fixed:dayFixed,repairs:dayRepairs,costs,costShare:costs/e,net,netRate:net/h,per3:net/h*3,milesKnown:dayGas!=null};}
    return res;
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
    renderCarCosts();
    function renderCarCosts(){
      root.querySelector('#carCosts')?.remove();
      const load=(k,d)=>{try{return JSON.parse(localStorage.getItem(k)||'null')??d}catch(e){return d}};
      let rows=load('homeBaseCarExpenses',[]);const saved=load('homeBaseCarCostInputs',{});
      const f=(k,d='')=>esc(String(saved[k]??d));
      const box=document.createElement('section');box.id='carCosts';box.className='workspace-section';
      box.innerHTML='<h3>CAR COSTS · WHAT YOU KEEP</h3><p class="earnings-data-note">Import your Rocket Money (or bank) CSV. Only gas, car wash, repairs, insurance, tolls, parking and car payments are kept, on this device. Everything else in the file is ignored.</p>'+
        '<style>#carCosts .emp-in{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:8px 0}#carCosts .emp-in label{font-size:.6rem;color:var(--muted,#9fb3c0);display:grid;gap:4px}#carCosts .emp-in input{width:100%;min-height:38px;border-radius:8px;border:1px solid rgba(91,145,178,.5);background:#061018;color:#fff;font:700 .9rem Arial,sans-serif;padding:6px 8px}#carCosts .car-row{display:flex;justify-content:space-between;font-size:.72rem;padding:4px 0;border-bottom:1px solid rgba(94,155,190,.15)}</style>'+
        '<label class="csv-upload"><svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5M4 15v5h16v-5"/></svg><div><b>'+(rows.length?rows.length+' car expenses saved':'Import car expenses')+'</b><span>CSV · car and gas rows only</span></div><em>CHOOSE CSV</em><input id="carCsv" type="file" accept=".csv,text/csv"></label>'+
        '<div class="emp-in"><label>Count from<input type="date" data-k="from" value="'+f('from')+'"></label><label>Miles driven since then<input type="number" min="0" step="1" data-k="miles" value="'+f('miles')+'" placeholder="e.g. 9000"></label>'+
        '<label>Miles counted as of<input type="date" data-k="asOf" value="'+f('asOf')+'"></label><label>Car wash per month ($)<input type="number" min="0" step="1" data-k="wash" value="'+f('wash','120')+'"></label>'+
        '<label>Full day earned ($)<input type="number" min="0" step="0.01" data-k="dayE" value="'+f('dayE','364.29')+'"></label><label>Full day working hours<input type="number" min="0" step="0.01" data-k="dayH" value="'+f('dayH','12.72')+'"></label>'+
        '<label>Full day miles<input type="number" min="0" step="1" data-k="dayM" value="'+f('dayM')+'" placeholder="odometer"></label><label>Full-time days / month<input type="number" min="1" max="31" step="1" data-k="days" value="'+f('days','22')+'"></label>'+
        '<label>Gas price ($/gal)<input type="number" min="0" step="0.01" data-k="price" value="'+f('price')+'" placeholder="e.g. 4.25"></label><label>Your MPG<input type="number" min="0" step="0.5" data-k="mpg" value="'+f('mpg')+'" placeholder="e.g. 19"></label>'+
        '<label>Gas for a 12-hour day ($)<input type="number" min="0" step="1" data-k="fill" value="'+f('fill')+'" placeholder="one fill-up"></label><label>Keep costs under (% of gross)<input type="number" min="1" max="100" step="1" data-k="target" value="'+f('target','20')+'"></label></div><div class="car-result"></div>';
      (root.querySelector('#goalPace')||root.querySelector('#empowerCompare')||history).after(box);
      const out=box.querySelector('.car-result');
      const update=()=>{const v={};box.querySelectorAll('[data-k]').forEach(i=>v[i.dataset.k]=i.value);try{localStorage.setItem('homeBaseCarCostInputs',JSON.stringify(v))}catch(e){}
        const exclude=load('homeBaseCarExclude',[]),r=carCostSummary(rows,{from:v.from,miles:v.miles,milesAsOf:v.asOf,washMonthly:v.wash,dayEarned:v.dayE,dayHours:v.dayH,dayMiles:v.dayM,fullTimeDays:v.days,exclude,gasPrice:v.price,mpg:v.mpg,fillCost:v.fill,costTarget:v.target});
        if(!r){out.innerHTML='<p class="earnings-empty">'+(rows.length?'No car expenses after that date.':'Import a CSV to see your car costs.')+'</p>';return;}
        const order=['Gas','Car wash','Repairs & maintenance','Car payment','Insurance','Tolls','Parking','Tickets & registration','Other car'];
        out.innerHTML='<p class="earnings-data-note">'+esc(r.start)+' to '+esc(r.end)+' ('+r.span+' days of data)</p>'+order.filter(t=>r.byType[t]).map(t=>'<div class="car-row"><span>'+t+'</span><b>'+money(r.byType[t])+'</b></div>').join('')+
          '<div class="planner-metrics">'+[['Gas per 30 days',money(r.gasPer30)],['Gas per mile',r.gasPerMile?'$'+r.gasPerMile.toFixed(3)+(r.pumpRate?' (price ÷ mpg)':' (receipts)'):'Add miles or mpg'],['Car payment + wash / month',money(r.fixedMonthly)],r.day?['Car costs / gross',r.day.milesKnown?Math.round(r.day.costShare*1000)/10+'%'+(r.day.costShare<=r.costTarget/100?' ✓':' ⚠'):'Add day miles or fill cost']:['Full day','Add earnings']].map(([a,b])=>'<div><span>'+a+'</span><b>'+b+'</b></div>').join('')+'</div>'+
          (r.day&&r.day.milesKnown?'<p class="earnings-data-note"><b>'+(r.day.costShare<=r.costTarget/100?'Under':'Over')+' your '+r.costTarget+'% cost limit:</b> gas '+money(r.day.gas)+' + car wash/fees '+money(r.day.fixed)+' + repairs '+money(r.day.repairs)+' = '+money(r.day.costs)+' of '+money(r.day.gross)+' ('+Math.round(r.day.costShare*1000)/10+'%). Limit is '+money(r.day.gross*r.costTarget/100)+' a day.</p>':'')+(r.day?'<p class="earnings-data-note"><b>Full day: '+money(r.day.gross)+' earned, '+money(r.day.grossRate)+'/hr before costs.</b> Gas '+(r.day.milesKnown?money(r.day.gas):'needs day miles or fill cost')+', car payment + wash '+money(r.day.fixed)+' per day. Kept '+money(r.day.net)+' = '+money(r.day.netRate)+'/hr, '+money(r.day.per3)+' per 3 hours.'+(r.windowMiles&&v.asOf>r.end?' Miles pro-rated to the last date in the file.':'')+' Repairs are shown above but not charged to one day.</p>':'')+
          '<details class="earnings-fallback"><summary>Not my car or not for driving? Tap to leave out</summary>'+rows.filter(x=>!v.from||x.date>=v.from).map(x=>'<label class="car-row"><span><input type="checkbox" data-x="'+esc(carKey(x))+'"'+(exclude.includes(carKey(x))?'':' checked')+'> '+esc(x.date)+' · '+esc(x.merchant.slice(0,28))+'</span><b>'+money(x.amount)+'</b></label>').join('')+'</details>';
        out.querySelectorAll('[data-x]').forEach(c=>c.onchange=()=>{const set=new Set(load('homeBaseCarExclude',[]));c.checked?set.delete(c.dataset.x):set.add(c.dataset.x);try{localStorage.setItem('homeBaseCarExclude',JSON.stringify([...set]))}catch(e){}const open=out.querySelector('details')?.open;update();if(open)out.querySelector('details').open=true;});};
      box.querySelector('#carCsv').onchange=async ev=>{const file=ev.target.files?.[0];if(!file)return;const next=carExpensesFromCsv(await file.text());if(next.length){rows=next;try{localStorage.setItem('homeBaseCarExpenses',JSON.stringify(rows))}catch(e){}}renderCarCosts();};
      box.querySelectorAll('[data-k]').forEach(i=>i.oninput=update);update();
    }
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
      box.innerHTML='<h3>UBER VS EMPOWER · MONTHLY NET</h3><p class="earnings-data-note">Empower Monthly Flex fee is set by your Empower earnings that month and is taken out of your first Empower earnings each cycle, so early-cycle Empower rides pay $0 until the fee is covered. Enter pay per hour with a rider in the car (how both apps report trip time; neither counts the drive to the pickup) and the share of your online time spent with a rider.</p>'+
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
  return {EMPOWER_FLEX,empowerFlexFee,carKey,carExpenseType,parseCsv,carExpensesFromCsv,carCostSummary,workingRate,questPlan,compareEmpower,platformRate,dayKey,recordDay,periodStart,historyView,mount};
});
