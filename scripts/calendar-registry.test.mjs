import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeSchoolSearch} from './school-service.mjs';
import {localCalendarSources,cloudCalendarRegistry} from './calendar-registry.mjs';
const market={center:{lat:51.5,lon:-.12},radiusKm:35,timeZone:'Europe/London'},input={lat:51.5,lon:-.12,timeZone:'Europe/London',refresh:true};
const source={name:'Local school',url:'https://school.example.org/calendar',kind:'high_school',lat:51.5,lon:-.12};
test('saved local minimum is checked again on load, discoveries persist and distant history is excluded',async()=>{
 const now=Date.parse('2026-10-08T21:00Z');let discoveries=0,reads=0,saved=[];
 const request=async url=>{if(String(url).includes('overpass')){discoveries++;return new Response('{"elements":[]}');}reads++;return new Response('BEGIN:VCALENDAR\nEND:VCALENDAR');};
 const registry={load:async()=>({sources:localCalendarSources(saved,market),discoveredAt:saved.length?now-1000:0,discoveryStatus:'active'}),save:async(m,s)=>{saved=s;}};
 saved=[source,{...source,name:'Distant school',url:'https://distant.example.org/calendar',lat:39.3,lon:-76.6}];
 const search=makeSchoolSearch({request,now:()=>now});
 const a=await search(input,{userId:'a',registry});assert.ok(a.registrySources.some(s=>s.url===source.url));assert.ok(!a.registrySources.some(s=>s.name==='Distant school'));assert.equal(discoveries,0);
 const before=reads;await search(input,{userId:'a',registry});assert.ok(reads>before);assert.equal(discoveries,0);
 saved=[];await search(input,{userId:'b',registry});assert.equal(discoveries,2);assert.ok(saved.length>0);
});
test('local source validation rejects private URLs and unmapped remote calendars',()=>{
 assert.equal(localCalendarSources([source,{...source,url:'https://127.0.0.1/'},{name:'Unmapped',url:'https://other.example.org'}],market).length,1);
});
test('private database requests carry verified identity, paginate and never delete old sources',async()=>{
 const calls=[];const registry=cloudCalendarRegistry({url:'https://project.supabase.co',key:'public',authorization:'Bearer verified',userId:'owner',request:async(url,options)=>{calls.push([url,options]);return options.method==='POST'?new Response(null,{status:201}):new Response('[]');}});
 await registry.load(market);await registry.save(market,[source],Date.now(),'partial');
 assert.ok(calls.every(([,o])=>o.headers.Authorization==='Bearer verified'));assert.ok(calls[0][0].includes('user_id=eq.owner'));assert.ok(calls.every(([,o])=>o.method!=='DELETE'));assert.equal(JSON.parse(calls[2][1].body)[0].user_id,'owner');
});
test('new published calendar links are retained and checked in the same load',async()=>{
 const now=Date.parse('2026-10-08T21:00Z'),saved=[source];
 const registry={load:async()=>({sources:saved,discoveredAt:now,discoveryStatus:'active'}),save:async(m,s)=>saved.push(...s)};
 const search=makeSchoolSearch({now:()=>now,request:async url=>new Response(url===source.url?'<a href="https://school.example.org/public.ics">Calendar feed</a>':'BEGIN:VCALENDAR\nEND:VCALENDAR')});
 const a=await search(input,{userId:'links',registry});assert.ok(a.registrySources.some(s=>s.url.endsWith('public.ics')));assert.ok(saved.some(s=>s.url.endsWith('public.ics')));
});
