import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const AI=createRequire(import.meta.url)('../dist/homebase-internal-ai.js');
const now=new Date('2026-11-05T10:20:00-05:00');

// Text read from Chris's Uber "Earnings Activity" screenshots (Nov 4-5, 2026), in the
// order the phone's text reader returns it: pay and time first, then the ride line.
// Street lines are replaced with made-up streets; riders' names never appear here.
const head=(clock,filter)=>`${clock}\nEarnings Activity\nType Feature ${filter} Clear all\n`;
const card=(pay,time,ride,extra='',increased=false)=>`$${pay}${increased?' ↑ Increased':''} ${time}\nUberX · ${ride}\n${extra?extra+'\n':''}Sample St, Baltimore, MD, USA\nOther Ave, Baltimore, MD, USA\n`;
const tabs='Home Discover Earnings Inbox Menu';
const NOV4=[
 head('10:17','Yesterday')+card('8.07','11:25 PM','14 min 43 sec · 6.23 mi','$0.38 Pro Perk')+'139\nBaltimore\n'+card('10.03','10:51 PM','15 min 39 sec · 10.34 mi','$0.48 Pro Perk')+card('15.84','10:49 PM','23 min 57 sec · 17.93 mi','$0.75 Pro Perk')+tabs,
 head('10:18','Yesterday')+card('6.08','10:15 PM','12 min 40 sec · 4.27 mi','$0.29 Pro Perk')+card('11.08','10:02 PM','18 min 16 sec · 7.94 mi','$0.53 Pro Perk')+card('7.58','9:35 PM','11 min 32 sec · 2.38 mi','$0.36 Pro Perk',true)+tabs,
 head('10:18','Yesterday')+card('22.58','8:43 PM','43 min 35 sec · 5.78 mi','$5.28 Delayed ride guarantee $1.08 Pro Perk',true)+card('5.18','8:29 PM','7 min 7 sec · 1.23 mi','$0.25 Pro Perk')+card('8.06','8:16 PM','8 min 20 sec · 3.01 mi','$0.38 Pro Perk')+tabs,
 head('10:18','Yesterday')+'$3.81 8:08 PM\nUberX · Customer canceled\nE MADISON ST\nSample Ct, Baltimore, MD, USA\n'+card('9.43','7:34 PM','20 min 47 sec · 7.33 mi','$0.45 Pro Perk',true)+'$0.00 7:15 PM\nUberX · Customer canceled\n'+tabs,
 head('10:19','Yesterday')+card('10.16','7:10 PM','21 min 41 sec · 7.19 mi','$0.48 Pro Perk',true)+card('6.08','8:52 AM','10 min 39 sec · 3.29 mi','$0.29 Pro Perk')+card('6.49','8:20 AM','5 min 44 sec · 1.30 mi','$0.31 Pro Perk',true)+tabs,
 head('10:19','Yesterday')+card('6.49','8:20 AM','5 min 44 sec · 1.30 mi','$0.31 Pro Perk',true)+'Wed, Nov 4\n'+card('14.78','7:51 AM','26 min 20 sec · 4.88 mi','$2.00 Surge $1.73 Delayed ride guarantee\n$0.70 Pro Perk',true)+tabs
];

test('Uber Earnings Activity (pay and time first) reads every trip with its own minutes and miles',()=>{
 const p=AI.parseScreenshotText(NOV4[2],{now});
 assert.deepEqual(p.trips.map(t=>[t.time,t.fare,t.minutes,t.miles]),[['8:43 PM',22.58,43.58,5.78],['8:29 PM',5.18,7.12,1.23],['8:16 PM',8.06,8.33,3.01]]);
 assert.ok(p.trips.every(t=>!t.flags.length),'no missing values');
 const c=AI.parseScreenshotText(NOV4[3],{now}).trips;
 assert.deepEqual(c.map(t=>[t.time,t.fare,t.canceled,t.include]),[['8:08 PM',3.81,true,true],['7:34 PM',9.43,false,true],['7:15 PM',0,true,false]]);
});

test('Pro Perk, surge and delayed-ride lines are part of the trip pay, never a trip of their own',()=>{
 const t=AI.parseScreenshotText(NOV4[5],{now}).trips.find(x=>x.time==='7:51 AM');
 assert.equal(t.fare,14.78);assert.equal(t.surge,2);assert.equal(t.minutes,26.33);assert.equal(t.miles,4.88);
});

test('Wed Nov 4: six overlapping screenshots add up to the day total Uber showed ($145.25)',()=>{
 const groups=AI.combineParsed(NOV4.map(t=>AI.parseScreenshotText(t,{now})));
 assert.equal(groups.length,1);assert.equal(groups[0].date,'2026-11-04');
 const paid=groups[0].trips.filter(t=>t.include&&!t.canceled);
 assert.equal(paid.length,14,'14 trips, as on the weekly view');
 assert.equal(groups[0].tripSum,145.25,'14 trips plus the $3.81 cancellation fee');
 const out=AI.toRecords(groups[0],{ledger:[]});
 assert.equal(out.tripRows.length,14);assert.equal(out.ledgerRows.length,15,'cancellation fee kept as earnings');
 assert.ok(out.tripRows.every(r=>!('origin' in r)&&!('destination' in r)),'no street lines are stored');
 const miles=out.tripRows.reduce((s,r)=>s+r.trip_distance,0);assert.equal(Math.round(miles*100)/100,83.1);
});

test('the date filter chip ("11/5") and "Yesterday" give the day when no date header shows',()=>{
 assert.equal(AI.parseScreenshotText(head('10:15','11/5')+card('13.31','9:04 AM','24 min 51 sec · 10.74 mi'),{now}).date,'2026-11-05');
 assert.equal(AI.parseScreenshotText(NOV4[0],{now}).date,'2026-11-04');
 assert.equal(AI.parseScreenshotText('UberX $7.73\n6:50 AM\n9 min 29 sec 1.90 mi 11/5',{now}).date,null,'only on the Earnings Activity screen');
});

test('trip CSV shows pay after gas when price and mpg are known',()=>{
 const rows=[{record_id:'a',platform:'Uber',request_time:'2026-11-05T14:04:00Z',fare:13.31,trip_time:24.85,trip_distance:10.74,surge:null,source:'screenshot'},
  {record_id:'b',platform:'Uber',request_time:'2026-11-05T12:53:00Z',fare:10.07,trip_time:16.82,trip_distance:5.06,surge:1.75,source:'screenshot'}];
 // Nov 5 Shell receipt: $45.72 for 11.848 gal = $3.859/gal; 22 mpg is an example.
 const [h,b,a]=AI.tripsCsv(rows,'America/New_York',{gasPerMile:45.72/11.848/22}).trim().split('\n');
 assert.equal(h,'date,time,platform,pay,minutes_with_rider,miles,pay_per_mile,pay_per_hour,record_id,source,surge,gas_cost_rider_miles,net_pay,net_per_mile,net_per_hour');
 assert.equal(b,'2026-11-05,7:53 AM,Uber,10.07,16.82,5.06,1.99,35.92,b,screenshot,1.75,0.89,9.18,1.81,32.75');
 assert.equal(a,'2026-11-05,9:04 AM,Uber,13.31,24.85,10.74,1.24,32.14,a,screenshot,,1.88,11.43,1.06,27.6');
 assert.match(AI.tripsCsv(rows).split('\n')[1],/,screenshot,1\.75,,,,$/,'gas columns stay empty without price and mpg');
});

test('Thu Nov 5: three screenshots taken at 11:08 AM add up to the $75.08 day total',()=>{
 const NOV5=[
  head('11:08','11/5')+card('13.31','9:04 AM','24 min 51 sec · 10.74 mi','',true)+card('8.18','8:33 AM','11 min 36 sec · 1.47 mi','$0.39 Pro Perk',true)+card('10.07','7:53 AM','16 min 49 sec · 5.06 mi','$1.75 Surge $0.48 Pro Perk')+tabs,
  head('11:08','11/5')+card('19.33','7:37 AM','27 min 40 sec · 7.13 mi','$3.75 Surge $0.92 Pro Perk',true)+card('9.16','6:45 AM','10 min 42 sec · 4.24 mi','$0.44 Pro Perk',true)+card('9.01','6:21 AM','13 min 36 sec · 3.94 mi','$0.43 Pro Perk')+tabs,
  head('11:08','11/5')+'Sample Ct, Baltimore, MD, USA\n'+card('9.01','6:21 AM','13 min 36 sec · 3.94 mi','$0.43 Pro Perk')+card('6.02','6:15 AM','10 min 4 sec · 2.82 mi','$0.29 Pro Perk')+'End of activities during Nov 5, 2026 - Nov 5, 2026\n'+tabs
 ];
 const groups=AI.combineParsed(NOV5.map(t=>AI.parseScreenshotText(t,{now})));
 assert.equal(groups.length,1);assert.equal(groups[0].date,'2026-11-05');
 assert.equal(groups[0].trips.length,7,'the 6:21 AM trip on two screenshots counts once');
 assert.equal(groups[0].tripSum,75.08);
 assert.deepEqual(groups[0].trips.filter(t=>t.surge).map(t=>[t.time,t.surge]),[['7:37 AM',3.75],['7:53 AM',1.75]]);
});
