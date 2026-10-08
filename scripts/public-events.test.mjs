import test from 'node:test';
import assert from 'node:assert/strict';
import { zonedEventTime, structuredEvents, normalizePublicEvent, publicEventCalendars } from './public-events.mjs';
import { normalizePublicPlaces, publicPlaces } from './public-places.mjs';
import publicData from '../dist/homebase-public-data.js';
const now=Date.parse('2026-10-07T14:00:00Z');
const market={id:'london',name:'London',center:{lat:51.5074,lon:-.1278},radiusKm:65,placeRadiusKm:20,timeZone:'Europe/London'};
const source={name:'Published calendar',url:'https://calendar.example/list'};
const show={ '@type':'TheaterEvent',name:'Published performance',startDate:'2026-10-07T19:30:00',endDate:'2026-10-07',eventStatus:'https://schema.org/EventScheduled',location:{name:'Named Theatre',geo:{latitude:51.51,longitude:-.13}},url:'https://calendar.example/show'};

test('public performance times resolve in the venue timezone and never invent an end',()=>{
  const event=normalizePublicEvent(show,market,source,now);
  assert.equal(event.eventStart,'2026-10-07T18:30:00.000Z');assert.equal(event.eventEnd,null);
  assert.equal(zonedEventTime('2026-12-07T19:30:00','Europe/London'),'2026-12-07T19:30:00.000Z');
  assert.equal(zonedEventTime('2026-10-07T14:00:00','America/New_York'),'2026-10-07T18:00:00.000Z');
  for(const time of ['2026-10-07','2026-02-31T19:30:00','2026-02-31T19:30:00Z','2026-10-07T25:30:00','2026-03-29T01:30:00','2026-10-25T01:30:00'])assert.equal(zonedEventTime(time,'Europe/London'),null);
});
test('calendar ingestion requires a real public dated event with local coordinates',()=>{
  for(const change of [{startDate:'2026-10-07'},{eventStatus:'https://schema.org/EventCancelled'},{eventStatus:'https://schema.org/EventPostponed'},{eventAttendanceMode:'https://schema.org/OnlineEventAttendanceMode'},{private:true},{location:{name:'Unknown Theatre'}},{location:{name:'Other market',geo:{latitude:40.8,longitude:-74}}},{name:'Standard admission', '@type':'Event'},{startDate:'2026-10-10T19:30:00'}])assert.equal(normalizePublicEvent({...show,...change},market,source,now),null);
  assert.equal(normalizePublicEvent({...show,endDate:'2026-10-07T22:00:00'},market,source,now).eventEnd,'2026-10-07T21:00:00.000Z');
});
test('JSON-LD graphs, classification and repeated dated performances survive bounded pagination',async()=>{
  const html=e=>'<html><script type="application/ld+json">'+JSON.stringify({'@graph':[e]})+'</script><script type="application/ld+json">invalid</script></html>';
  assert.equal(structuredEvents(html(show)).length,1);
  const urls=[];const request=async url=>{urls.push(String(url));return{ok:true,text:async()=>urls.length===1?html(show)+'<a title="Next page 2" href="https://calendar.example/list?page=1">Next</a>':html({...show,startDate:'2026-10-08T14:30:00'})};};
  const result=await publicEventCalendars({...market,publicCalendars:[{...source,maxPages:2}]},now,request);
  assert.equal(result.status,'active');assert.equal(result.events.length,2);assert.equal(result.sources[0].pages,2);assert.equal(urls[1],'https://calendar.example/list?page=1');
  const unavailable=await publicEventCalendars({...market,publicCalendars:[source]},now,async()=>({ok:false}));assert.equal(unavailable.status,'unavailable');assert.deepEqual(unavailable.events,[]);
});
test('an unavailable calendar page retains other sources and reports partial coverage',async()=>{
  const request=async url=>String(url).includes('/unavailable')?{ok:false}:{ok:true,text:async()=>'<html><script type="application/ld+json">'+JSON.stringify(show)+'</script></html>'};
  const result=await publicEventCalendars({...market,publicCalendars:[source,{...source,url:'https://calendar.example/unavailable'}]},now,request);
  assert.equal(result.status,'partial');assert.equal(result.events.length,1);assert.equal(result.sources[1].status,'unavailable');
});
test('scheduled calendars remain usable beyond the 25-minute pricing expiry and dedupe overlapping markets',()=>{
  const event=normalizePublicEvent(show,market,source,now),fetchedAt=new Date(now-2*3600000).toISOString();
  const entry={...market,ticketmaster:{status:'not_configured',events:[]},publicRecords:{calendarStatus:'active',fetchedAt,events:[event,{...event,eventStart:'2026-10-08T01:00:00Z'}]}};
  const payload={generatedAt:fetchedAt,markets:[entry,{...entry,id:'overlap'}]};
  const events=publicData.eventsForLocation(payload,51.5,-.12,now);assert.equal(events.length,2,'different performances are not collapsed by name');
  assert.equal(publicData.calendarCoverage({...payload,generatedAt:new Date(now).toISOString()},51.5,-.12,now).fetchedAt,fetchedAt,'deployment time cannot replace the actual calendar fetch time');
  assert.equal(publicData.eventsForLocation(payload,40.94,-74.07,now).length,0,'London cannot transplant to Paramus');
  assert.equal(publicData.eventsForLocation({...payload,markets:[{...entry,publicRecords:{...entry.publicRecords,fetchedAt:new Date(now-25*3600000).toISOString()}}]},51.5,-.12,now).length,0);
});
test('ticket add-ons are excluded at ingestion and from saved feeds without hiding real shows',()=>{
  const names=['VIP Bowling Lane Add On - White Denim - Not a Concert Ticket','2026 NY Yankees Division Series Game 3 * Premium Seating *','Pinstripe Pass * 2026 NY Yankees Division Series Game 3','Concert Parking','Concert VIP Upgrade'];
  for(const name of names)assert.equal(normalizePublicEvent({...show,name},market,source,now),null,name);
  const event=normalizePublicEvent(show,market,source,now);
  const payload={markets:[{...market,publicRecords:{calendarStatus:'active',fetchedAt:new Date(now).toISOString(),events:[event,...names.map(name=>({...event,name}))]}}]};
  assert.equal(publicData.eventsForLocation(payload,51.5,-.12,now).length,1);
  assert.ok(normalizePublicEvent({...show,name:'An Evening with VIP Orchestra'},market,source,now));
});
test('different feed titles for one stadium game dedupe while separate concerts and performance times survive',()=>{
  const game={name:'2026 Yankees Division Series Game 3',venue:'Yankee Stadium',eventType:'SportsEvent',lat:40.8285,lon:-73.9276,eventStart:'2026-10-08T00:00:00Z'};
  assert.equal(publicData.eventIdentity(game),publicData.eventIdentity({...game,name:'Tampa Bay Rays at New York Yankees',eventType:'SPORTS',lat:40.8296,lon:-73.9262}));
  const concert={...game,venue:'The O2',name:'The Strokes',eventType:'MusicEvent'};
  assert.notEqual(publicData.eventIdentity(concert),publicData.eventIdentity({...concert,name:'Mamma Mia! The Party'}));
  assert.notEqual(publicData.eventIdentity(concert),publicData.eventIdentity({...concert,eventStart:'2026-10-08T02:00:00Z'}));
});
test('public place geometry includes ways and the named-area fallback survives mirror outages',async()=>{
  const rows=normalizePublicPlaces({elements:[{type:'way',id:1,center:{lat:51.51,lon:-.13},tags:{name:'Public station',railway:'station'}},{type:'node',id:2,lat:40.94,lon:-74.07,tags:{name:'Wrong market',place:'town'}}]},market,now);
  assert.equal(rows.length,1);assert.equal(rows[0].cat,'transit');assert.match(rows[0].tags.sourceUrl,/openstreetmap.org\/way\/1/);
  const result=await publicPlaces(market,now,null,async()=>({ok:false}));assert.equal(result.status,'baseline');assert.ok(result.places.length>=12);assert.ok(result.places.every(p=>p.tags.modelEstimate));
  const payload={markets:[{...market,publicPlaces:result}]};assert.ok(publicData.placesForLocation(payload,51.5,-.12,18,now).length>=12);assert.equal(publicData.placesForLocation(payload,40.94,-74.07,18,now).length,0);
});
test('venue parent coordinates and published HTML show times remain usable without invented ends',async()=>{
 const {publishedVenueEvents}=await import('./public-events.mjs');
 const html='<article class="event" data-start="2026-10-08 20:00"><a href="https://www.baltimoresoundstage.com/events/show/"><span class="title">R&#038;B Party</span></a></article>';
 const s={...source,adapter:'soundstage',venue:{name:'Baltimore Soundstage',lat:39.2875169,lon:-76.607604}};
 const e=publishedVenueEvents(html,s)[0];
 assert.equal(e.name,'R&B Party');assert.equal(e.endDate,undefined);
 assert.equal(normalizePublicEvent(e,{center:{lat:39.29,lon:-76.61},radiusKm:58,timeZone:'America/New_York'},s,Date.parse('2026-10-08T14:00:00Z')).eventStart,'2026-10-09T00:00:00.000Z');
 const parent={ '@type':'MusicVenue',name:'Ottobar',geo:{latitude:39.3188405,longitude:-76.6194969},event:{'@type':'MusicEvent',name:'Published show',startDate:'2026-10-08T19:00:00-04:00',location:{name:'Ottobar'}}};
 assert.equal(structuredEvents('<script type="application/ld+json">'+JSON.stringify(parent)+'</script>')[0].location.geo.latitude,39.3188405);
});
