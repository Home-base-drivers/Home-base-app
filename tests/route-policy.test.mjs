import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),P=require('../dist/homebase-route-policy.js'),R=require('../dist/homebase-planner.js');
const at=value=>new Date(`2026-10-06T${value}:00-04:00`),origin=[39.29,-76.61];
const event={name:'Verified concert',cat:'event',lat:39.31,lon:-76.61,eventStart:at('12:00'),eventEnd:at('14:00'),tags:{providerEvent:true,source:'official calendar'}};
const area={name:'Neighborhood',cat:'neighborhood',lat:39.29,lon:-76.61};
function plan(sources,when=at('11:00'),parts={day:2,hour:11},radiusMiles=25){const e=P.candidatesForHour(sources,when,parts,at('11:00'));return P.selectRanked(R.rankCandidates([...e.events,...e.live,...e.general].map(s=>({...s,score:s.routeBasis==='verified_event'?3:40})),{origin,radiusMiles,hourlyRate:30,costPerMile:.3}));}
test('dated event hot spots exclude every historical-only area in applicable hours',()=>{
  for(const [hour,phase] of [['11:00','arrival'],['14:30','exit']]){const result=plan([event,area],at(hour));assert.equal(result[0].name,event.name);assert.equal(result[0].routeEventPhase,phase);assert.equal(result.length,1);}
});
test('fresh elevated provider prices suppress historical destinations without becoming future surge',()=>{
  const live={...area,name:'Current price proxy',tags:{providerSignal:true,uberSurgeMultiplier:1.5,providerSampledAt:at('10:55').toISOString()}};
  assert.deepEqual(plan([live,area]).map(s=>s.routeBasis),['live_signal']);
  assert.deepEqual(plan([live,event,area]).map(s=>s.routeBasis),['verified_event','live_signal']);
  for(const tags of [{...live.tags,providerSampledAt:at('09:00').toISOString()},{...live.tags,uberSurgeMultiplier:1},{providerSignal:true,uberSurgeMultiplier:2},{providerSignal:true,historicalSurgeMultiplier:2}])assert.deepEqual(plan([{...live,tags},area]).map(s=>s.name),[area.name]);
  assert.equal(P.liveSignal(live,at('13:00'),at('11:00')),null);
});
test('airport arrival activity is eligible only in its published hour and from a fresh feed',()=>{
  const airport={...area,cat:'transit',tags:{providerSignal:true,airportActivity:true,flightHour:at('11:00').toISOString(),arrivals:4,sourceFetchedAt:at('10:55').toISOString()}};
  assert.equal(P.liveSignal(airport,at('11:30'),at('11:00')),'airport_activity');
  assert.equal(P.liveSignal(airport,at('12:00'),at('11:00')),null);
  assert.equal(P.liveSignal({...airport,tags:{...airport.tags,arrivals:0}},at('11:00'),at('11:00')),null);
  assert.equal(P.liveSignal(airport,at('11:30'),at('12:00')),null);
});
test('historical fallback contains only modeled hot spots, never weak areas or zero-demand signals',()=>{
  assert.deepEqual(P.selectRanked([{...area,routeBasis:'general_area',score:30,routeDemand:2}]),[]);
  const fallback={...area,routeBasis:'general_area',score:8,routeDemand:7};
  assert.deepEqual(P.selectRanked([{...event,routeBasis:'verified_event',score:28,routeDemand:0},fallback]),[]);
});
test('no relevant or reachable event uses general area demand',()=>{
  assert.equal(plan([event,area],at('09:00'))[0].routeBasis,'general_area');
  assert.equal(plan([event,area],at('16:00'))[0].name,area.name);
  assert.equal(plan([{...event,lat:40.29},area])[0].name,area.name);
  assert.equal(plan([area])[0].name,area.name);
});
test('routine university activity and undated venues cannot become route events',()=>{
  const campus={...area,cat:'university',name:'Morgan State University'};
  assert.deepEqual(plan([campus,{...event,eventStart:null},area]).map(s=>s.name),[area.name]);
  assert.equal(P.eventPhase({...event,tags:{}},at('11:00')),null);
  for(const invalid of [{allDay:true},{private:true},{virtual:true},{eventState:'Cancelled'},{eventState:'Postponed'},{eventStart:'2026-10-06'}])assert.equal(P.eventPhase({...event,...invalid},at('11:00')),null);
});
test('an actual public campus event remains eligible',()=>{
  assert.equal(plan([{...event,name:'Towson public performance',tags:{publicCalendar:true}},area])[0].routeBasis,'verified_event');
});
test('unknown or estimated event end never creates an exit peak or future live status',()=>{
  for(const e of [{...event,eventEnd:null},{...event,eventEndEstimated:true}]){
    assert.equal(P.eventPhase(e,at('11:00')),'arrival');assert.equal(P.eventPhase(e,at('14:30')),null);
    assert.equal(P.eventPhase({...e,eventState:'Live'},at('13:00'),at('13:00')),null);
    assert.equal(P.eventPhase({...e,eventState:'Live'},at('14:00'),at('13:00')),null);
  }
});
test('school family activity uses weekday arrival/dismissal, not all-day campus demand',()=>{
  const primary={...area,cat:'k12',name:'Elementary School'},middle={...primary,name:'Middle School'},high={...primary,name:'High School'};
  for(const hour of [7.5,14.5]){assert.ok(P.schoolWeight(primary,{day:2,hour},at('14:30'))>P.schoolWeight(high,{day:2,hour},at('14:30')));assert.equal(P.schoolWeight(primary,{day:2,hour},at('14:30')),P.schoolWeight(middle,{day:2,hour},at('14:30')));}
  for(const hour of [0,10.5,13,16.5,20])assert.equal(P.schoolWeight(primary,{day:2,hour},at('14:30')),0);
  assert.ok(P.schoolWeight(primary,{day:2,hour:15.43},at('14:30'))<P.schoolWeight(primary,{day:2,hour:14.75},at('14:30')));
  assert.ok(P.schoolWeight(primary,{day:2,hour:16},at('14:30'))<P.schoolWeight(primary,{day:2,hour:15.43},at('14:30')));
  for(const day of [0,6])assert.equal(P.schoolWeight(primary,{day,hour:14.5},at('14:30')),0);
  assert.equal(P.schoolWeight({...primary,tags:{schoolClosed:true}},{day:2,hour:14.5},at('14:30')),0);
  assert.equal(P.schoolWeight({...primary,name:'Driving school'},{day:2,hour:14.5},at('14:30')),0);
  assert.equal(plan([primary,area],at('10:30'),{day:2,hour:10.5}).some(s=>s.cat==='k12'),false);
});
test('City College is a high school, and its vacated campus is not a pickup destination',()=>{
  const school={...area,name:'Baltimore City College',cat:'k12',lat:39.3266,lon:-76.5998};
  assert.equal(P.schoolStage(school),'high');assert.equal(P.schoolWeight(school,{day:2,hour:14.5},at('14:30')),0);
});

test('event arrival and exit are each limited to one hour with no all-day pickup boost',()=>{
 for(const [hour,phase] of [['10:59',null],['11:00','arrival'],['12:30',null],['14:00','exit'],['14:59','exit'],['15:00',null]])assert.equal(P.eventPhase(event,at(hour)),phase);
 const long={...event,eventStart:at('08:00'),eventEnd:at('22:00')};
 assert.equal(P.eventPhase(long,at('15:00')),null);
 assert.equal(plan([event,area],at('12:30'))[0].routeBasis,'general_area');
});
test('local school bell times define one-hour arrival and two-hour dismissal fade',()=>{
 const school={cat:'k12',name:'Elementary',tags:{schoolStart:'09:15',schoolEnd:'15:15'}};
 const weight=hour=>P.schoolWeight(school,{day:4,hour},at('15:00'));
 assert.equal(weight(8),0);assert.ok(weight(8.75)>0);assert.equal(weight(9.25),0);
 assert.equal(weight(14.75),0);assert.ok(weight(15.25)>weight(16.25));assert.ok(weight(17)>0);assert.equal(weight(17.25),0);
});
test('warehouse shifts are local modeled windows near 3 PM and 11 PM, never all-day events',()=>{
 const source={cat:'warehouse',name:'Amazon warehouse'};
 for(const hour of [0,10,14,16,20,22])assert.equal(P.workerWeight(source,{day:4,hour}),0);
 for(const hour of [14.5,15,15.5,22.5,23,23.5])assert.ok(P.workerWeight(source,{day:4,hour})>0);
 assert.equal(P.fallbackEligible(source,{day:4,hour:12},at('12:00')),false);
 assert.equal(P.fallbackEligible(source,{day:4,hour:15},at('15:00')),true);
 assert.equal(P.eventPhase(source,at('15:00')),null);
 assert.equal(P.warehouse({cat:'shopping',name:'Amazon Fresh',tags:{operator:'Amazon',shop:'supermarket'}}),false);
});
test('mall closing pickup uses mapped weekly hours, closures and midnight rollover',()=>{
 const mall={cat:'shopping',name:'Mall',tags:{shop:'mall',opening_hours:'Mo-Sa 10:00-21:00; Su 11:00-18:00'}};
 assert.equal(P.workerWeight(mall,{day:4,hour:15}),0);assert.equal(P.workerWeight(mall,{day:4,hour:21}),8);assert.equal(P.workerWeight(mall,{day:4,hour:22}),0);
 assert.equal(P.workerWeight(mall,{day:0,hour:18}),8);assert.equal(P.workerWeight(mall,{day:0,hour:21}),0);
 for(const opening_hours of ['24/7','Mo-Fr 10:00-21:00; PH off','unknown','Su off'])assert.equal(P.workerWeight({...mall,tags:{shop:'mall',opening_hours}},{day:0,hour:21}),0);
 const overnight={...mall,tags:{shop:'mall',opening_hours:'Fr 10:00-00:30'}};
 assert.equal(P.workerWeight(overnight,{day:6,hour:.5}),8);assert.equal(P.workerWeight(overnight,{day:0,hour:.5}),0);
});
test('shipped scorer does not resurrect expired event, school or warehouse activity through rain or public POI fallback',async()=>{
 const fs=await import('node:fs'),vm=await import('node:vm'),html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
 const context={HomeBaseRoutePolicy:P,window:{},marketParts:date=>({day:date.getUTCDay(),hour:date.getUTCHours()}),rainDemandBoost:()=>3,eventScale:()=>1,surgeTrend:'steady'};
 vm.createContext(context);
 vm.runInContext(html.slice(html.indexOf('function demandWeightBase('),html.indexOf('function layeredDemandOverlap('))+html.slice(html.indexOf('function hourWeight('),html.indexOf('function eventScale(')),context);
 const when=hour=>new Date(`2026-10-08T${hour}:00Z`),score=(source,hour)=>context.demandWeightBase(source,when(hour));
 const concert={cat:'event',eventStart:when('08:00'),eventEnd:when('22:00'),tags:{publicVenue:true,publicCalendar:true}};
 assert.equal(score(concert,'12:00'),0);assert.ok(score(concert,'07:30')>0);assert.ok(score(concert,'22:30')>0);assert.equal(score(concert,'23:00'),0);
 const school={cat:'k12',name:'Elementary',tags:{publicVenue:true}};
 assert.ok(score(school,'15:30')>0);assert.equal(score(school,'16:30'),0);
 const warehouse={cat:'warehouse',name:'Warehouse',tags:{publicVenue:true}};
 assert.ok(score(warehouse,'15:00')>0);assert.equal(score(warehouse,'16:00'),0);
});
