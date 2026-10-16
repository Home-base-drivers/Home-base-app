import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const AI=createRequire(import.meta.url)('../dist/homebase-internal-ai.js');
const now=new Date('2026-10-10T22:00:00-04:00');

const UBER=`Sat, Oct 10
Today's earnings $346.80
UberX
6:50 AM
$7.73
9 min 29 sec · 1.90 mi
UberX
7:11 AM
$8.03
11 min 32 sec 6.23 mi
Comfort 7:33 AM $7.37 10 min 58 sec 3.38 mi
Tip $5.00
8:00 AM
Canceled by rider
$0.00
9:12 AM
$10.04
16 min 52 sec`;

test('reads an Uber activity screenshot into trips without guessing',()=>{
 const p=AI.parseScreenshotText(UBER,{now});
 assert.equal(p.platform,'Uber');assert.equal(p.date,'2026-10-10');assert.equal(p.dayTotal,346.8);
 assert.equal(p.trips.length,5);
 assert.deepEqual(p.trips.slice(0,3).map(t=>[t.time,t.fare,t.minutes,t.miles]),[['6:50 AM',7.73,9.48,1.9],['7:11 AM',8.03,11.53,6.23],['7:33 AM',7.37,10.97,3.38]]);
 assert.equal(p.extras[0].amount,5);
 const cancel=p.trips[3];assert.equal(cancel.canceled,true);assert.equal(cancel.include,false);
 const last=p.trips[4];assert.equal(last.miles,null,'missing miles stay empty');assert.ok(last.flags.includes('miles not found'));
});

test('saved trips use the same stable IDs as recovered history, so rereading never duplicates',()=>{
 const p=AI.parseScreenshotText(UBER,{now});
 const out=AI.toRecords(p,{ledger:[]});
 assert.equal(out.tripRows[0].record_id,'screenshot-uber-20261010-0650');
 assert.equal(out.tripRows[0].request_time,'2026-10-10T10:50:00.000Z','6:50 AM Eastern');
 assert.equal(out.tripRows.length,4);assert.equal(out.ledgerRows.length,4);
 assert.equal(out.ledgerRows[0].hoursType,'active');assert.equal(out.ledgerRows[3].miles,null);
 const again=AI.toRecords(AI.parseScreenshotText(UBER,{now}),{ledger:[]});
 assert.deepEqual(again.tripRows.map(r=>r.record_id),out.tripRows.map(r=>r.record_id));
});

test('a day already recorded as a total keeps trips as detail only (no double counting)',()=>{
 const ledger=[{id:'recovered-uber-20261010-day',platform:'Uber',date:'2026-10-10',timePrecision:false,earnings:346.8,trips:34,hours:12.72,hoursType:'online',payType:'gross'}];
 const out=AI.toRecords(AI.parseScreenshotText(UBER,{now}),{ledger});
 assert.equal(out.daySummary,true);assert.equal(out.ledgerRows.length,0);assert.equal(out.tripRows.length,4);
});

test('Empower and dates are detected; a date is required before saving',()=>{
 const p=AI.parseScreenshotText('Empower\n2:15 PM\n$17.49\n25 min 4.1 mi',{now});
 assert.equal(p.platform,'Empower');assert.equal(p.date,null);
 assert.throws(()=>AI.toRecords(p),/date/);
});

const records=[
 {id:'d',platform:'Uber',date:'2026-10-10',timePrecision:false,earnings:346.8,trips:34,hours:12.72,hoursType:'online',payType:'gross',miles:186.36},
 {id:'e',platform:'Empower',date:'2026-10-10',timePrecision:false,earnings:17.49,trips:1,hours:.42,hoursType:'active',payType:'gross'},
 {id:'u8',platform:'Uber',date:'2026-10-08',startedAt:'2026-10-08T23:13:00Z',timePrecision:true,earnings:5.18,trips:1,hours:.1,hoursType:'active',payType:'gross',miles:1.46}
];
const tripRows=Array.from({length:34},(_,i)=>({record_id:'t'+i,platform:'Uber',request_time:new Date(Date.parse('2026-10-10T11:00:00Z')+i*1200000).toISOString(),fare:10,trip_time:13.87}));
const ctx={now,records,tripRows,goalPace:{goal:'100',gh:'3'},carInputs:{mpg:'19',price:'4.25',target:'20'},live:{zones:[{name:'Fells Point',score:.9},{name:'Canton',score:.5}],events:[{name:'Ravens game',start:'2026-10-11T13:00:00-04:00'}]}};

test('answers earnings questions from the driver records',()=>{
 const r=AI.answer('How much did I make today?',ctx);
 assert.equal(r.handled,true);assert.match(r.answer,/\$364\.29 gross today/);assert.match(r.answer,/35 trips/);assert.match(r.answer,/Uber \$346\.80/);
 assert.match(AI.answer('earnings this week',ctx).answer,/\$369\.47 gross for this week/);
 assert.match(AI.answer('what did I earn on oct 8',ctx).answer,/\$5\.18/);
});

test('judges a trip offer with the driver\'s own unpaid minutes and goal',()=>{
 const over=AI.overheadMinutes(records,tripRows);assert.ok(Math.abs(over-8.62)<.05,'learned from Saturday: (12.72h online - 7.86h rider) / 34 trips');
 const r=AI.answer('$14 for 9 miles, 20 minutes',ctx);
 assert.match(r.answer,/\$1\.56 per mile/);assert.match(r.answer,/9 unpaid minutes/);assert.match(r.answer,/below your \$33\.33\/hr goal pace/);
 const far=AI.answer('$22 for 21 miles to Hampstead, 30 min',ctx);assert.match(far.answer,/round trip/);assert.match(far.answer,/under the \$1\.50/);
});

test('goal pace, costs, where to go and unknowns',()=>{
 assert.match(AI.answer('am I on pace for my goal',{...ctx,live:{...ctx.live,shiftHours:12.72}}).answer,/\$28\.64\/hr/);
 assert.match(AI.answer('what does gas cost me today',ctx).answer,/\$0\.22 per mile/);
 assert.match(AI.answer('where should I go',ctx).answer,/Fells Point, Canton/);
 const u=AI.answer('write me a poem about traffic',ctx);assert.equal(u.handled,false);assert.match(u.answer,/Plus/);
 assert.match(AI.answer('help',ctx).answer,/screenshots/);
});

test('trip CSV export',()=>{
 const csv=AI.tripsCsv([{record_id:'a',platform:'Uber',request_time:'2026-10-10T10:50:00Z',fare:7.73,trip_time:9.48,trip_distance:1.9,source:'screenshot'}]);
 const [head,row]=csv.trim().split('\n');
 assert.equal(head,'date,time,platform,pay,minutes_with_rider,miles,pay_per_mile,pay_per_hour,record_id,source');
 assert.equal(row,'2026-10-10,6:50 AM,Uber,7.73,9.48,1.9,4.07,48.92,a,screenshot');
});

test('app wiring: free plan uses the built-in AI for chat and voice; Plus keeps GPT',()=>{
 const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'),sw=fs.readFileSync(new URL('../dist/sw.js',import.meta.url),'utf8');
 const chat=fs.readFileSync(new URL('../dist/homebase-chat.js',import.meta.url),'utf8'),copilot=fs.readFileSync(new URL('../dist/homebase-copilot.js',import.meta.url),'utf8');
 assert.ok(html.indexOf('homebase-internal-ai.js')<html.indexOf('homebase-copilot.js'));assert.match(sw,/homebase-internal-ai\.js\?v=\d+/);
 assert.match(chat,/data-engine="builtin"/);assert.match(chat,/data-engine="plus"/);assert.match(chat,/builtinReply/);
 assert.match(copilot,/const builtin=window\.HomeBaseInternalAI\?\.plan\?\.\(\)==='builtin'/);
 assert.match(copilot,/!builtin&&state\.aiUnderstanding&&window\.HomeBaseAgentBridge/);
});

test('a day split across several screenshots becomes one review with one date',()=>{
 const a=AI.parseScreenshotText('Sat, Oct 10\n$346.80\nToday\'s earnings\nUberX $7.73\n6:50 AM\n9 min 29 sec - 1.90 mi',{now});
 const b=AI.parseScreenshotText('UberX $8.03\n7:11 AM\n11 min 32 sec - 6.23 mi\nUberX $7.73\n6:50 AM\n9 min 29 sec - 1.90 mi',{now});
 const groups=AI.combineParsed([a,b]);
 assert.equal(groups.length,1);assert.equal(groups[0].date,'2026-10-10');assert.equal(groups[0].dayTotal,346.8);
 assert.deepEqual(groups[0].trips.map(t=>t.time),['6:50 AM','7:11 AM'],'overlapping rows counted once');
 const odd=AI.parseScreenshotText('UberX $10.04\n9112 AM\n1 min 52 sec : 10.46 mi',{now,date:'2026-10-10'});
 assert.equal(odd.trips[0].time,'9:12 AM');assert.ok(odd.trips[0].flags.includes('check minutes or miles'));
});
