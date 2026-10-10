/* Route eligibility sits ahead of economic ranking. POIs are not events. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HomeBaseRoutePolicy=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const stamp=value=>value instanceof Date?value.getTime():typeof value==='string'&&/T\d{2}:\d{2}/.test(value)?Date.parse(value):NaN;
  function eventImpact(source){
    const count=Number(source.expectedAttendance),url=source.attendanceSourceUrl||source.tags?.attendanceSourceUrl,basis=source.attendanceBasis;
    const supported=source.expectedAttendance!=null&&Number.isFinite(count)&&count>=0&&count<=1000000&&/^https:\/\//.test(url||'')&&['reported','organizer_estimate','published_estimate'].includes(basis);
    if(!supported)return {attendance:null,basis:'unknown',scale:.6,label:'Attendance unknown · conservative event forecast'};
    const confidence=Number.isFinite(source.attendanceConfidence)?Math.max(0,Math.min(1,source.attendanceConfidence)):basis==='reported'?1:.75;
    const size=count===0?0:Math.max(.4,Math.min(2.4,.35+.55*Math.log10(1+count/100)));
    return {attendance:count,basis,scale:count===0?0:.6*(1-confidence)+size*confidence,label:(basis==='reported'?'Reported attendance: ':'Published attendance estimate: ')+Math.round(count).toLocaleString('en-US')+' · ride demand is modeled'};
  }
  function eventPhase(source,when,now=new Date()){
    const tags=source.tags||{},start=stamp(source.eventStart),time=stamp(when);
    if(!Number.isFinite(start)||!Number.isFinite(time)||!(tags.providerEvent||tags.liveEvent||tags.publicCalendar||source.verifiedEvent===true))return null;
    if(source.allDay||source.virtual||source.private||tags.allDay||tags.virtual||tags.private||/cancel|postpon|completed|post$/i.test(String(source.eventState||source.status||'')))return null;
    const end=source.eventEndEstimated?NaN:stamp(source.eventEnd);
    // Ride activity follows arrivals and departures, not the whole event.
    if(time>=start-60*60000&&time<start)return 'arrival';
    if(time===start)return 'start';
    if(Number.isFinite(end)&&end>start&&time>=end&&time<end+60*60000)return 'exit';
    // A scoreboard observed in its final period is a live, not modeled, cue.
    // It applies only near the observation; later hours cannot reuse it.
    const observed=stamp(tags.observedAt);
    if(tags.gameClosing&&!Number.isFinite(end)&&Number.isFinite(observed)&&time>=observed-5*60000&&time<=observed+20*60000)return 'closing';
    // Unknown/estimated ends cannot invent a departure window.
    return null;
  }
  function schoolStage(source){
    const tags=source.tags||{},level=String(tags.schoolLevel||tags['school:level']||tags['school:grades']||tags['isced:level']||'').toLowerCase(),name=String(source.name||'').toLowerCase();
    if(/adult|driving|trade|vocational|training|language/.test(level+' '+name)||source.cat==='university')return 'adult';
    if(/kindergarten|elementary|primary|preschool/.test(level+' '+name)||tags.amenity==='kindergarten'||/^(0|1)$/.test(level))return 'primary';
    if(/middle|junior high|lower secondary/.test(level+' '+name)||level==='2')return 'middle';
    if(/high school|upper secondary|baltimore city college|poly \/ western|milford mill academy/.test(level+' '+name)||level==='3')return 'high';
    return 'unknown';
  }
  function schoolWeight(source,parts,when){
    const stage=schoolStage(source),day=parts.day,hour=parts.hour;
    if(stage==='adult'||day<1||day>5||source.tags?.schoolClosed)return 0;
    // UBalt confirms City College's classes moved during its four-year renovation:
    // https://www.ubalt.edu/about/ubalt-initiatives/city-college-high-school-at-ubalt.cfm
    // Suppress the old campus; do not guess the temporary pickup entrance.
    const time=stamp(when);
    if(/baltimore city college/i.test(source.name||'')&&source.lat>39.32&&time>=Date.parse('2025-08-01T00:00:00Z')&&time<Date.parse('2029-08-01T00:00:00Z'))return 0;
    const start=clockHour(source.schoolStart||source.tags?.schoolStart||source.tags?.['school:start'])??8;
    const end=clockHour(source.schoolEnd||source.tags?.schoolEnd||source.tags?.['school:end'])??14.5;
    // Dismissal timing is fitted to observed Baltimore surge circulation (Oct 8-9,
    // 2026): bonuses near city schools rose up to 25 minutes before the
    // published closing bell, peaked from 10 minutes before to 15 minutes after
    // it, and were mostly gone 45-75 minutes later.
    const m=(hour-end)*60;
    const dismissal=m< -25||m>75?0:m< -10?6*(m+25)/15:m<=15?8:m<=45?8-5*(m-15)/30:3*(1-(m-45)/30);
    const active=hour>=start-1&&hour<start?8*(hour-(start-1)):dismissal;
    // Generic windows are modeled family activity, not bell schedules or rides
    // for unaccompanied minors. High schools receive a smaller prior.
    return active*(stage==='primary'||stage==='middle'?1:stage==='high'?.45:.65);
  }
  function clockHour(value){
    if(typeof value==='number')return Number.isFinite(value)&&value>=0&&value<24?value:null;
    const m=/^(\d{1,2}):(\d{2})$/.exec(String(value||''));
    return m&&+m[1]<24&&+m[2]<60?+m[1]+(+m[2])/60:null;
  }
  function warehouse(source){
    const t=source.tags||{};
    return source.cat==='warehouse'||t.industrial==='warehouse'||t.building==='warehouse'||/amazon/i.test(t.operator||'')&&t.shop!=='supermarket'||/amazon.*(warehouse|fulfil|fulfill|distribution|sortation|delivery station)/i.test(source.name||'');
  }
  const days=['Su','Mo','Tu','We','Th','Fr','Sa'];
  function dayMatches(spec,day){
    if(!spec)return true;
    return spec.split(',').some(part=>{const [a,b]=part.split('-'),start=days.indexOf(a),end=days.indexOf(b||a);return start>=0&&end>=0&&(start<=end?day>=start&&day<=end:day>=start||day<=end);});
  }
  function mallClosingHours(source,day){
    const t=source.tags||{},explicit=clockHour(source.mallClosingHour??t.mallClosingHour);
    if(explicit!==null)return [explicit];
    const raw=String(t.opening_hours||'').trim();if(!raw||raw==='24/7')return [];
    // Interpret only simple public weekly schedules; complex/holiday rules
    // stay unconfirmed rather than silently guessing a closing time.
    if(/PH|SH|\"|\+|sunrise|sunset/i.test(raw))return [];
    let result=[];
    for(const rule of raw.split(';')){
      const m=/^\s*(?:((?:Su|Mo|Tu|We|Th|Fr|Sa)(?:-(?:Su|Mo|Tu|We|Th|Fr|Sa))?(?:,(?:Su|Mo|Tu|We|Th|Fr|Sa)(?:-(?:Su|Mo|Tu|We|Th|Fr|Sa))?)*)\s+)?(off|closed|(?:\d{1,2}:\d{2}-\d{1,2}:\d{2})(?:,\s*\d{1,2}:\d{2}-\d{1,2}:\d{2})*)\s*$/.exec(rule);
      if(!m)return [];
      if(!dayMatches(m[1],day))continue;
      if(/off|closed/.test(m[2])){result=[];continue;}
      result=m[2].split(',').map(range=>{const [open,close]=range.trim().split('-').map(clockHour);return open!==null&&close!==null?close+(close<=open?24:0):null;}).filter(v=>v!==null);
    }
    return result;
  }
  function workerWeight(source,parts){
    const hour=parts.hour;
    // A verified closure (e.g. a shut delivery station) ends modeled shift demand.
    if(source.tags?.siteClosed)return 0;
    // Large-employer sites with a shift-end window (e.g. hospital 12-hour handoffs):
    // departures peak just after the handoff and fade over about 45 minutes.
    const ends=source.tags?.shiftEnds;
    if(Array.isArray(ends)&&ends.length){const w=Number(source.tags.shiftWeight)||4;return Math.max(...ends.map(e=>{const d=Math.min(Math.abs(hour-e),24-Math.abs(hour-e));return w*Math.max(0,1-d/.75);}),0);}
    if(warehouse(source))return Math.max(...[15,23].map(shift=>8*Math.max(0,1-Math.min(Math.abs(hour-shift),24-Math.abs(hour-shift)))),0);
    if(source.cat!=='shopping'||!(source.tags?.shop==='mall'||/\bmall\b|shopping cent(er|re)/i.test(source.name||'')||source.mallClosingHour!=null||source.tags?.mallClosingHour!=null))return 0;
    const closes=[...mallClosingHours(source,parts.day),...mallClosingHours(source,(parts.day+6)%7).filter(h=>h>=24).map(h=>h-24)];
    return Math.max(...closes.map(close=>8*Math.max(0,1-Math.abs(hour-close))),0);
  }
  function fallbackEligible(source,parts,when){
    if(source.tags?.deliveryRelevant||source.tags?.providerSignal||source.cat==='university'||source.cat==='event'||source.eventStart)return false;
    if(warehouse(source))return workerWeight(source,parts)>0;
    if(source.cat==='school'||source.cat==='k12')return schoolWeight(source,parts,when)>0&&!/pickup cluster/i.test(source.name||'');
    return ['neighborhood','nightlife','transit','hotel','medical','shopping','attraction','restaurant_district'].includes(source.cat);
  }
  function liveSignal(source,when,now=new Date()){
    const tags=source.tags||{},time=stamp(when),current=stamp(now);
    if(!tags.providerSignal||tags.deliveryRelevant||!Number.isFinite(time)||!Number.isFinite(current))return null;
    const sampled=stamp(tags.providerSampledAt||tags.sourceFetchedAt),age=current-sampled;
    if(!Number.isFinite(sampled)||age< -2*60000||age>25*60000)return null;
    if(tags.airportActivity){
      const hour=stamp(tags.flightHour);
      return Number(tags.arrivals)>0&&Number.isFinite(hour)&&time>=hour&&time<hour+3600000?'airport_activity':null;
    }
    // Ordinary prices and historic screenshots are not current hot spots.
    return Number(tags.uberSurgeMultiplier)>1&&Math.abs(time-sampled)<=25*60000?'pricing_proxy':null;
  }
  function candidatesForHour(sources,when,parts,now=new Date()){
    const events=sources.filter(source=>eventPhase(source,when,now)).map(source=>({...source,routeBasis:'verified_event',routeEventPhase:eventPhase(source,when,now)}));
    const live=sources.filter(source=>liveSignal(source,when,now)).map(source=>({...source,routeBasis:'live_signal',routeSignalType:liveSignal(source,when,now)}));
    const general=sources.filter(source=>fallbackEligible(source,parts,when)).map(source=>({...source,routeBasis:'general_area'}));
    return {events,live,general};
  }
  function selectRanked(ranked){
    // Apply after geographic/economic ranking: an unreachable event must not
    // suppress local fallback. Never pad an evidence-backed list with history.
    const evidence=ranked.filter(source=>['verified_event','live_signal'].includes(source.routeBasis));
    if(evidence.length){const current=evidence.filter(s=>s.routeDemand==null||s.routeDemand>0);return [...current.filter(s=>s.routeBasis==='verified_event'),...current.filter(s=>s.routeBasis==='live_signal')];}
    // Six modeled points is the route hot-spot floor, not a live-demand claim.
    return ranked.filter(source=>source.routeBasis==='general_area'&&Number(source.routeDemand??source.score)>=6);
  }
  // Large events justify a longer drive. Size comes from published attendance,
  // a professional league scoreboard, or a stadium/arena venue.
  const PRO=/^(NFL|MLB|NBA|NHL|MLS|WNBA|NWSL)$/;
  const MAJOR_VENUE=/m\s*&?\s*t bank stadium|camden yards|oriole park|cfg bank arena|capital one arena|nationals park|northwest stadium|fedex ?field|audi field|secu stadium|xfinity center|navy[- ]marine corps|hughes memorial stadium|johnny unitas stadium|merriweather post|jiffy lube live|eaglebank arena|baltimore convention center|pier six pavilion/i;
  function eventSize(source){
    if(!source||!(source.eventStart||source.cat==='event'))return{major:false,bonus:0};
    const impact=eventImpact(source),league=source.tags?.league||source.league||'',venue=String(source.venue||'')+' '+String(source.name||'');
    if(impact.attendance!=null)return{major:impact.attendance>=10000,bonus:Math.min(14,5*Math.log10(1+impact.attendance/1000))};
    if(PRO.test(league))return{major:true,bonus:8};
    if(MAJOR_VENUE.test(venue))return{major:true,bonus:6};
    if(/^(College football|NCAA)/.test(league))return{major:false,bonus:4};
    return{major:false,bonus:0};
  }
  // Crowd tier for route planning. 'mega' = stadium-scale turnout.
  const STADIUM=/m\s*&?\s*t bank stadium|camden yards|oriole park|nationals park|northwest stadium|fedex ?field|secu stadium|navy[- ]marine corps|capital one arena|cfg bank arena/i;
  function crowdTier(source){
    if(!source||!(source.eventStart||source.cat==='event'))return 'none';
    const impact=eventImpact(source),league=source.tags?.league||source.league||'',venue=String(source.venue||'')+' '+String(source.name||'');
    if(impact.attendance!=null)return impact.attendance>=15000?'mega':impact.attendance>=10000?'major':'local';
    if(/^(NFL|MLB|NBA|NHL)$/.test(league)||STADIUM.test(venue))return 'mega';
    return eventSize(source).major?'major':'local';
  }
  // Events outside the driver's home region (e.g. Washington DC / Northern
  // Virginia from Baltimore) qualify only in rare, very large cases: an NFL
  // game or a published crowd of 30,000+, during the crowd's exit window, and
  // only when no major home-region event is available in the same hour.
  function awayEligible(source){
    const impact=eventImpact(source),league=source.tags?.league||source.league||'';
    const huge=league==='NFL'||(impact.attendance!=null&&impact.attendance>=30000);
    return huge&&['exit','closing'].includes(source.routeEventPhase);
  }
  function routeEvents(events,isHome){
    if(typeof isHome!=='function')return events||[];
    const home=(events||[]).filter(e=>isHome(e.lat,e.lon));
    if(home.some(e=>crowdTier(e)!=='local'))return home;
    return [...home,...(events||[]).filter(e=>!isHome(e.lat,e.lon)&&awayEligible(e))];
  }
  return {crowdTier,awayEligible,routeEvents,eventSize,eventImpact,eventPhase,liveSignal,schoolStage,schoolWeight,warehouse,workerWeight,mallClosingHours,fallbackEligible,candidatesForHour,selectRanked};
});
