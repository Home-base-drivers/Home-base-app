import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const earnings=require('../dist/homebase-earnings.js');
const now=new Date('2026-10-01T20:37:00Z');
const row=(date,value,extras={})=>({id:date+':'+value,date,platform:'Uber',earnings:value,payType:'gross',hoursType:'unknown',hours:null,trips:null,...extras});
const view=(rows,options={})=>earnings.historyView(rows,{now,timezone:'America/New_York',...options});

test('current week starts Monday and includes September rows across the month boundary',()=>{
  const result=view([row('2026-09-27',10),row('2026-09-28',20),row('2026-10-01',30)]);
  assert.equal(result.start,'2026-09-28');assert.equal(result.totals.gross,50);
  assert.equal(view(result.rows,{period:'month'}).totals.gross,30);
});
test('year and all history have independent bounds',()=>{
  const rows=[row('2025-12-31',10),row('2026-01-01',20),row('2026-10-01',30)];
  assert.equal(view(rows,{period:'year'}).totals.gross,50);
  assert.equal(view(rows,{period:'all'}).totals.gross,60);
});
test('precise timestamps use the market day instead of UTC or the source date',()=>{
  const result=view([row('2026-10-01',30,{timePrecision:true,startedAt:'2026-10-01T02:30:00Z'})],{period:'month'});
  assert.equal(result.rows.length,0);
  assert.equal(view([row('2026-10-01',30,{timePrecision:true,startedAt:'2026-10-01T02:30:00Z'})]).rows[0].displayDate,'2026-09-30');
});
test('day and week boundaries remain correct across daylight saving time',()=>{
  assert.equal(earnings.dayKey('2026-11-01T03:30:00Z','America/New_York'),'2026-10-31');
  assert.equal(earnings.dayKey('2026-11-01T06:30:00Z','America/New_York'),'2026-11-01');
  assert.equal(earnings.periodStart('week','2026-11-02'),'2026-11-02');
});
test('payouts stay separate from gross and cannot train the gross online hourly rate',()=>{
  const result=view([row('2026-10-01',80,{hoursType:'online',hours:2,trips:4}),row('2026-10-01',70,{payType:'payout',hoursType:'online',hours:2,trips:4})]);
  assert.equal(result.totals.gross,80);assert.equal(result.totals.payout,70);
  assert.equal(result.totals.onlineHours,2);assert.equal(result.hourlyRate,40);
  assert.equal(result.totals.trips,4);
});
test('active and unknown durations are excluded from online rates',()=>{
  const result=view([row('2026-10-01',30,{hoursType:'active',hours:1}),row('2026-10-01',50,{hours:2})]);
  assert.equal(result.totals.gross,80);assert.equal(result.totals.onlineHours,0);assert.equal(result.hourlyRate,null);
});
test('missing metrics are distinct from explicitly recorded zero values',()=>{
  const missing=view([row('2026-10-01',20)]),zero=view([row('2026-10-01',0,{trips:0,payType:'payout'})]);
  assert.equal(missing.totals.hasTrips,false);assert.equal(missing.totals.hasPayout,false);
  assert.equal(zero.totals.hasPayout,true);assert.equal(zero.totals.hasGross,false);
  assert.equal(view([row('2026-10-01',0,{trips:0})]).totals.hasTrips,true);
});
test('undated and invalid calendar dates appear only in all history',()=>{
  const rows=[row(null,10),row('2026-02-30',20),row('2026-10-01',30)];
  assert.equal(view(rows).totals.gross,30);assert.equal(view(rows).undated,2);
  assert.equal(view(rows,{period:'all'}).totals.gross,60);
});
test('future days and future precise records cannot inflate recorded totals',()=>{
  const result=view([row('2026-10-02',100),row('2026-10-01',50,{timePrecision:true,startedAt:'2026-10-01T22:00:00Z'}),row('2026-10-01',20)],{period:'all'});
  assert.equal(result.future,2);assert.equal(result.totals.gross,20);
});
test('platform filters, monthly grouping, and negative corrections retain their meanings',()=>{
  const rows=[row('2026-09-29',40),row('2026-10-01',-5),row('2026-10-01',90,{platform:'Lyft'})];
  const result=view(rows,{platform:'Uber'});
  assert.equal(result.totals.gross,35);assert.deepEqual(result.platforms,['Lyft','Uber']);
  assert.equal(result.months['2026-10'].gross,-5);assert.equal(result.perPlatform.Uber.gross,35);
});
test('invalid saved period falls back to the current week',()=>{
  assert.equal(view([row('2025-01-01',40)],{period:'constructor'}).period,'week');
  assert.equal(view([row('2025-01-01',40)],{period:'constructor'}).rows.length,0);
});
test('a missing GPS timezone uses the device timezone and keeps Earnings available',()=>{
  const result=earnings.historyView([row('2026-10-01',40)],{now,timezone:null});
  assert.equal(result.totals.gross,40);
  assert.equal(earnings.dayKey(now,null),earnings.dayKey(now,Intl.DateTimeFormat().resolvedOptions().timeZone));
});
