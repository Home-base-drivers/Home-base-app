/* Route eligibility sits ahead of economic ranking. POIs are not events. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HomeBaseRoutePolicy=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const stamp=value=>value instanceof Date?value.getTime():typeof value==='string'&&/T\d{2}:\d{2}/.test(value)?Date.parse(value):NaN;
  function eventPhase(source,when,now=new Date()){
    const tags=source.tags||{},start=stamp(source.eventStart),time=stamp(when),current=stamp(now);
    if(!Number.isFinite(start)||!Number.isFinite(time)||!(tags.providerEvent||tags.liveEvent||tags.publicCalendar||source.verifiedEvent===true))return null;
    if(source.allDay||source.virtual||source.private||tags.allDay||tags.virtual||tags.private||/cancel|postpon|completed|post$/i.test(String(source.eventState||source.status||'')))return null;
    const end=source.eventEndEstimated?NaN:stamp(source.eventEnd);
    if(time<start-90*60000)return null;
    if(time<start)return 'arrival';
    if(Number.isFinite(end)&&end>start)return time<=end?'underway':time<=end+90*60000?'exit':null;
    // An unknown end must never invent an exit surge or future live status.
    if(time<=start+30*60000)return 'start';
    return source.eventState==='Live'&&Number.isFinite(current)&&Math.abs(time-current)<30*60000?'live':null;
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
    const active=hour>=7&&hour<9?6:hour>=14&&hour<16?8:0;
    // Generic windows are modeled family activity, not bell schedules or rides
    // for unaccompanied minors. High schools receive a smaller prior.
    return active*(stage==='primary'||stage==='middle'?1:stage==='high'?.45:.65);
  }
  function fallbackEligible(source,parts,when){
    if(source.tags?.deliveryRelevant||source.cat==='university'||source.cat==='event'||source.eventStart)return false;
    if(source.cat==='school'||source.cat==='k12')return schoolWeight(source,parts,when)>0&&!/pickup cluster/i.test(source.name||'');
    return ['neighborhood','nightlife','transit','hotel','medical','shopping','attraction','restaurant_district'].includes(source.cat);
  }
  function candidatesForHour(sources,when,parts,now=new Date()){
    const events=sources.filter(source=>eventPhase(source,when,now)).map(source=>({...source,routeBasis:'verified_event',routeEventPhase:eventPhase(source,when,now)}));
    const general=sources.filter(source=>fallbackEligible(source,parts,when)).map(source=>({...source,routeBasis:'general_area'}));
    return {events,general};
  }
  function selectRanked(ranked){return [...ranked.filter(source=>source.routeBasis==='verified_event'),...ranked.filter(source=>source.routeBasis==='general_area')];}
  return {eventPhase,schoolStage,schoolWeight,fallbackEligible,candidatesForHour,selectRanked};
});
