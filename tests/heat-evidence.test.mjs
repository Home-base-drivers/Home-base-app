import test from 'node:test';
import assert from 'node:assert/strict';
import heat from '../dist/homebase-heat.js';
import history from '../dist/homebase-demand-history.js';
import publicData from '../dist/homebase-public-data.js';
import {normalizeCampusEvents} from '../scripts/public-records.mjs';
const now=Date.parse('2026-10-08T00:26:00-04:00');
test('dense modeled context stays faint and cannot wash out a changing live peak',()=>{
 const background=heat.composeFields(0,0,1000,700,{});
 assert.ok(background.opacity<=.34);assert.ok(background.level<=.45);
 const live={current:1,surge:.95};
 assert.deepEqual(heat.composeFields(.8,.7,1000,700,live),heat.composeFields(.8,.7,0,0,live));
 assert.ok(heat.composeFields(.8,.7,1000,700,live).opacity>background.opacity);
 assert.equal(heat.composeFields(0,0,1000,700,{current:1},.08).opacity,0);
 assert.ok(heat.composeFields(.8,.6,0,0,{current:1,event:.7}).level<heat.composeFields(.8,.7,0,0,live).level);
});
test('fresh airport arrival activity changes its published hour without becoming price surge',()=>{
 const time=Date.now(),hour=new Date(time);hour.setMinutes(0,0,0);
 const airport={tags:{providerSignal:true,airportActivity:true,flightHour:hour.toISOString(),sourceFetchedAt:new Date(time).toISOString(),arrivals:8}};
 assert.equal(heat.currentEvidence(airport,new Date(time),time),'activity');
 assert.equal(heat.currentEvidence(airport,new Date(+hour+3600000),time),'modeled');
 assert.equal(heat.sourceStrength({...airport,tags:{...airport.tags,sourceFetchedAt:new Date(time-26*60000).toISOString()}},new Date(time),()=>30),0);
});
test('hundreds of overlapping priors never become surge, and current zero overrides history',()=>{
 for(const weight of [.1,1,10,1000])assert.ok(heat.evidenceLevel(weight,weight)<=.57);
 assert.ok(heat.evidenceLevel(10,10,{event:1})<=.78);
 assert.ok(heat.evidenceLevel(10,10,{surge:.95})>=.9);
 const source={tags:{providerSignal:true,providerSampledAt:new Date(now).toISOString(),uberSurgeMultiplier:1}};
 assert.equal(heat.currentEvidence(source,new Date(now),now),'current');
 assert.equal(heat.currentEvidence({...source,tags:{...source.tags,uberSurgeMultiplier:2}},new Date(now),now),'surge');
 assert.equal(heat.currentEvidence(source,new Date(now),now+26*60000),'modeled');
});
test('published events are confirmed context, never price surge; unknown end has no overnight exit',()=>{
 const source={eventStart:'2026-10-07T20:00:00-04:00',eventEnd:null,tags:{publicCalendar:true,sourceFetchedAt:new Date(now).toISOString()}};
 assert.equal(heat.currentEvidence(source,new Date('2026-10-07T19:30:00-04:00'),now),'event');
 assert.equal(heat.currentEvidence(source,new Date(now),now),'modeled');
});
test('historical memory remains a small prior and never multiplies a live score',()=>{
 const prior=history.forecastFor('Morgan State',new Date('2026-10-14T23:00:00-04:00'),true);
 assert.equal(prior.distinctDates,1);assert.ok(prior.strength>0&&prior.strength<=.01);assert.equal(prior.surgeConfirmed,false);
 assert.equal(history.adjustWeight(5,'Morgan State',new Date(now),{day:4,hour:0},true,now),5);
 assert.equal(history.forecastFor('Morgan State',new Date(now),false).strength,0);
});
test('Morgan timed concert with unknown end survives midnight ingestion without invented attendance',()=>{
 const event={title:'2026 Homecoming Concert',publish_status:'published',experience:'inperson',localist_url:'https://events.morgan.edu/event/2026-homecoming-concert',location_name:'Hill Field House',geo:{latitude:39.344246,longitude:-76.582439},filters:{event_types:[{name:'Concerts/Performances'}]},event_instances:[{event_instance:{id:123,start:'2026-10-07T20:00:00-04:00',end:null,all_day:false}}]};
 const events=normalizeCampusEvents({events:[{event}]},now,{id:'morgan',name:'Morgan State University',origin:'https://events.morgan.edu'});
 assert.equal(events.length,1);assert.equal(events[0].eventEnd,null);assert.equal(events[0].attendance,null);assert.match(events[0].classification,/Concerts/);
 const payload={generatedAt:new Date(now).toISOString(),markets:[{center:{lat:39.29,lon:-76.61},radiusKm:58,publicRecords:{status:'active',fetchedAt:new Date(now).toISOString(),events}}]};
 assert.equal(publicData.eventsForLocation(payload,39.34,-76.58,now).length,1);
 assert.equal(publicData.eventsForLocation(payload,39.34,-76.58,now+7*3600000).length,0);
});
test('fresh zero-surge data suppresses history in the same map cell',()=>{
 assert.ok(heat.composePixel(0,0,{},.08).opacity>0);
 assert.equal(heat.composePixel(0,0,{current:1},.08).opacity,0);
 assert.deepEqual(heat.composePixel(1,1,{current:1,event:1},.08),heat.composePixel(1,1,{current:1,event:1},0));
 assert.ok(heat.composePixel(100,100,{},.08).level<=.57);
});
test('fresh feed observations persist once and stale pricing cannot enter surge memory',()=>{
 const sample={name:'Morgan State',surgeMultiplier:1.9,sampledAt:new Date(now).toISOString()};
 assert.equal(history.rememberSignal(sample,'Uber',now),true);
 assert.equal(history.rememberSignal(sample,'Uber',now),false);
 assert.equal(history.rememberSignal({...sample,sampledAt:new Date(now-31*60000).toISOString()},'Uber',now),false);
 const learned=history.forecastFor('Morgan State',new Date('2026-10-15T00:00:00-04:00'),true);
 assert.ok(learned.strength>0&&learned.strength<=.08);
});
test('history follows the named Morgan venue even if its assigned neighborhood has another name',()=>{
 const source={name:'Morgan State University',heatAreaName:'Original Northwood',lat:39.3448,lon:-76.5844};
 assert.ok(heat.historicalPriorForSource(source,new Date('2026-10-14T23:00:00-04:00'),history)>0);
 assert.equal(heat.historicalPriorForSource({...source,lat:51.51,lon:-.13},new Date('2026-10-14T23:00:00-04:00'),history),0);
});

test('event heat switches off between arrival and departure and at the one-hour cutoff',()=>{
 const event={eventStart:'2026-10-08T08:00:00-04:00',eventEnd:'2026-10-08T22:00:00-04:00',tags:{publicCalendar:true}};
 for(const hour of ['07:00','07:59','22:00','22:59'])assert.equal(heat.currentEvidence(event,new Date('2026-10-08T'+hour+':00-04:00'),now),'event');
 for(const hour of ['06:59','12:00','23:00'])assert.equal(heat.currentEvidence(event,new Date('2026-10-08T'+hour+':00-04:00'),now),'modeled');
 assert.equal(heat.sourceStrength(event,new Date('2026-10-08T12:00:00-04:00'),()=>20),0);
});
test('modeled neighborhoods retain distinct green-to-yellow intensity instead of one clipped yellow',()=>{
 const quiet=heat.composeFields(0,0,.05,.015,{}),busy=heat.composeFields(0,0,.8,.48,{});
 assert.ok(busy.level>quiet.level);assert.ok(busy.opacity>quiet.opacity);
 assert.ok(quiet.level<.27);assert.ok(busy.level<.42);assert.ok(busy.opacity<=.34);
 assert.equal(heat.composeFields(0,0,0,0,{}).opacity,0);
});
test('routine school background has an immediate-area footprint and hard geographic limit',()=>{
 for(const cat of ['school','k12']){
  const source={cat,tags:{publicVenue:true}};
  assert.ok(heat.sourceFootprintKm(source)<=.25);
  assert.equal(heat.sourceInfluenceLimitKm(source),.4);
 }
 assert.equal(heat.sourceInfluenceLimitKm({cat:'event',eventStart:'2026-10-08T19:00:00-04:00'}),Infinity);
});

test('ordinary populated neighborhood context remains visible over the dark map without becoming surge',()=>{
 const pixel=heat.composeFields(0,0,.19,.08,{});
 assert.ok(pixel.opacity>=.15&&pixel.opacity<=.34,'ordinary context should be legible');
 assert.ok(pixel.level>=.12&&pixel.level<.42,'background remains green/yellow');
 const edge=heat.composeFields(0,0,.005,.002,{});
 assert.ok(edge.opacity<pixel.opacity/5,'fading edges must remain faint');
 assert.equal(heat.composeFields(0,0,.19,.08,{current:1}).opacity,0);
});
