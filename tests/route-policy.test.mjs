import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),P=require('../dist/homebase-route-policy.js'),R=require('../dist/homebase-planner.js');
const at=value=>new Date(`2026-10-06T${value}:00-04:00`),origin=[39.29,-76.61];
const event={name:'Verified concert',cat:'event',lat:39.31,lon:-76.61,eventStart:at('12:00'),eventEnd:at('14:00'),tags:{providerEvent:true,source:'official calendar'}};
const area={name:'Neighborhood',cat:'neighborhood',lat:39.29,lon:-76.61};
function plan(sources,when=at('11:00'),parts={day:2,hour:11},radiusMiles=25){const e=P.candidatesForHour(sources,when,parts,at('11:00'));return P.selectRanked(R.rankCandidates([...e.events,...e.general].map(s=>({...s,score:s.routeBasis==='verified_event'?3:40})),{origin,radiusMiles,hourlyRate:30,costPerMile:.3}));}
test('dated events outrank a closer, higher-scoring area for every applicable hour',()=>{
  for(const [hour,phase] of [['11:00','arrival'],['12:30','underway'],['14:30','exit']]){const result=plan([event,area],at(hour));assert.equal(result[0].name,event.name);assert.equal(result[0].routeEventPhase,phase);assert.equal(result.length,2);assert.equal(result[1].name,area.name);}
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
    assert.equal(P.eventPhase({...e,eventState:'Live'},at('13:00'),at('13:00')),'live');
    assert.equal(P.eventPhase({...e,eventState:'Live'},at('14:00'),at('13:00')),null);
  }
});
test('school family activity uses weekday arrival/dismissal, not all-day campus demand',()=>{
  const primary={...area,cat:'k12',name:'Elementary School'},middle={...primary,name:'Middle School'},high={...primary,name:'High School'};
  for(const hour of [7.5,14.5]){assert.ok(P.schoolWeight(primary,{day:2,hour},at('14:30'))>P.schoolWeight(high,{day:2,hour},at('14:30')));assert.equal(P.schoolWeight(primary,{day:2,hour},at('14:30')),P.schoolWeight(middle,{day:2,hour},at('14:30')));}
  for(const hour of [0,10.5,13,16,20])assert.equal(P.schoolWeight(primary,{day:2,hour},at('14:30')),0);
  for(const day of [0,6])assert.equal(P.schoolWeight(primary,{day,hour:14.5},at('14:30')),0);
  assert.equal(P.schoolWeight({...primary,tags:{schoolClosed:true}},{day:2,hour:14.5},at('14:30')),0);
  assert.equal(P.schoolWeight({...primary,name:'Driving school'},{day:2,hour:14.5},at('14:30')),0);
  assert.equal(plan([primary,area],at('10:30'),{day:2,hour:10.5}).some(s=>s.cat==='k12'),false);
});
test('City College is a high school, and its vacated campus is not a pickup destination',()=>{
  const school={...area,name:'Baltimore City College',cat:'k12',lat:39.3266,lon:-76.5998};
  assert.equal(P.schoolStage(school),'high');assert.equal(P.schoolWeight(school,{day:2,hour:14.5},at('14:30')),0);
});
