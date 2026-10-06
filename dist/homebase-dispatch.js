(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HomeBaseDispatch=api;})(globalThis,function(){
'use strict';
const VERSION='dispatch-2';
const MODES=['MAX PROFIT','DIAMOND MODE','GET ME HOME','END SHIFT','AIRPORT MODE','EVENT MODE','SHORT TRIP MODE','CUSTOM TARGET'];
const PROVENANCE=['LIVE','RECENT','HISTORICAL','PREDICTED','USER-REPORTED','SCREENSHOT-DERIVED'];
const actions=['read_trips','read_earnings','read_driver_status','pause_requests','resume_requests','accept_trip','decline_trip'];
// No private driver access or execution has been verified for this deployment.
const CAPABILITIES=Object.freeze(Object.fromEntries(['Uber','Empower','Lyft'].map(platform=>[platform,Object.freeze(Object.fromEntries(actions.map(a=>[a,Object.freeze({supported:false,status:'unverified',evidence:null})])))])));
const SERVICE_AREAS=[{platform:'Empower',effectiveFrom:'2026-10-01',effectiveTo:null,markets:['Baltimore','Washington DC','Northern Virginia'],source:'USER-REPORTED',geometry:null,note:'Expansion reported by driver; exact provider service polygon unverified.'}];
const num=(n)=>typeof n==='number'&&Number.isFinite(n)?n:null;
const positive=n=>num(n)!==null&&n>=0;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const divide=(a,b)=>num(a)!==null&&num(b)!==null&&b>0?a/b:null;
const text=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
function miles(a,b){if(!a||!b||a.length!==2||b.length!==2||![...a,...b].every(Number.isFinite))return null;const r=Math.PI/180,dlat=(b[0]-a[0])*r,dlon=(b[1]-a[1])*r,k=Math.sin(dlat/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dlon/2)**2;return 3958.76*2*Math.atan2(Math.sqrt(k),Math.sqrt(1-k));}
function serviceArea(platform,when=new Date(),areas=SERVICE_AREAS){const date=new Date(when).toISOString().slice(0,10);return areas.filter(a=>a.platform===platform&&a.effectiveFrom<=date&&(!a.effectiveTo||date<a.effectiveTo)).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom))[0]||null;}
function normalizeTrip(input){
 if(!input||typeof input!=='object')throw Error('Trip must be an object.');
 const t={...input};t.platform=String(t.platform||'').trim();if(!t.platform||t.platform.length>60)throw Error('Choose a platform.');
 t.record_id=String(t.record_id||t.id||'');if(!t.record_id||t.record_id.length>128)throw Error('A stable trip ID is required.');
 t.source=t.source||'manual';if(!['screenshot','manual','csv','provider'].includes(t.source))throw Error('Invalid trip source.');
 t.completeness=t.completeness||'unknown';if(!['partial','unknown','complete'].includes(t.completeness))throw Error('Invalid completeness.');
 t.provenance=t.source==='screenshot'?'SCREENSHOT-DERIVED':t.source==='provider'?'HISTORICAL':'USER-REPORTED';
 t.confidence=num(t.confidence)??.5;if(t.confidence<0||t.confidence>1)throw Error('Confidence must be between zero and one.');
 t.request_time=t.request_time||null;if(t.request_time&&!Number.isFinite(Date.parse(t.request_time)))throw Error('Invalid trip timestamp.');if(t.request_time)t.request_time=new Date(t.request_time).toISOString();
 for(const key of ['fare','tip','bonus','toll','pickup_distance','pickup_time','trip_distance','trip_time','online_time','dead_miles','unreimbursed_tolls']){t[key]=num(t[key]);if(t[key]!==null&&(t[key]<0||t[key]>100000))throw Error('Invalid '+key);}
 for(const key of ['pickup_location','dropoff_location']){const l=t[key];if(l&&(!Array.isArray(l)||l.length!==2||!l.every(Number.isFinite)||Math.abs(l[0])>90||Math.abs(l[1])>180))throw Error('Invalid '+key);t[key]=l||null;}
 t.origin=t.origin?String(t.origin).trim().slice(0,200):null;t.destination=t.destination?String(t.destination).trim().slice(0,200):null;
 t.estimated_total_distance=positive(t.pickup_distance)&&positive(t.trip_distance)?t.pickup_distance+t.trip_distance:null;
 t.estimated_total_time=positive(t.pickup_time)&&positive(t.trip_time)?t.pickup_time+t.trip_time:null;
 t.dedup_key=duplicateKey(t);return t;
}
function duplicateKey(t){if(!t.request_time||num(t.fare)===null)return null;const origin=text(t.origin)||t.pickup_location?.map(v=>v.toFixed(4)).join(','),destination=text(t.destination)||t.dropoff_location?.map(v=>v.toFixed(4)).join(',');if(!origin||!destination)return null;return[text(t.platform),new Date(t.request_time).toISOString(),t.fare.toFixed(2),origin,destination].join('|');}
function mergeTrips(existing,incoming){
 const rows=existing.map(normalizeTrip);let added=0,duplicates=0,updated=0;
 for(const raw of incoming){
  const t=normalizeTrip(raw),i=rows.findIndex(r=>text(r.platform)===text(t.platform)&&(r.record_id===t.record_id||(r.dedup_key&&r.dedup_key===t.dedup_key)||(r.offer_id&&t.offer_id&&r.offer_id===t.offer_id)));
  if(i<0){rows.push(t);added++;continue;}
  duplicates++;const old=rows[i],rank={screenshot:0,manual:1,csv:2,provider:3};
  const higher=rank[t.source]>rank[old.source],same=rank[t.source]===rank[old.source]&&t.record_id===old.record_id;
  // A final fare/tip correction can update the same record. An offer cannot undo a completed trip.
  if((higher||same)&&!(old.status==='completed'&&t.status==='offer')){
   rows[i]=normalizeTrip({...old,...Object.fromEntries(Object.entries(t).filter(([,v])=>v!==null)),record_id:old.record_id,previous_sources:[...new Set([...(old.previous_sources||[]),old.source])].filter(s=>s!==t.source)});updated++;
  }
 }
 return{rows,added,duplicates,updated};
}
function localDay(value,timezone='America/New_York'){
 timezone=timezone||Intl.DateTimeFormat().resolvedOptions().timeZone||'America/New_York';
 const date=new Date(value);if(!Number.isFinite(+date))return null;
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(p=>[p.type,p.value]));return p.year+'-'+p.month+'-'+p.day;
}
function earningsRecords(ledger,trips,timezone='America/New_York'){
 const rows=ledger.filter(r=>!String(r.id).startsWith('dispatch:')).map(r=>({...r})),coveredRows=rows.slice();
 for(const t of trips||[]){
  if(t.status!=='completed'||num(t.fare)===null)continue;
  const day=t.request_time?localDay(t.request_time,timezone):null;
  // A platform/day summary may already include every trip. Never add its screenshot list again.
  const covered=day&&coveredRows.some(r=>r.payType==='gross'&&(text(r.platform)===text(t.platform)||['multiple','all','other'].includes(text(r.platform)))&&(r.timePrecision?localDay(r.startedAt,timezone):r.date)===day);
  if(covered)continue;
  rows.push({id:'dispatch:'+t.record_id,platform:t.platform,date:day,startedAt:t.request_time,timePrecision:!!t.request_time,earnings:t.fare+(t.tip??0)+(t.bonus??0),hours:num(t.trip_time)!==null?t.trip_time/60:null,hoursType:'active',miles:t.trip_distance,trips:1,payType:'gross',source:t.source,completeness:t.completeness,filename:'Reviewed trip'});
 }
 return rows;
}
function ledgerTotals(records,vehicle={}){
 const rows=records.filter(r=>r.payType==='gross'&&num(r.earnings)!==null),gross=rows.length?rows.reduce((s,r)=>s+r.earnings,0):null;
 const online=rows.length&&rows.every(r=>r.hoursType==='online'&&positive(r.hours))?rows.reduce((s,r)=>s+r.hours,0):null;
 const shift=rows.length&&rows.every(r=>String(r.id).startsWith('shift:')&&positive(r.shiftHours))?rows.reduce((s,r)=>s+r.shiftHours,0):null;
 const fullMiles=rows.length&&rows.every(r=>String(r.id).startsWith('shift:')&&positive(r.miles));
 const distance=fullMiles?rows.reduce((s,r)=>s+r.miles,0):null;
 const costs=fullMiles?rows.map(r=>positive(vehicle.reservePerMile)&&r.costs>0?r.costs+r.miles*vehicle.reservePerMile:vehicleCost({miles:r.miles,fuelCostPerMile:vehicle.fuelCostPerMile,reservePerMile:vehicle.reservePerMile})):[];
 const net=costs.length&&costs.every(c=>c!==null)?gross-costs.reduce((s,c)=>s+c,0):null;
 return{gross,net,totalMiles:distance,onlineHours:online,shiftHours:shift,grossOnlineHourly:divide(gross,online),netOnlineHourly:divide(net,online),grossShiftHourly:divide(gross,shift),netShiftHourly:divide(net,shift),netTotalMile:divide(net,distance),coverage:'recorded; completeness unverified'};
}
function reposition(trip,state){const costPerMile=state.costPerMile??(positive(state.vehicle?.fuelCostPerMile)&&positive(state.vehicle?.reservePerMile)?state.vehicle.fuelCostPerMile+state.vehicle.reservePerMile:null);const before=miles(state.location,state.destination),after=miles(trip.dropoff_location,state.destination);const progress=before!==null&&after!==null?before-after:null;const total=trip.estimated_total_distance;return{home_progress:progress,distance_before:before,distance_after:after,paid_miles_to_destination_percent:progress!==null&&num(trip.trip_distance)!==null&&trip.trip_distance>0?clamp(progress/trip.trip_distance)*100:null,reposition_value:progress!==null&&positive(costPerMile)?progress*costPerMile:null,total};}
function vehicleCost({miles:distance,fuelCostPerMile,reservePerMile,unreimbursedTolls=0,parking=0}){if(![distance,fuelCostPerMile,reservePerMile,unreimbursedTolls,parking].every(positive))return null;return distance*(fuelCostPerMile+reservePerMile)+unreimbursedTolls+parking;}
function goalProgress(goal,totals,now=Date.now()){const metric=goal.kind==='net'?totals.net:totals.gross;const remaining=num(goal.amount)!==null&&num(metric)!==null?Math.max(0,goal.amount-metric):null;const rate=goal.kind==='net'?totals.netOnlineHourly:totals.grossOnlineHourly;const minutes=remaining!==null&&rate>0?remaining/rate*60:null;return{remaining,eta:minutes!==null?new Date(now+minutes*60000).toISOString():null,deadline:goal.deadline||null,late:minutes!==null&&goal.deadline?now+minutes*60000>Date.parse(goal.deadline):null};}
function profitability(records,vehicle={}){
 let gross=0,activeMinutes=0,passengerMiles=0;let completeActive=true,completeMiles=true;
 const rows=records.filter(r=>r.status==='completed'&&num(r.fare)!==null);
 for(const t of rows){gross+=t.fare+(t.tip??0)+(t.bonus??0);if(num(t.trip_time)!==null)activeMinutes+=t.trip_time;else completeActive=false;if(num(t.trip_distance)!==null)passengerMiles+=t.trip_distance;else completeMiles=false;}
 // Wall-clock hours and full odometer mileage come from a shift, never from booked trips.
 const totalMiles=num(vehicle.totalMiles),onlineHours=num(vehicle.onlineHours),shiftHours=num(vehicle.shiftHours);
 const costs=vehicleCost({miles:totalMiles,fuelCostPerMile:vehicle.fuelCostPerMile,reservePerMile:vehicle.reservePerMile,unreimbursedTolls:vehicle.unreimbursedTolls??0,parking:vehicle.parking??0});
 const net=rows.length&&costs!==null?gross-costs:null;
 return{gross:rows.length?gross:null,net,passengerMiles:completeMiles?passengerMiles:null,totalMiles,activeHours:completeActive?activeMinutes/60:null,onlineHours,shiftHours,grossActiveHourly:rows.length&&completeActive?divide(gross,activeMinutes/60):null,grossOnlineHourly:rows.length?divide(gross,onlineHours):null,netOnlineHourly:divide(net,onlineHours),netShiftHourly:divide(net,shiftHours),grossPassengerMile:rows.length&&completeMiles?divide(gross,passengerMiles):null,grossTotalMile:rows.length?divide(gross,totalMiles):null,netTotalMile:divide(net,totalMiles),coverage:rows.some(r=>r.completeness!=='complete')?'partial/unknown':'complete'};
}
function opportunity({hourlyRate,waitMinutes,moveMinutes,moveCost,nextZoneHourlyRate,expectedWaitBenefit}){const waitCost=positive(hourlyRate)&&positive(waitMinutes)?hourlyRate*waitMinutes/60:null;const moveOpportunityCost=positive(hourlyRate)&&positive(moveMinutes)?hourlyRate*moveMinutes/60:null;const threshold=positive(hourlyRate)&&hourlyRate>0&&positive(moveCost)&&positive(moveMinutes)&&positive(expectedWaitBenefit)?clamp((moveCost+moveOpportunityCost+expectedWaitBenefit)/hourlyRate*60,1,30):null;return{wait_value:waitCost!==null?-waitCost:null,wait_cost:waitCost,reposition_cost:moveOpportunityCost!==null&&positive(moveCost)?moveCost+moveOpportunityCost:null,next_zone_expected_value:positive(nextZoneHourlyRate)?nextZoneHourlyRate:null,wait_threshold_minutes:threshold};}
function scoreTrip(raw,state={},weights={}){
 state={...state,fuelCostPerMile:state.fuelCostPerMile??state.vehicle?.fuelCostPerMile,reservePerMile:state.reservePerMile??state.vehicle?.reservePerMile};
 const t=normalizeTrip(raw),r=reposition(t,state),missing=[];
 const fare=t.fare;const minutes=t.estimated_total_time,distance=t.estimated_total_distance;
 if(fare===null)missing.push('fare');if(minutes===null||minutes<=0)missing.push('pickup and trip time');if(distance===null)missing.push('pickup and passenger miles');
 const cost=vehicleCost({miles:distance,fuelCostPerMile:state.fuelCostPerMile,reservePerMile:state.reservePerMile,unreimbursedTolls:t.unreimbursed_tolls??0});
 if(cost===null)missing.push('vehicle cost');const net=fare!==null&&cost!==null?fare-cost:null;
 const active=divide(fare,t.trip_time!==null?t.trip_time/60:null),offerHourly=divide(net,minutes!==null?minutes/60:null);
 const onlineEstimate=num(t.expected_next_wait)!==null&&minutes!==null?divide(net,(minutes+t.expected_next_wait)/60):null;
 const factors=[];const add=(key,value,why)=>{factors.push({key,value,why});};
 const w={profit:1,destination:.35,reposition:.7,goal:.4,next:.2,deadhead:.5,opportunity:.4,...weights};
 if(offerHourly!==null)add('profitability',offerHourly*w.profit,'Estimated net per pickup + passenger hour');
 if(num(t.destination_demand)!==null)add('destination',clamp(t.destination_demand)*10*w.destination,'Predicted drop-off demand');
 if(r.home_progress!==null){const goalMode=['GET ME HOME','END SHIFT'].includes(state.mode);add('reposition',clamp(r.home_progress,-40,40)*w.reposition*(goalMode?3:1),'Straight-line miles toward your destination; road progress may differ');}
 if(num(t.next_trip_value)!==null)add('next',t.next_trip_value*w.next,'Estimated next-trip contribution');
 if(num(t.deadhead_probability)!==null&&positive(state.costPerMile)&&positive(t.return_miles))add('deadhead',-clamp(t.deadhead_probability)*t.return_miles*state.costPerMile*w.deadhead,'Expected return mileage cost');
 if(positive(state.marketHourly)&&minutes!==null)add('opportunity',-state.marketHourly*minutes/60*w.opportunity,'Expected earnings forgone during this offer');
 if(positive(state.minimumHourly)&&offerHourly!==null&&offerHourly<state.minimumHourly)add('minimum_hourly',-20,'Below configured minimum net hourly');
 if(positive(state.minimumMile)&&net!==null&&distance>0&&net/distance<state.minimumMile)add('minimum_mile',-20,'Below configured minimum net per total mile');
 if(positive(t.traffic_delay)&&positive(state.marketHourly))add('traffic',-trafficCost(t.traffic_delay,state.marketHourly),'Traffic opportunity cost');
 if(state.mode==='EVENT MODE'&&t.event_verified===true)add('event',8,'Verified event demand at drop-off');
 if(state.mode==='AIRPORT MODE'&&t.airport_queue_minutes!==undefined&&t.airport_queue_minutes===null)add('airport',-12,'Airport queue is unknown');
 if(state.mode==='SHORT TRIP MODE'&&minutes!==null)add('duration',-minutes*.3,'Preference for shorter trips');
 if(positive(state.goal?.amount)&&fare!==null)add('goal',Math.min(fare,state.goal.amount)*w.goal,'Revenue target progress');
 if(positive(state.maxDistance)&&r.distance_after!==null&&r.distance_after>state.maxDistance)add('radius',-(r.distance_after-state.maxDistance)*2,'Drop-off exceeds preferred distance from base');
 if(state.goal?.deadline&&minutes!==null&&positive(state.homeTravelMinutes)&&Date.now()+(minutes+state.homeTravelMinutes)*60000>Date.parse(state.goal.deadline))add('deadline',-30,'Trip risks missing your home-arrival deadline');
 const score=missing.length?null:clamp(50+factors.reduce((s,f)=>s+f.value,0),0,100);
 const diamond=(state.mode==='DIAMOND MODE'||state.diamond===true)&&t.platform.toLowerCase()==='uber';
 return{trip:t,trip_score:score,profit_score:offerHourly,reposition_score:r.reposition_value,...r,net_estimate:net,gross_active_hourly:active,net_offer_hourly:offerHourly,net_online_hourly_estimate:onlineEstimate,dollars_passenger_mile:divide(fare,t.trip_distance),dollars_total_mile:divide(fare,distance),factors,missing,confidence:Math.round(t.confidence*(1-missing.length/5)*100),confidence_type:'input completeness heuristic; not calibrated probability',action:diamond?'acceptance_strategy':score===null?'verify_offer':score>=60?'consider_accept':'consider_skip',voice:diamond?'Diamond strategy: preserve acceptance. If this trip pulls you away, finish it, then use paid repositioning.':score===null?'I need '+missing.join(', ')+' before I can score that offer.':r.home_progress>0?'This trip moves you '+Math.round(r.home_progress)+' miles toward your destination. Estimated net is '+Math.round(offerHourly)+' dollars per pickup and trip hour.':'Estimated net is '+Math.round(offerHourly)+' dollars per pickup and trip hour. Check the drop-off before deciding.',provenance:'PREDICTED'};
}
function demandZones(zones,state){return(zones||[]).filter(z=>positive(z.score)&&z.score>0&&z.location).map(z=>{const distance=miles(state.location,z.location);return{...z,distance,planning_score:z.score*100-(distance??50)*1.5};}).filter(z=>z.distance!==null&&z.distance<=(state.radiusMiles||25)).sort((a,b)=>b.planning_score-a.planning_score);}
function recurringTripSignal(trips,location,when=new Date(),radiusMiles=2){
 const parts=date=>Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'numeric',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));const target=parts(new Date(when)),dates=new Set();
 for(const t of trips||[]){if(t.status!=='completed'||!t.request_time||!t.dropoff_location)continue;const stamp=Date.parse(t.request_time),age=+new Date(when)-stamp;if(!Number.isFinite(stamp)||age<0||age>120*86400000)continue;const p=parts(new Date(stamp));if(p.weekday!==target.weekday||Math.abs(Number(p.hour)-Number(target.hour))>1||miles(location,t.dropoff_location)>radiusMiles)continue;dates.add(new Date(stamp).toLocaleDateString('en-CA',{timeZone:'America/New_York'}));}
 return{distinctDates:dates.size,boost:dates.size>=3?Math.min(.08,(dates.size-2)*.02):0,source:'personal completed-trip recurrence; not total market demand'};
}
function trafficCost(extraMinutes,rate){return positive(extraMinutes)&&positive(rate)?extraMinutes*rate/60:null;}
function recommend(state,context={}){
 const why=[],age=Date.now()-Date.parse(context.locationAt),fresh=context.locationAt&&Number.isFinite(age)&&age>=0&&age<120000;
 let action='WAIT',platform=null,voice='Home Base. I need a fresh location before advising where to drive.';
 if(state.paused)return{action:'WAIT',platform:null,voice:'Copy. Recommendations paused.',factors:['Driver paused recommendations'],confidence:100,provenance:'USER-REPORTED',execution:'advisory',model_version:VERSION};
 if(fresh&&state.location){
  const home=miles(state.location,state.destination),recovering=state.recovery?.active===true&&state.paidRepositioning!==false,returning=['GET ME HOME','END SHIFT'].includes(state.mode)||recovering;
  if(positive(state.maxShiftHours)&&positive(context.shiftHours)&&context.shiftHours>=state.maxShiftHours){action='END SHIFT';voice='Your shift-length limit is reached. Finish safely and head toward your destination.';why.push('Maximum shift hours reached');}
  else if(context.activeTrip){action='WAIT';voice='Finish the current trip. I will reassess after drop-off.';why.push('A passenger trip is in progress');}
  else if(returning&&!state.destination){voice='Set your Home, Work or custom destination while parked.';why.push('Destination is missing');}
  else if(returning&&home!==null&&home<.5){action='END SHIFT';voice='You are near your destination. Ready to end the shift.';why.push('Within half a mile of selected destination');}
  else if(state.mode==='AIRPORT MODE'){action=context.airport?.queueMinutes!=null&&context.airport?.expectedNetHourly>state.minimumHourly?'AIRPORT':'WAIT';voice=action==='AIRPORT'?'Airport estimates clear your minimum. Verify the queue in your driver app.':'Airport queue or net return is unverified. I do not recommend entering yet.';why.push('Flight schedules alone do not establish queue length or ride demand');}
  else if(state.mode==='EVENT MODE'){const e=context.events?.find(e=>e.verified&&Date.parse(e.start)>Date.now()-90*60000&&Date.parse(e.start)<Date.now()+90*60000);if(e){action='EVENT';voice='Verified event near '+e.name+'. Compare pickup access before repositioning.';why.push('Verified event within the arrival/exit window');}else{voice='No verified event in the current window. Hold for a better signal.';why.push('No verified current event');}}
  else if(returning&&home>1&&context.platforms?.includes('Empower')){platform='Empower';action='UBER OFF / EMPOWER ON';voice='You are about '+Math.round(home)+' straight-line miles from your destination. Look for Empower trips heading that way. Pause Uber manually when permitted.';why.push('Paid repositioning preference','Selective destination control','Distance from destination: '+Math.round(home)+' miles');if(recovering)why.push('Previous trip pulled away from base; preserve Diamond by repositioning before resuming Uber');const o=opportunity(context.opportunity||{});if(o.wait_threshold_minutes!==null&&(context.waitMinutes??0)>=o.wait_threshold_minutes){action='REPOSITION';voice='Waiting now costs more than the modeled reposition. Move toward your destination and reassess.';why.push('Calculated wait threshold: '+o.wait_threshold_minutes.toFixed(1)+' minutes');}}
  else if(returning){action='RETURN HOME';voice='Look for paid trips toward your destination in an available app. Selective Empower availability is unverified here.';why.push('Destination strategy','Platform eligibility must be verified in the driver app');}
  else if(state.mode==='DIAMOND MODE'){platform='Uber';action='UBER ON / EMPOWER OFF';voice='Diamond strategy. Check positioning before making Uber active. Preserve acceptance, then reassess after drop-off.';why.push('Driver values Uber Diamond acceptance');}
  else{const rates=(context.rates||[]).filter(x=>positive(x.netHourly)).sort((a,b)=>b.netHourly-a.netHourly);if(rates.length){platform=rates[0].platform;action=platform==='Uber'?'UBER ON / EMPOWER OFF':platform==='Empower'?'UBER OFF / EMPOWER ON':'BOTH AVAILABLE';voice=platform+' has the strongest recorded net pace. Verify current offers.';why.push('Comparable driver net online-hour history');}else{action='BOTH AVAILABLE';voice='Compare your available apps. There is not enough net online-hour history to pick a winner.';why.push('Booked-hour earnings are not comparable to online-hour returns');}
    const zone=demandZones(context.zones,state)[0];if(zone&&action==='BOTH AVAILABLE'){action='REPOSITION';voice='The demand model favors '+zone.name+'. Look for paid miles toward that zone before driving empty.';why.push('Predicted neighborhood opportunity: '+zone.name,'Time, weather, events and historical observations from the existing demand model');}
  }
 }else why.push('GPS missing or stale');
 return{action,platform,voice,factors:why,confidence:fresh?Math.min(65,35+why.length*5):0,confidence_type:'evidence heuristic; not calibrated probability',provenance:'PREDICTED',execution:'advisory',model_version:VERSION};
}
function learn(outcomes){const valid=outcomes.filter(o=>o&&o.followed===true&&num(o.net)!==null&&positive(o.minutes)&&o.minutes>0&&positive(o.miles));if(valid.length<5)return{sampleCount:valid.length,weights:{},status:'insufficient outcomes'};const hours=valid.reduce((s,o)=>s+o.minutes/60,0),net=valid.reduce((s,o)=>s+o.net,0);return{sampleCount:valid.length,netHourly:net/hours,weights:{profit:clamp(net/hours/30,.8,1.2)},status:'bounded personal calibration; observational, not causal'};}
function feedStatus(feeds,now=Date.now()){const rows=feeds.map(f=>{const age=now-Date.parse(f.observedAt);return{...f,status:f.provenance==='LIVE'&&age>=0&&age<(f.maxAgeMs||720000)?'live':f.observedAt&&Number.isFinite(age)&&age>=0&&age<86400000?'recent':'unavailable'};});const required=rows.filter(f=>f.required!==false),live=required.filter(f=>f.status==='live').length;return{color:live&&live===required.length?'green':rows.some(f=>['live','recent'].includes(f.status))?'yellow':'gray',rows};}
function parseCommand(raw){const c=text(raw).replace(/^(home base|homebase)[, .]*/,'');if(/should i take|should i accept|take this|score this/.test(c))return{type:'offer_query'};const radius=c.match(/(?:stay )?within (\d+(?:\.\d+)?) miles(?: of (.+))?/);if(radius)return{type:'radius',value:Number(radius[1]),anchor:radius[2]||null};const modes={'profit':'MAX PROFIT','diamond':'DIAMOND MODE','airport':'AIRPORT MODE','event':'EVENT MODE','short trip':'SHORT TRIP MODE','get me home':'GET ME HOME','take me home':'GET ME HOME','end shift':'END SHIFT'};if(c.includes('airport')&&!c.includes('mode'))return{type:'airport_query'};const minimum=c.match(/(?:\$)?(\d+(?:\.\d+)?)\s*(?:\/|per\s*)(hour|hr|mile)/);if(minimum)return{type:'minimum',value:Number(minimum[1]),metric:minimum[2]==='mile'?'mile':'hour'};const homeBy=c.match(/home by (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);if(homeBy){let hour=Number(homeBy[1]);if(homeBy[3]==='pm'&&hour<12)hour+=12;if(homeBy[3]==='am'&&hour===12)hour=0;return{type:'deadline',hour,minute:Number(homeBy[2]||0)};}const amount=c.match(/(?:\$|dollars?\s*)(\d+(?:\.\d+)?)/)||c.match(/(\d+(?:\.\d+)?)\s*(?:dollars|more)/);if(amount)return{type:'target',amount:Number(amount[1]),additional:c.includes('more'),thenHome:c.includes('home'),midnight:c.includes('midnight'),kind:c.includes('net')?'net':'revenue',period:c.includes('week')?'week':'day'};for(const [phrase,mode] of Object.entries(modes))if(c.includes(phrase))return{type:'mode',mode};if(/^(why|repeat|ignore|do it|resume|go ahead|copy)$/.test(c))return{type:c};if(c.includes('pause recommendations'))return{type:'pause'};if(c.includes('quiet'))return{type:'quiet',minutes:clamp(Number(c.match(/\d+/)?.[0]||30),1,180)};if(/total|made|much more/.test(c))return{type:'earnings',remaining:c.includes('more')};if(/plan|go|stay out|downtown|airport/.test(c))return{type:'plan'};return{type:'unknown'};}
class PlatformAdapter{constructor(platform,registry=CAPABILITIES,executor=null){this.platform=platform;this.registry=registry;this.executor=executor;}async execute(action,payload){const c=this.registry[this.platform]?.[action];if(!c?.supported||!c.evidence||!this.executor)return{executed:false,status:'advisory',message:'Use '+this.platform+' to '+action.replace(/_/g,' ')+'. Home Base did not execute it.'};try{const result=await this.executor(action,payload);return result?.confirmed===true?{executed:true,status:'confirmed',receipt:result.receipt}:{executed:false,status:'unconfirmed',message:'Platform did not confirm the action.'};}catch{return{executed:false,status:'failed',message:'Platform action failed. Check your driver app.'};}}}
const DriverState={create:overrides=>({mode:'MAX PROFIT',paused:false,paidRepositioning:true,destination:null,location:null,goal:{},...overrides})};
// URL handoff only changes Home Base's own strategy. Arbitrary commands and platform actions are rejected.
function shortcutCommand(value){return{'get-me-home':{type:'mode',mode:'GET ME HOME'},diamond:{type:'mode',mode:'DIAMOND MODE'},profit:{type:'mode',mode:'MAX PROFIT'},pause:{type:'pause'},resume:{type:'resume'}}[value]||null;}
return{VERSION,MODES,PROVENANCE,CAPABILITIES,SERVICE_AREAS,miles,normalizeTrip,duplicateKey,mergeTrips,earningsRecords,ledgerTotals,localDay,shortcutCommand,reposition,vehicleCost,goalProgress,profitability,opportunity,scoreTrip,recommend,learn,feedStatus,parseCommand,recurringTripSignal,serviceArea,PlatformAdapter,DriverState,
 DemandEngine:{rank:demandZones},EventEngine:{current:events=>events.filter(e=>e.verified)},AirportEngine:{evaluate:airport=>({queueVerified:positive(airport?.queueMinutes),activityIsProxy:true})},WeatherEngine:{trafficCost},NotificationEngine:{message:rec=>rec.voice},
 TripIngestion:{normalize:normalizeTrip,merge:mergeTrips},TripScoringEngine:{score:scoreTrip},RepositionEngine:{evaluate:reposition},GoalEngine:{progress:goalProgress},OpportunityCostEngine:{evaluate:opportunity},VehicleCostEngine:{estimate:vehicleCost},RecommendationEngine:{recommend},DriverLearningEngine:{learn},UberAdapter:class extends PlatformAdapter{constructor(){super('Uber');}},EmpowerAdapter:class extends PlatformAdapter{constructor(){super('Empower');}}};
});
