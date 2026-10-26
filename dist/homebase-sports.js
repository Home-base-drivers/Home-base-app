/* Public scoreboards report game state; Home Base never guesses an end time.
   A game's departure window opens only once a scoreboard has been observed
   live and then final, bounded by the two observation times. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HomeBaseSports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const MINUTE=60000,HOUR=60*MINUTE;
  // Leagues with ESPN public scoreboards. finalPeriod is the period in which a
  // game is observed to be in its closing stretch (overtime included).
  const ESPN_LEAGUES=[
    {sport:'football',league:'nfl',label:'NFL',finalPeriod:4},
    {sport:'basketball',league:'nba',label:'NBA',finalPeriod:4},
    {sport:'basketball',league:'wnba',label:'WNBA',finalPeriod:4},
    {sport:'hockey',league:'nhl',label:'NHL',finalPeriod:3},
    {sport:'soccer',league:'usa.1',label:'MLS',finalPeriod:2,finalMinute:75},
    {sport:'soccer',league:'usa.nwsl',label:'NWSL',finalPeriod:2,finalMinute:75},
    {sport:'basketball',league:'mens-college-basketball',label:'NCAA men’s basketball',finalPeriod:2},
    {sport:'basketball',league:'womens-college-basketball',label:'NCAA women’s basketball',finalPeriod:4},
    {sport:'football',league:'college-football',label:'College football',finalPeriod:4}
  ];

  // Known pro and college venues from config/provider-markets.json (sportsVenues),
  // so a game is placed at its real venue and never matched to a same-named local place.
  // [match tokens, name, city, lat, lon]
  const VENUES=[["m t bank stadium","M&T Bank Stadium","Baltimore",39.278,-76.6227],["cfg bank arena","CFG Bank Arena","Baltimore",39.28861,-76.61889],["camden yards","Oriole Park at Camden Yards","Baltimore",39.2838,-76.6217],["secu arena","SECU Arena","Towson",39.387361,-76.617083],["chesapeake employers insurance arena","Chesapeake Employers Insurance Arena","Baltimore",39.2523419,-76.707431],["navy marine corps memorial stadium","Navy-Marine Corps Memorial Stadium","Annapolis",38.985,-76.507],["secu stadium","SECU Stadium","College Park",38.99028,-76.94722],["xfinity center","Xfinity Center","College Park",38.99528,-76.94139],["metlife stadium","MetLife Stadium","East Rutherford",40.81361,-74.07444],["prudential center","Prudential Center","Newark",40.73361,-74.17111],["sports illustrated stadium","Sports Illustrated Stadium","Harrison",40.73667,-74.15028],["madison square garden","Madison Square Garden","New York",40.75056,-73.99361],["barclays center","Barclays Center","Brooklyn",40.68266,-73.97523],["yankee stadium","Yankee Stadium","Bronx",40.82917,-73.92639],["citi field","Citi Field","Flushing",40.75694,-73.84583],["ubs arena","UBS Arena","Elmont",40.71179,-73.72604],["capital one arena","Capital One Arena","Washington",38.89806,-77.02083],["audi field","Audi Field","Washington",38.868411,-77.012869],["northwest stadium","Northwest Stadium","Landover",38.90778,-76.86444],["kaseya center","Kaseya Center","Miami",25.7814,-80.187],["loandepot park","loanDepot park","Miami",25.7781,-80.2197],["hard rock stadium","Hard Rock Stadium","Miami Gardens",25.958,-80.2389]]
  const token=v=>String(v||'').toLowerCase().replace(/&/g,' ').replace(/[^a-z0-9]+/g,' ').trim()
  function venuePlace(venue){const name=token(venue);if(!name)return null;const hit=VENUES.find(v=>name.includes(v[0]));return hit?{name:hit[1],city:hit[2],lat:hit[3],lon:hit[4]}:null}

  const CANCELLED=/postpon|cancel|suspend|delay|forfeit/i;
  function espnUrl(entry,date){return 'https://site.api.espn.com/apis/site/v2/sports/'+entry.sport+'/'+entry.league+'/scoreboard?dates='+date;}
  function mlbUrl(date){return 'https://statsapi.mlb.com/api/v1/schedule?sportId=1&date='+date+'&hydrate=venue(location),linescore';}
  function ymd(date,timeZone,separator=''){
    let parts;
    try{parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timeZone||undefined,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));}
    catch{parts={year:String(date.getFullYear()),month:String(date.getMonth()+1).padStart(2,'0'),day:String(date.getDate()).padStart(2,'0')};}
    return [parts.year,parts.month,parts.day].join(separator);
  }
  // Late games run past midnight, so early-morning checks include yesterday.
  function scoreboardDates(now=new Date(),timeZone,separator=''){
    const today=ymd(now,timeZone,separator),earlier=ymd(new Date(now.getTime()-4*HOUR),timeZone,separator);
    return earlier===today?[today]:[earlier,today];
  }
  // Today plus the next two days (and the late-night tail of yesterday): games are stored
  // once per day for three days ahead instead of being re-fetched on every refresh.
  function upcomingDates(now=new Date(),timeZone,separator='',days=3){
    const out=new Set(scoreboardDates(now,timeZone,separator));
    for(let d=1;d<days;d++)out.add(ymd(new Date(now.getTime()+d*24*HOUR),timeZone,separator));
    return [...out];
  }
  function minuteOf(clock){const m=/^(\d{1,3})/.exec(String(clock||''));return m?Number(m[1]):NaN;}
  function espnGame(event,entry,observedAt=Date.now()){
    const competition=event&&Array.isArray(event.competitions)?event.competitions[0]:null,type=event?.status?.type||competition?.status?.type||{};
    const start=Date.parse(event?.date||competition?.date||'');
    if(!competition||!event.id||!Number.isFinite(start))return null;
    const state=String(type.state||'');
    // ESPN reports postponed/canceled games as "post" without completion.
    if(CANCELLED.test(String(type.name||'')+' '+String(type.description||'')+' '+String(type.detail||''))||(state==='post'&&type.completed!==true))return null;
    if(!['pre','in','post'].includes(state))return null;
    const period=Number(event.status?.period??competition.status?.period)||0,clock=String(event.status?.displayClock??competition.status?.displayClock??'');
    const closing=state==='in'&&(entry.finalMinute?period>=entry.finalPeriod&&(minuteOf(clock)>=entry.finalMinute||period>entry.finalPeriod):period>=entry.finalPeriod);
    const venue=competition.venue||{};
    return{id:'espn:'+entry.league+':'+event.id,name:String(event.shortName||event.name||'Game').slice(0,140),league:entry.label,venue:String(venue.fullName||'').slice(0,140),city:String(venue.address?.city||''),region:String(venue.address?.state||''),eventStart:new Date(start).toISOString(),state:state==='in'?'live':state==='post'?'final':'scheduled',closing,gameDetail:String(type.shortDetail||type.detail||'').slice(0,60),observedAt:new Date(observedAt).toISOString(),source:'ESPN public scoreboard'};
  }
  function mlbGame(game,observedAt=Date.now()){
    const start=Date.parse(game?.gameDate||''),status=game?.status||{},detailed=String(status.detailedState||''),abstract=String(status.abstractGameState||'');
    if(!game?.gamePk||!Number.isFinite(start)||CANCELLED.test(detailed))return null;
    const coords=game.venue?.location?.defaultCoordinates,lat=Number(coords?.latitude),lon=Number(coords?.longitude);
    if(coords?.latitude==null||coords?.longitude==null||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return null;
    const state=abstract==='Live'?'live':abstract==='Final'?'final':abstract==='Preview'?'scheduled':null;
    if(!state)return null;
    const inning=Number(game.linescore?.currentInning)||0,half=String(game.linescore?.inningState||game.linescore?.inningHalf||'');
    const away=game.teams?.away?.team?.name||'Away',home=game.teams?.home?.team?.name||'Home';
    return{id:'mlb:'+game.gamePk,name:(away+' at '+home).slice(0,140),league:'MLB',venue:String(game.venue?.name||'').slice(0,140),city:'',region:'',lat,lon,eventStart:new Date(start).toISOString(),state,closing:state==='live'&&inning>=8,gameDetail:state==='live'&&inning?(half?half+' ':'')+inning+(inning===1?'st':inning===2?'nd':inning===3?'rd':'th'):detailed.slice(0,60),observedAt:new Date(observedAt).toISOString(),source:'MLB Stats API'};
  }
  /* Combine one scoreboard observation with the previous record for the same
     game. eventEnd exists only when the game was seen live and then final; it
     is the midpoint of that interval, with the interval kept for disclosure. */
  function trackGame(game,prior,maxGapMs=45*MINUTE){
    if(!game)return null;
    const observed=Date.parse(game.observedAt),row={...game,eventEnd:null,endObservedAfter:null,endObservedBy:null,lastLiveAt:game.state==='live'?game.observedAt:null};
    if(prior&&prior.id===game.id){
      if(prior.state==='live'&&!row.lastLiveAt)row.lastLiveAt=prior.lastLiveAt||prior.observedAt;
      else if(!row.lastLiveAt&&prior.lastLiveAt)row.lastLiveAt=prior.lastLiveAt;
      if(prior.eventEnd){row.eventEnd=prior.eventEnd;row.endObservedAfter=prior.endObservedAfter;row.endObservedBy=prior.endObservedBy;}
    }
    if(game.state==='final'&&!row.eventEnd&&row.lastLiveAt){
      const after=Date.parse(row.lastLiveAt);
      if(Number.isFinite(after)&&Number.isFinite(observed)&&observed>=after&&observed-after<=maxGapMs){
        row.endObservedAfter=new Date(after).toISOString();row.endObservedBy=new Date(observed).toISOString();row.eventEnd=new Date(Math.round((after+observed)/2)).toISOString();
      }
    }
    if(game.state!=='final'){row.eventEnd=null;row.endObservedAfter=null;row.endObservedBy=null;}
    return row;
  }
  // Keep rows that can still matter to a driver: upcoming within the planning
  // horizon, live now, or inside a one-hour observed departure window.
  function relevant(row,now=Date.now()){
    const start=Date.parse(row?.eventStart||''),end=Date.parse(row?.eventEnd||'');
    if(!Number.isFinite(start))return false;
    if(row.state==='final')return Number.isFinite(end)&&end+HOUR>now&&end<=now+5*MINUTE;
    if(row.state==='live')return now-Date.parse(row.observedAt)<=45*MINUTE;
    return start>=now-30*MINUTE&&start<=now+12*HOUR;
  }
  function trackAll(games,priorRows=[],now=Date.now()){
    const prior=new Map((priorRows||[]).map(r=>[r.id,r])),seen=new Set(),rows=[];
    for(const game of games){if(!game||seen.has(game.id))continue;seen.add(game.id);const row=trackGame(game,prior.get(game.id));if(row&&relevant(row,now))rows.push(row);}
    // A scoreboard outage must not erase an observed departure window or the
    // last live sighting that a later final observation is bounded by.
    for(const old of priorRows||[])if(!seen.has(old.id)&&((old.state==='final'&&old.eventEnd)||old.state==='live')&&relevant(old,now))rows.push(old);
    return rows.sort((a,b)=>a.eventStart.localeCompare(b.eventStart));
  }
  // Freshest scoreboard state wins; an observed end time is never discarded.
  function mergeObservations(a,b){
    if(!a)return b;if(!b)return a;
    const newer=Date.parse(b.tags?.observedAt||b.observedAt||0)>Date.parse(a.tags?.observedAt||a.observedAt||0)?b:a,older=newer===a?b:a;
    const end=newer.eventEnd||older.eventEnd;
    return{...older,...newer,eventEnd:end,tags:{...(older.tags||{}),...(newer.tags||{}),...(older.tags?.endObservedBy&&!newer.tags?.endObservedBy?{endObservedAfter:older.tags.endObservedAfter,endObservedBy:older.tags.endObservedBy}:{})}};
  }
  function describe(row){
    if(row.state==='final'&&row.eventEnd)return 'Final · game ended between '+row.endObservedAfter+' and '+row.endObservedBy;
    if(row.closing)return 'Closing stretch · '+(row.gameDetail||'final period');
    if(row.state==='live')return 'Live · '+(row.gameDetail||'in progress');
    return 'Scheduled';
  }
  /* Away games fill local sports bars: the crowd leaves when the game ends,
     so demand lands in the home city's bar districts, not at the stadium.
     Seen Sun Oct 11 2026 (Ravens away): purple across Baltimore after the game. */
  const WATCH_PARTY_TEAMS=[{league:'NFL',team:'BAL',label:'Ravens',districts:[
    ['Federal Hill',39.2775,-76.6135],['Fells Point',39.2825,-76.5934],['Canton',39.2817,-76.5765],
    ['Power Plant Live',39.28936,-76.60689],['Towson',39.4015,-76.6019],['Hampden',39.3305,-76.6326]]}];
  function watchParties(row){
    if(!row||!/@/.test(row.name||''))return [];
    const [away,home]=String(row.name).split('@').map(t=>t.trim().toUpperCase());
    const team=WATCH_PARTY_TEAMS.find(t=>t.league===row.league&&away===t.team&&home!==t.team);
    return team?team.districts.map(([name,lat,lon])=>({name,lat,lon,team:team.label})):[];
  }
  return{upcomingDates,VENUES,venuePlace,ESPN_LEAGUES,WATCH_PARTY_TEAMS,watchParties,espnUrl,mlbUrl,scoreboardDates,espnGame,mlbGame,trackGame,trackAll,relevant,mergeObservations,describe};
});
