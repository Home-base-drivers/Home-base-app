import test from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm, normalizeTicketmasterEvent, normalizeUberSurge, ticketmasterProvider } from './refresh-provider-signals.mjs';

test('canceled, postponed and unspecified event times cannot become route signals', () => {
  const event={name:'Concert',_embedded:{venues:[{name:'Arena',location:{latitude:'39.29',longitude:'-76.61'}}]},dates:{start:{dateTime:'2026-10-06T20:00:00Z'}}},now=new Date('2026-10-06T12:00:00Z');
  for(const code of ['canceled','postponed'])assert.equal(normalizeTicketmasterEvent({...event,dates:{...event.dates,status:{code}}},now),null);
  for(const flag of ['dateTBD','dateTBA','timeTBA'])assert.equal(normalizeTicketmasterEvent({...event,dates:{start:{...event.dates.start,[flag]:true}}},now),null);
  assert.ok(normalizeTicketmasterEvent(event,now));
});

test('metro distance is measured in kilometers', () => {
  assert.ok(Math.abs(haversineKm({ lat: 39.2904, lon: -76.6122 }, { lat: 39.4015, lon: -76.6019 }) - 12.4) < 1);
});

test('Ticketmaster events require real coordinates and a start time', () => {
  const event = normalizeTicketmasterEvent({
    id: 'event-1', name: 'Verified show', dates: { start: { dateTime: '2026-09-26T23:00:00Z' } },
    _embedded: { venues: [{ name: 'Real venue', location: { latitude: '39.29', longitude: '-76.61' } }] }
  }, new Date('2026-09-25T12:00:00Z'));
  assert.equal(event.name, 'Verified show');
  assert.equal(event.venue, 'Real venue');
  assert.equal(event.lat, 39.29);
  assert.equal(normalizeTicketmasterEvent({ name: 'No coordinate' }, new Date('2026-09-25T12:00:00Z')), null);
});
test('Ticketmaster API add-ons cannot become extra pickup events',()=>{
  const event={name:'Show',dates:{start:{dateTime:'2026-10-07T18:30:00Z'}},_embedded:{venues:[{name:'Arena',location:{latitude:51.51,longitude:-.13}}]}};
  for(const name of ['Show Parking','Show VIP Upgrade','Show - Premium Seating','Not a Concert Ticket - Bowling Lane Add On'])assert.equal(normalizeTicketmasterEvent({...event,name},new Date('2026-10-07T14:00:00Z')),null);
  assert.ok(normalizeTicketmasterEvent(event,new Date('2026-10-07T14:00:00Z')));
});

test('Uber samples retain independently rated low and high price areas', () => {
  const origin = { name: 'Towson', lat: 39.4, lon: -76.6 };
  assert.equal(normalizeUberSurge(origin, { prices: [{ surge_multiplier: 1 }, { surge_multiplier: 1.02 }] }).surgeMultiplier, 1.01);
  assert.equal(normalizeUberSurge(origin, { prices: [{ surge_multiplier: 1.1 }, { surge_multiplier: 1.4 }] }).surgeMultiplier, 1.25);
});
test('Ticketmaster keeps music classification, uses the market country, and reads additional pages', async () => {
  const saved=process.env.TICKETMASTER_API_KEY;process.env.TICKETMASTER_API_KEY='fixture-key';
  try{
    const urls=[],event={id:'fixture',name:'Named artist',classifications:[{segment:{name:'Music'},genre:{name:'Rock'}}],dates:{start:{dateTime:'2026-10-07T18:30:00Z'}},_embedded:{venues:[{name:'Public venue',location:{latitude:51.51,longitude:-.13}}]}};
    const data=await ticketmasterProvider({center:{lat:51.5,lon:-.12},radiusKm:30,countryCode:'GB'},async url=>{urls.push(new URL(url));return{ok:true,json:async()=>({page:{totalPages:2},_embedded:{events:[event]}})};},new Date('2026-10-07T14:00:00Z'));
    assert.equal(urls.length,2);assert.equal(urls[0].searchParams.get('countryCode'),'GB');assert.equal(urls[1].searchParams.get('page'),'1');assert.equal(data.events.length,1);assert.equal(data.events[0].classification,'Music Rock');
  }finally{if(saved===undefined)delete process.env.TICKETMASTER_API_KEY;else process.env.TICKETMASTER_API_KEY=saved;}
});
test('fresh partial calendar is never erased by an older cached calendar',async()=>{
 const {retainRecent}=await import('./refresh-provider-signals.mjs');
 const prior={publicRecords:{status:'active',fetchedAt:new Date().toISOString(),events:[{name:'Old Towson only'}]}};
 const current={status:'partial',fetchedAt:new Date().toISOString(),events:[{name:'New Morgan concert'}],sources:[{status:'active'},{status:'unavailable'}]};
 assert.equal(retainRecent(prior,current,'publicRecords',86400000),current);
 assert.equal(retainRecent(prior,{status:'unavailable'},'publicRecords',86400000).status,'stale');
});
