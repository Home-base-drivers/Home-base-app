import test from 'node:test';
import assert from 'node:assert/strict';
import {schoolEventRelevant,publicSchoolUrl,publicAddress,schoolPage,schoolCalendarLinks,schoolIcsEvents,blackbaudSchoolEvents,digitalSportsEvents,normalizeSchoolEvent,schoolsFromOsm,schoolsFromWikidata,readSchoolCalendar} from './school-events.mjs';
import {schoolSearchMarket,makeSchoolSearch} from './school-service.mjs';
import client from '../dist/homebase-school-events.js';
const now=Date.parse('2026-10-08T16:00:00Z'),market={center:{lat:39.29,lon:-76.61},radiusKm:35,timeZone:'America/New_York'},school={name:'Test High School',lat:39.31,lon:-76.60,url:'https://school.example.org/',kind:'high_school',campusVenues:['Main Gym']};
const event={name:'Homecoming Dance',startDate:'2026-10-08T19:00:00',endDate:'2026-10-08T21:30:00',location:{name:'Main Gym'},url:'/events/dance'};
test('school events distinguish substantial dated activity from routine campus tasks',()=>{
 for(const name of ['Homecoming Football Game','Senior Prom','Family Weekend','Homecoming Bonfire','Alumni Reunion','Graduation','Fall Musical'])assert.ok(schoolEventRelevant(name),name);
 for(const name of ['Homecoming Ticket Sales','Homecoming Spirit Week','Football Practice','Homecoming Volunteer Application','Homecoming VIP Upgrade','Homecoming Parking Pass','Virtual Homecoming Reunion','Class Meeting','Exam','Club meeting','Canceled Homecoming Dance'])assert.equal(schoolEventRelevant(name),false,name);
});
test('school calendar times drive arrival/departure context, never invented ends or off-campus coordinates',()=>{
 const e=normalizeSchoolEvent(event,school,market,school.url,now);assert.equal(e.eventStart,'2026-10-08T23:00:00.000Z');assert.equal(e.eventEnd,'2026-10-09T01:30:00.000Z');assert.equal(e.locationPrecision,'campus');assert.equal(e.attendance,null);
 assert.equal(normalizeSchoolEvent({...event,endDate:null},school,market,school.url,now).eventEnd,null);
 assert.equal(normalizeSchoolEvent({...event,location:{name:'Away at Different School'}},school,market,school.url,now),null);
 assert.equal(normalizeSchoolEvent({...event,location:{}},school,market,school.url,now),null);
 assert.equal(normalizeSchoolEvent({...event,location:{name:'Off-campus venue',geo:{latitude:40,longitude:-74}}},school,market,school.url,now),null);
 const date=normalizeSchoolEvent({...event,startDate:'2026-10-09',endDate:null},school,market,school.url,now);assert.equal(date.demandEligible,false);assert.equal(date.eventStart,null);assert.deepEqual(client.mapEvents([date],now),[]);
 assert.equal(client.mapEvents([e],now)[0].tags.schoolEvent,true);
});
test('public ICS preserves TZID, UTC, folding, cancellation, date-only notices and flags unsupported recurrence',()=>{
 const body='BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:one\r\nSUMMARY:Homecoming\r\n Dance\r\nDTSTART;TZID=America/New_York:20261008T190000\r\nDTEND;TZID=America/New_York:20261008T213000\r\nLOCATION:Main Gym\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Homecoming Game\r\nDTSTART;VALUE=DATE:20261009\r\nLOCATION:Main Gym\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Football Game\r\nDTSTART:20261008T230000Z\r\nRRULE:FREQ=WEEKLY\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Prom\r\nDTSTART:20261008T230000Z\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\nEND:VCALENDAR';
 const parsed=schoolIcsEvents(body,'Europe/London');assert.equal(parsed.events.length,2);assert.equal(parsed.events[0].startDate,'2026-10-08T23:00:00.000Z');assert.equal(parsed.events[0].name,'HomecomingDance');assert.equal(parsed.events[1].startDate,'2026-10-09');assert.equal(parsed.recurrenceLimited,true);
});
test('Blackbaud dates and explicit times parse while date-only homecoming remains context',()=>{
 const block=(title,time)=>'<div class="event-detail non-athletic-event"><h4 class="h4-style event-title"><a href="/event">'+title+'</a></h4><time><span class="start-date">10/10/2026</span>'+time+'</time><div class="location">Main Gym</div></div></li>';
 const rows=blackbaudSchoolEvents(block('Homecoming Dance','<span class="start-time">7:00 PM</span><span class="end-time">to 9:30 PM</span>')+block('Homecoming Games',''));assert.equal(rows[0].startDate,'2026-10-10T19:00:00');assert.equal(rows[0].endDate,'2026-10-10T21:30:00');assert.equal(rows[1].startDate,'2026-10-10');
});
test('district sports use actual venue, ignore cancellations and never move away games to the home school',()=>{
 const row=(venue,cancel='')=>'<tr><td><strong>6:00 PM</strong></td><td>Football: Boys Varsity Game '+cancel+'</td><td>vs Other High School @ Home High <a href="https://league.example.org/game">'+venue+'</a></td></tr>';
 const rows=digitalSportsEvents('<h2><span>Thu</span> October 8th 2026</h2><table class="schedule-table">'+row('Test High School')+row('Different Sports Facility')+row('Test High School','Canceled')+'</table>',[school]);assert.equal(rows.length,1);assert.equal(rows[0].startDate,'2026-10-08T18:00:00');assert.equal(rows[0].location.geo.latitude,school.lat);
});
test('discovery supports any mapped location and includes schools without a public website in coverage',()=>{
 const m={center:{lat:51.5,lon:-.12},radiusKm:35};const rows=schoolsFromOsm({elements:[{type:'way',id:1,center:{lat:51.51,lon:-.1},tags:{name:'Local Secondary School',amenity:'school',website:'https://school.example.org/'}},{type:'node',id:2,lat:51.5,lon:-.1,tags:{name:'Local University',amenity:'university'}},{type:'node',id:3,lat:51.5,lon:-.1,tags:{name:'Elementary School',amenity:'school'}},{type:'node',id:4,lat:39.3,lon:-76.6,tags:{name:'Baltimore High School',amenity:'school'}}]},m);assert.equal(rows.length,2);assert.equal(rows[1].kind,'high_school');assert.ok(rows.some(s=>s.url===null));
});
test('school links follow published feeds and block private/network targets including redirects',async()=>{
 const links=schoolCalendarLinks('<a href="/calendar">Calendar</a><a href="webcal://calendar.example.org/public.ics">Feed</a><a href="/login/calendar">Calendar</a><a href="http://127.0.0.1/events">Events</a>',school.url);assert.deepEqual(links,['https://calendar.example.org/public.ics','https://school.example.org/calendar']);
 for(const url of ['http://school.example.org','https://127.0.0.1/events','https://localhost/events','https://user:pass@school.example.org/events','https://[::1]/events'])assert.equal(publicSchoolUrl(url),null);
 for(const ip of ['127.0.0.1','10.1.1.1','169.254.169.254','192.168.0.1','100.64.0.1','::1','fc00::1','::ffff:127.0.0.1'])assert.equal(publicAddress(ip),false,ip);
 assert.ok(publicAddress('93.184.216.34'));
 await assert.rejects(schoolPage(school.url,async()=>new Response('',{status:302,headers:{location:'https://127.0.0.1/events'}}),async()=>['93.184.216.34']));
 await assert.rejects(schoolPage(school.url,async()=>new Response(''),async()=>['10.1.1.1']));
});
test('source failures preserve other calendar links and report partial coverage',async()=>{
 const request=async url=>new Response(String(url).endsWith('/')?'<a href="/public.ics">Calendar</a><a href="/events/broken">Events</a>':String(url).endsWith('.ics')?'BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Homecoming Dance\nDTSTART;TZID=America/New_York:20261008T190000\nLOCATION:Main Gym\nEND:VEVENT\nEND:VCALENDAR':'',{status:String(url).includes('broken')?503:200});
 const r=await readSchoolCalendar(school,market,now,request);assert.equal(r.events.length,1);assert.equal(r.source.status,'partial');assert.equal(r.events[0].eventEnd,null);
});
test('search coarsens driver position and paginates all discovered schools without sharing identity or arbitrary URLs',async()=>{
 const input={lat:51.50123,lon:-.12121,timeZone:'Europe/London',userId:'private',url:'https://evil.example/'};assert.deepEqual(schoolSearchMarket(input),{center:{lat:51.5,lon:-.12},radiusKm:35,timeZone:'Europe/London'});
 assert.throws(()=>schoolSearchMarket({...input,timeZone:'bad'}));assert.throws(()=>schoolSearchMarket({...input,lat:null}));
 const elements=Array.from({length:15},(_,i)=>({type:'node',id:i,lat:51.5+i/1000,lon:-.12,tags:{name:'High School '+i,amenity:'school'}}));let calls=0;const search=makeSchoolSearch({request:async()=>{calls++;return new Response(JSON.stringify({elements}));},now:()=>now});
 const a=await search(input),b=await search({...input,cursor:a.nextCursor});assert.equal(a.nextCursor,12);assert.equal(b.nextCursor,null);assert.equal(b.checkedCount,22);assert.equal(a.exhaustive,false);assert.equal(calls,9);assert.ok(a.sources.some(s=>s.status==='no_public_website'));assert.ok(a.sources.some(s=>/Ticketmaster London/.test(s.name)));
});

test('independent public school index retains published sites and excludes distant or private targets',()=>{
 const m={center:{lat:51.5,lon:-.12},radiusKm:35};
 const record=(name,point,url,id)=>({schoolLabel:{value:name},location:{value:point},website:{value:url},school:{value:'http://www.wikidata.org/entity/'+id}});
 const rows=schoolsFromWikidata({results:{bindings:[record('Local University','Point(-0.12 51.5)','https://university.example.org/','Q123'),record('Local High School','Point(-0.1 51.51)','https://127.0.0.1/','Q124'),record('Distant High School','Point(-76.6 39.3)','https://school.example.org/','Q125')]}},m);
 assert.equal(rows.length,2);assert.equal(rows[0].kind,'college');assert.equal(rows[1].url,null);assert.equal(rows[0].coordinateSource,'https://www.wikidata.org/entity/Q123');
});
