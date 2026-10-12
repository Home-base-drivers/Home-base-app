import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const E=createRequire(import.meta.url)('../dist/homebase-earnings.js');
const csv=`Date,Original Date,Account Type,Account Name,Account Number,Institution Name,Name,Custom Name,Amount,Description,Category,Note,Ignored From,Tax Deductible,Transaction Tags
2026-08-04,,Credit,Card,1,Bank,Shell,,57.62,,Auto & Transport,,,,
2026-08-10,,Credit,Card,1,Bank,GIANT 0317,,30.93,,Groceries,,,,
2026-08-11,,Credit,Card,1,Bank,"FRANKLIN STREET CROWN",,49.47,,Auto & Transport,,,,
2026-08-14,,Credit,Card,1,Bank,ROYAL FARMS #340,,40.23,,Shopping,,,,
2026-08-15,,Credit,Card,1,Bank,ROYAL FARMS #63,,5.57,,Shopping,,,,
2026-08-17,,Cash,Chk,1,Bank,CarMax,,404.80,,Auto & Transport,,,,
2026-08-21,,Credit,Card,1,Bank,GOVANS CAR WASH,,15.00,,Auto & Transport,,,,
2026-08-22,,Cash,Chk,1,Bank,Payment Thank You,,-500,,Credit Card Payment,,,,
2026-09-01,,Credit,Card,1,Bank,DRIVEEZMD MPC,,63.30,,Auto & Transport,,,,
2026-09-04,,Cash,Chk,1,Bank,Rent payment,,1200,,Rent,,,,`;
test('only car and gas rows are kept from a Rocket Money CSV',()=>{
  const rows=E.carExpensesFromCsv(csv);
  assert.deepEqual(rows.map(r=>r.type),['Gas','Gas','Gas','Car payment','Car wash','Tolls']);
  assert.ok(!rows.some(r=>/GIANT|Rent|Payment Thank/.test(r.merchant)));
  assert.deepEqual(Object.keys(rows[0]).sort(),['amount','date','merchant','type']);
});
test('gas per mile pro-rates miles to the last date in the file; full day net',()=>{
  const rows=E.carExpensesFromCsv(csv);
  const r=E.carCostSummary(rows,{from:'2026-08-01',miles:9000,milesAsOf:'2026-10-12',washMonthly:120,dayEarned:364.29,dayHours:12.72,dayMiles:250,fullTimeDays:22});
  assert.equal(r.end,'2026-09-01');assert.equal(r.gas.toFixed(2),'147.32');
  assert.equal(Math.round(r.windowMiles),Math.round(9000*32/73));
  assert.equal(r.fixedMonthly.toFixed(2),'524.80');
  assert.ok(r.day.netRate<r.day.grossRate);
});
test('left-out rows, price/mpg and fill-based day gas',()=>{
  const rows=E.carExpensesFromCsv(csv),payment=rows.find(r=>r.type==='Car payment');
  const r=E.carCostSummary(rows,{from:'2026-08-01',exclude:[E.carKey(payment)],washMonthly:120,gasPrice:4.25,mpg:19,dayEarned:364.29,dayHours:12.72,fillCost:57.5});
  assert.equal(r.byType['Car payment'],undefined);assert.equal(r.fixedMonthly,120);
  assert.equal(r.gasPerMile.toFixed(4),'0.2237');
  assert.equal(r.day.gas.toFixed(2),(57.5*12.72/12).toFixed(2));
});
test('car costs are measured against the 20% of gross limit',()=>{
  const rows=E.carExpensesFromCsv(csv),payment=rows.find(r=>r.type==='Car payment');
  const r=E.carCostSummary(rows,{from:'2026-08-01',exclude:[E.carKey(payment)],washMonthly:120,dayEarned:364.29,dayHours:12.72,fillCost:57.5,costTarget:20});
  assert.equal(r.costTarget,20);assert.ok(r.day.costShare>0.15&&r.day.costShare<0.25);
  assert.equal(r.day.costs.toFixed(2),(r.day.gas+r.day.fixed+r.day.repairs).toFixed(2));
});
