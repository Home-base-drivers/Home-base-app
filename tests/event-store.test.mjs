// Event store: calendars are checked once per market day for the next three days;
// later refreshes reuse the stored records (only past events drop off).
import test from 'node:test';
import assert from 'node:assert/strict';
import {storedOrFreshRecords,marketDay} from '../scripts/public-records.mjs';
import {EVENT_HORIZON} from '../scripts/public-events.mjs';

test('calendars look three days ahead',()=>{assert.equal(EVENT_HORIZON,72*3600000);});
test('a calendar checked today is reused without new requests; past events drop off',async()=>{
  const now=Date.parse('2026-10-26T15:00:00-04:00'),market={id:'x',name:'Testville',timeZone:'America/New_York',center:{lat:40,lon:-75},radiusKm:30,publicCalendars:[]};
  const old={storeDay:marketDay(market,now),calendarStatus:'active',sources:[{name:'Arena',status:'active'}],events:[
    {name:'Tonight',eventStart:'2026-10-26T19:00:00-04:00'},{name:'Wednesday',eventStart:'2026-10-28T20:00:00-04:00'},{name:'Last night',eventStart:'2026-10-25T20:00:00-04:00',eventEnd:'2026-10-25T23:00:00-04:00'}]};
  let calls=0;const request=async()=>{calls++;throw Error('no network')};
  const r=await storedOrFreshRecords(market,old,now,request);
  assert.equal(calls,0);assert.equal(r.storeReused,true);
  assert.deepEqual(r.events.map(e=>e.name),['Tonight','Wednesday']);
});
test('a new day triggers a fresh three-day check',async()=>{
  const now=Date.parse('2026-10-27T06:00:00-04:00'),market={id:'x',name:'Testville',timeZone:'America/New_York',center:{lat:40,lon:-75},radiusKm:30,publicCalendars:[]};
  const r=await storedOrFreshRecords(market,{storeDay:'2026-10-26',calendarStatus:'active',events:[]},now,async()=>{throw Error('offline')});
  assert.equal(r.storeDay,'2026-10-27');assert.ok(!r.storeReused);
});
