import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
import {normalizeCampusEvents,normalizeWeather,publicRecords} from '../scripts/public-records.mjs';
const H=createRequire(import.meta.url)('../dist/homebase-demand-history.js');
test('trend compares same neighborhood across time, not zoom or null scores',()=>{const now=Date.now();const row=(area,ago,score)=>({area,observed_at:new Date(now-ago*60000).toISOString(),modeled_score:score});const result=H.compare([row('A',0,.7),row('A',5,.4),row('A',20,.3),row('B',0,null)],now);assert.equal(result.length,1);assert.ok(Math.abs(result[0].delta-.4)<.0001);assert.equal(H.compare([row('A',-1,.8)],now).length,0);});
test('unknown event end cannot create a departure peak',()=>{assert.equal(H.eventPhase({eventStart:'2026-10-03T12:00:00Z',eventEnd:null},Date.parse('2026-10-03T16:00:00Z')),'unknown_end');});
test('campus feed excludes private, undated, virtual and all-day events, never claims attendance',()=>{const event={title:'Public concert',publish_status:'published',experience:'inperson',geo:{latitude:39.39,longitude:-76.61},event_instances:[{event_instance:{id:1,start:'2026-10-03T16:00:00-04:00',end:'2026-10-03T18:00:00-04:00',num_attending:500}}]};const now=Date.parse('2026-10-03T12:00:00Z');const events=normalizeCampusEvents({events:[{event},{event:{...event,private:true}},{event:{...event,experience:'virtual'}}]},now);assert.equal(events.length,1);assert.equal(events[0].attendance,null);assert.equal(normalizeCampusEvents({events:[{event:{...event,event_instances:[{event_instance:{start:'2026-10-03',end:'2026-10-04'}}]}}]},now).length,0);});
test('missing public weather is unknown, not zero rain',()=>{assert.equal(normalizeWeather({properties:{periods:[{startTime:'2026-10-03T00:00:00Z',endTime:'2026-10-03T01:00:00Z'}]}})[0].rainProbability,null);});
test('source failures stay unavailable and do not produce invented events',async()=>{const result=await publicRecords({name:'Baltimore'},Date.now(),async()=>{throw Error('offline');});assert.equal(result.status,'unavailable');assert.deepEqual(result.events,[]);});
test('historical recurrence fades continuously within one hour of its neighborhood observation',()=>{
 const captured='2026-10-08T15:26:00-04:00',future=time=>new Date(`2026-10-14T${time}:00-04:00`); // Wednesday, before the Oct 15 Towson captures
 const peak=H.forecastFor('Towson',future('15:26'),true).strength;
 // Recovered Sep 25 - Oct 2 afternoons extend Towson's weekday pattern; strength still falls away from the peak.
 const half=H.forecastFor('Towson',future('16:26'),true).strength;
 assert.ok(peak>half&&half>0);
 assert.equal(H.forecastFor('Towson',future('13:30'),true).strength,0); // Oct 14 2:40 PM Towson adds a faint 2:26 PM reference; 1:30 PM stays clear.
 assert.equal(H.forecastFor('Unrelated neighborhood',future('15:26'),true).strength,0);
 // Weekday patterns carry across weekdays (Oct 8 Thu + Oct 9 Fri), never into the weekend.
 assert.ok(H.forecastFor('Towson',new Date('2026-10-14T15:16:00-04:00'),true).distinctDates>=2);
 assert.equal(H.forecastFor('Towson',new Date('2026-10-17T15:26:00-04:00'),true).strength,0);
});
test('historical windows fade correctly across local midnight, retaining one independent night',()=>{
 const sample={name:'Unique midnight area',surgeMultiplier:1.8,sampledAt:'2026-10-08T23:50:00-04:00'};
 assert.equal(H.rememberSignal(sample,'Uber',Date.parse(sample.sampledAt)),true);
 const strength=time=>H.forecastFor(sample.name,new Date(time),true).strength;
 assert.ok(strength('2026-10-16T00:10:00-04:00')>0);
 assert.equal(strength('2026-10-16T00:50:00-04:00'),0);
 assert.equal(strength('2026-10-15T22:50:00-04:00'),0);
});
test('Empower layers over Uber: combined pattern is never weaker than the Uber pattern alone',()=>{
 for(const [area,time] of [['Towson','2026-10-22T15:30:00-04:00'],['Downtown','2026-10-22T16:45:00-04:00'],['Charles Village','2026-10-22T17:07:00-04:00'],['Mondawmin','2026-10-22T07:00:00-04:00']]){
  const f=H.forecastFor(area,new Date(time),true);
  assert.ok(f.confidence>=f.platforms.uber-1e-12&&f.confidence>=f.platforms.empower-1e-12,area);
 }
 // Downtown 4:45 PM: both apps have surged there, so the layered strength beats either app alone.
 const d=H.forecastFor('Downtown',new Date('2026-10-22T16:45:00-04:00'),true);
 assert.ok(d.platforms.uber>0&&d.platforms.empower>0&&d.confidence>Math.max(d.platforms.uber,d.platforms.empower));
});
test('weekday morning Empower wave is a frequent, recent pattern; older single sightings stay faint',()=>{
 const m=H.forecastFor('Mondawmin',new Date('2026-10-22T07:00:00-04:00'),true);
 assert.ok(m.distinctDates>=5&&m.strength>=.3);
 // The same dates weigh less once they are two months old.
 const later=H.forecastFor('Mondawmin',new Date('2026-12-17T07:00:00-05:00'),true);
 assert.ok(later.strength<m.strength*.6);
});
test('recovered Aug 28 - Oct 8 originals are dated, hashed and never earlier than the earliest verified capture',()=>{
 const rows=H.screenshotRecords?H.screenshotRecords():null;
 const src=require('node:fs').readFileSync(new URL('../dist/homebase-demand-history.js',import.meta.url),'utf8');
 for(const id of ['uber-baltimore-20260911-0755','uber-baltimore-20260911-1709','uber-baltimore-20260925-1502','uber-baltimore-20261006-1611','uber-baltimore-20261006-1641','uber-baltimore-20261008-1435','uber-baltimore-20261008-2016'])assert.ok(src.includes('"id": "'+id+'"'),id);
 // Ambiguous originals (IMG_3066, IMG_3274, IMG_3362/3363) are ledger-only, not dated history.
 for(const f of ['IMG_3362','IMG_3363'])assert.ok(!src.includes('"name": "'+f),f);
 // Earliest verified capture is Aug 28, 2026 4:38 PM (OneDrive camera-roll file 20260828_203826000_iOS.png, v285).
 assert.ok(src.includes('"id": "uber-baltimore-20260828-1638"'));
 assert.ok(!/"captured_at": "2026-0[1-7]-/.test(src)&&!/"captured_at": "2026-08-([01]\d|2[0-7])T/.test(src));
});
test('Oct 8 2:35 PM +$11 and 3:26 PM +$6.25 stay distinct; Oct 6 4:41 cooling is wide-view context, not calm',()=>{
 const at=(a,t)=>H.forecastFor(a,new Date(t),true);
 // The Oct 6 wide 4:41 PM view must not cancel the Oct 6 4:11 PM Cockeysville bonus on future weekdays.
 const cock=at('Cockeysville','2026-10-27T16:10:00-04:00');
 assert.ok(cock.distinctDates>=3&&cock.strength>0);
 // Roland Park 2:35 PM (Oct 8 +$11) is a pattern window of its own, separate from Brooklyn Park 3:26 PM.
 assert.ok(at('Roland Park','2026-10-29T14:35:00-04:00').distinctDates>=1);
 assert.equal(at('Roland Park','2026-10-29T15:26:00-04:00').strength<at('Roland Park','2026-10-29T14:35:00-04:00').strength,true);
});
test('IMG_3400 is dated Sat Oct 3 2:04 AM and Oct 8 12:25 AM keeps its +$6.75 badge',()=>{
 const src=require('node:fs').readFileSync(new URL('../dist/homebase-demand-history.js',import.meta.url),'utf8');
 assert.ok(src.includes('"uber-baltimore-shared-20261003-0205": {"set": {"captured_at": "2026-10-03T02:04:00-04:00"'));
 assert.ok(/"uber-baltimore-20261008-0026": \{"set": \{"visible_bonus_badges_usd": \[1\.5, 2\.25, 5\.25, 5\.25, 6\.75\]/.test(src));
 assert.ok(H.forecastFor('Bolton Hill',new Date('2026-10-24T02:04:00-04:00'),true).distinctDates>=1);
});
test('promotions are never stored as surge',()=>{
 const src=require('node:fs').readFileSync(new URL('../dist/homebase-demand-history.js',import.meta.url),'utf8');
 assert.ok(!/"metric_type": "promotion"/.test(src));
 assert.ok(src.includes('active hour')&&/promotion is not stored as surge|promotion and is not stored as surge|Active-hour promotion excluded/.test(src));
});
test('owner rule: light map theme is daytime; estimated dates count at half weight',()=>{
 const src=require('node:fs').readFileSync(new URL('../dist/homebase-demand-history.js',import.meta.url),'utf8');
 assert.ok(/"id": "uber-baltimore-20261001-1608".{0,1500}?"timestamp_confidence": "high"/.test(src));
 assert.ok(/"id": "uber-baltimore-20260918-1457".{0,1500}?"timestamp_confidence": "low"/.test(src));
 assert.ok(H.forecastFor('Pikesville',new Date('2026-10-23T14:57:00-04:00'),true).distinctDates>=1);
});
