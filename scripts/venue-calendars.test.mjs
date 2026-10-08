import test from 'node:test';
import assert from 'node:assert/strict';
import {registeredVenueCalendars,venuesFromOsm,readVenueCalendar} from './venue-calendars.mjs';
import {makeSchoolSearch} from './school-service.mjs';
import client from '../dist/homebase-school-events.js';
const now=Date.parse('2026-10-08T21:00:00Z'),market={center:{lat:39.29,lon:-76.61},radiusKm:35,timeZone:'America/New_York'};
test('major Baltimore venues and park calendars are registered without transplanting to other cities',()=>{
 const sources=registeredVenueCalendars(market);for(const name of ['Power Plant','Convention Center','CFG','M&T','Orioles','Pier Six','Fairgrounds','Recreation','Lake Roland'])assert.ok(sources.some(s=>s.name.includes(name)),name);
 assert.equal(registeredVenueCalendars({...market,center:{lat:25.76,lon:-80.19}}).length,0);
 assert.equal(venuesFromOsm({elements:[{tags:{name:'Park',website:'https://127.0.0.1/private'},lat:39.29,lon:-76.61}]},market).length,0);
});
test('official detail links yield timed events, reject foreign links and keep unknown ends and attendance',async()=>{
 const source={name:'Venue calendar',url:'https://venue.example.org/events',followEvents:true,venues:[{name:'Venue',lat:39.29,lon:-76.61}]},calls=[];
 const event={'@type':'Event',name:'Homecoming Celebration',startDate:'2026-10-08T21:00:00-04:00',location:{name:'Venue'},url:'https://venue.example.org/events/homecoming'};
 const request=async url=>{calls.push(url);return new Response(url===source.url?'<html><a href="/events/homecoming">Homecoming</a><a href="https://foreign.example.org/events/private">Event</a></html>':'<script type="application/ld+json">'+JSON.stringify(event)+'</script>');};
 const result=await readVenueCalendar(source,market,now,request);assert.equal(result.events.length,1);assert.equal(result.events[0].eventStart,'2026-10-09T01:00:00.000Z');assert.equal(result.events[0].eventEnd,null);assert.equal(result.events[0].expectedAttendance,undefined);assert.equal(calls.length,2);
});
test('startup refresh bypasses prior calendar results and checks discovered venues',async()=>{
 const input={lat:25.76,lon:-80.19,radiusKm:35,timeZone:'America/New_York',refresh:true};let reads=0;
 const request=async url=>{if(String(url).includes('overpass'))return new Response(JSON.stringify({elements:String(url).includes('stadium')?[{type:'node',id:4,lat:25.76,lon:-80.19,tags:{name:'Local Arena',website:'https://venue.example.org/events'}}]:[]}));reads++;return new Response('<script type="application/ld+json">'+JSON.stringify({'@type':'SportsEvent',name:'Basketball',startDate:'2026-10-08T19:00:00-04:00',location:{name:'Local Arena'}})+'</script>');};
 const search=makeSchoolSearch({request,now:()=>now});const first=await search(input);assert.equal(first.events.length,1);await search({...input,refresh:false});assert.equal(reads,1);await search(input);assert.equal(reads,2);
});
test('client requests fresh calendars on every first page, and preserves pagination',async()=>{
 const bodies=[],request=async(_,o)=>{bodies.push(JSON.parse(o.body));return new Response('{}');};
 const config={supabaseUrl:'https://project.supabase.co',supabasePublishableKey:'sb_publishable_test'};
 await client.page(config,[39.29123,-76.61234],'America/New_York',0,request);await client.page(config,[39.29,-76.61],'America/New_York',12,request);
 assert.equal(bodies[0].refresh,true);assert.equal(bodies[1].refresh,false);assert.equal(bodies[0].lat,39.29);
});
