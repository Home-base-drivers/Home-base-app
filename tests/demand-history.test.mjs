import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {normalizeCampusEvents,normalizeWeather,publicRecords} from '../scripts/public-records.mjs';
const H=createRequire(import.meta.url)('../dist/homebase-demand-history.js');
test('trend compares same neighborhood across time, not zoom or null scores',()=>{const now=Date.now();const row=(area,ago,score)=>({area,observed_at:new Date(now-ago*60000).toISOString(),modeled_score:score});const result=H.compare([row('A',0,.7),row('A',5,.4),row('A',20,.3),row('B',0,null)],now);assert.equal(result.length,1);assert.ok(Math.abs(result[0].delta-.4)<.0001);assert.equal(H.compare([row('A',-1,.8)],now).length,0);});
test('unknown event end cannot create a departure peak',()=>{assert.equal(H.eventPhase({eventStart:'2026-10-03T12:00:00Z',eventEnd:null},Date.parse('2026-10-03T16:00:00Z')),'unknown_end');});
test('campus feed excludes private, undated, virtual and all-day events, never claims attendance',()=>{const event={title:'Public concert',publish_status:'published',experience:'inperson',geo:{latitude:39.39,longitude:-76.61},event_instances:[{event_instance:{id:1,start:'2026-10-03T16:00:00-04:00',end:'2026-10-03T18:00:00-04:00',num_attending:500}}]};const now=Date.parse('2026-10-03T12:00:00Z');const events=normalizeCampusEvents({events:[{event},{event:{...event,private:true}},{event:{...event,experience:'virtual'}}]},now);assert.equal(events.length,1);assert.equal(events[0].attendance,null);assert.equal(normalizeCampusEvents({events:[{event:{...event,event_instances:[{event_instance:{start:'2026-10-03',end:'2026-10-04'}}]}}]},now).length,0);});
test('missing public weather is unknown, not zero rain',()=>{assert.equal(normalizeWeather({properties:{periods:[{startTime:'2026-10-03T00:00:00Z',endTime:'2026-10-03T01:00:00Z'}]}})[0].rainProbability,null);});
test('source failures stay unavailable and do not produce invented events',async()=>{const result=await publicRecords({name:'Baltimore'},Date.now(),async()=>{throw Error('offline');});assert.equal(result.status,'unavailable');assert.deepEqual(result.events,[]);});
test('historical recurrence fades continuously within one hour of its neighborhood observation',()=>{
 const captured='2026-10-08T15:26:00-04:00',future=time=>new Date(`2026-10-15T${time}:00-04:00`);
 const peak=H.forecastFor('Towson',future('15:26'),true).strength;
 const half=H.forecastFor('Towson',future('15:56'),true).strength;
 assert.ok(peak>half&&half>0);
 assert.equal(H.forecastFor('Towson',future('16:26'),true).strength,0);
 assert.equal(H.forecastFor('Towson',future('14:26'),true).strength,0);
 assert.equal(H.forecastFor('Unrelated neighborhood',future('15:26'),true).strength,0);
 assert.equal(H.forecastFor('Towson',new Date('2026-10-16T15:26:00-04:00'),true).strength,0);
});
test('historical windows fade correctly across local midnight, retaining one independent night',()=>{
 const sample={name:'Unique midnight area',surgeMultiplier:1.8,sampledAt:'2026-10-08T23:50:00-04:00'};
 assert.equal(H.rememberSignal(sample,'Uber',Date.parse(sample.sampledAt)),true);
 const strength=time=>H.forecastFor(sample.name,new Date(time),true).strength;
 assert.ok(strength('2026-10-16T00:10:00-04:00')>0);
 assert.equal(strength('2026-10-16T00:50:00-04:00'),0);
 assert.equal(strength('2026-10-15T22:50:00-04:00'),0);
});
