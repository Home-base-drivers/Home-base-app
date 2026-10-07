import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function eventDirectionsUrl('),html.indexOf('function updateClock('));
function setup(){
 const box={},pulse={};
 const context={currentEventData:[],currentEventCount:0,eventsExpanded:false,publicCalendarCoverage:{status:'active'},$:id=>id==='#todayEvents'?box:pulse,rideRelevantEvent:()=>true,updateClimateAdvisory(){},renderEventMarkers(){},marketTime:()=> '7 PM',marketDateTime:()=> 'Oct 7 · 7 PM',safeText:s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;'),eventColor:()=> '#abc',eventIconSvg:()=>'<span>Music</span>'};
 vm.createContext(context);vm.runInContext(source,context);return {context,box};
}
test('each list event links directly to its own coordinates without changing the compact row',()=>{
 const {context,box}=setup();
 const events=Array.from({length:5},(_,i)=>({name:'Event '+i,venue:'Venue '+i,lat:40+i/10,lon:-74-i/10,eventStart:new Date('2026-10-07T23:00:00Z')}));
 context.renderEvents(events);
 assert.equal((box.innerHTML.match(/<a class="event-item compact-event"/g)||[]).length,4);
 assert.match(box.innerHTML,/destination=40,-74&amp;travelmode=driving/);
 assert.match(box.innerHTML,/aria-label="Navigate to Event 1 at Venue 1"/);
 assert.match(box.innerHTML,/target="_blank" rel="noopener noreferrer"/);
 assert.match(box.innerHTML,/\+1 more events/);
 context.eventsExpanded=true;context.renderEvents(events);
 assert.equal((box.innerHTML.match(/<a class="event-item compact-event"/g)||[]).length,5);
 assert.match(box.innerHTML,/destination=40.4,-74.4/);
});
test('missing or invalid coordinates never navigate to an invented destination',()=>{
 const {context,box}=setup();
 for(const point of [{lat:null,lon:null},{lat:NaN,lon:2},{lat:91,lon:0},{lat:1,lon:181},{lat:'',lon:''}])assert.equal(context.eventDirectionsUrl(point),'');
 context.renderEvents([{name:'No location',eventStart:new Date(),lat:null,lon:null}]);
 assert.match(box.innerHTML,/<div class="event-item compact-event">/);
 assert.doesNotMatch(box.innerHTML,/maps\/dir/);
 assert.match(context.eventDirectionsUrl({lat:0,lon:0}),/destination=0,0/);
});
