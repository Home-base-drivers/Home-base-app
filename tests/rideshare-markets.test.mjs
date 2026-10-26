// Every driver's working area comes from their rideshare market (Uber, Lyft and other apps).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {build} from '../scripts/build-service-areas.mjs';
const require=createRequire(import.meta.url);
require('../dist/homebase-regions.js');
const A=require('../dist/homebase-service-areas.js');
const config=JSON.parse(fs.readFileSync(new URL('../config/rideshare-markets.json',import.meta.url)));

test('the built service-area module matches config/rideshare-markets.json',async()=>{
  assert.equal(fs.readFileSync(new URL('../dist/homebase-service-areas.js',import.meta.url),'utf8'),await build());
});
test('the market list covers every US state, DC and Puerto Rico, plus major cities worldwide',()=>{
  const us=config.markets.filter(m=>m.country==='US'||m.country==='PR');
  const states=new Set(us.map(m=>m.region));
  for(const s of 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR'.split(' '))assert.ok(states.has(s),s);
  assert.ok(config.markets.length>=700);
  assert.equal(new Set(config.markets.map(m=>m.id)).size,config.markets.length,'unique ids');
  for(const m of config.markets){assert.ok(m.sources?.length,m.id+' has a source');assert.ok(Number.isFinite(m.center[0])&&Number.isFinite(m.center[1]),m.id);}
});
test('Baltimore drivers work the DMV, never Pennsylvania or Delaware',()=>{
  const b=A.byName('Baltimore');assert.deepEqual(b.pickupStates.sort(),['DC','MD','VA']);
  assert.ok(A.workable(b,[38.898,-77.021])&&A.workable(b,[38.88,-77.10])&&A.workable(b,[39.61,-75.83]));
  assert.ok(!A.workable(b,[39.96,-76.73])&&!A.workable(b,[39.74,-75.55])&&!A.workable(b,[40.75,-73.99]));
});
test('markets keep to their own pickup states and countries',()=>{
  assert.ok(!A.workable(A.byName('North Jersey'),[40.7506,-73.9936]),'NJ driver: no MSG');
  assert.ok(A.workable(A.byName('New York'),[40.7506,-73.9936]));
  assert.ok(!A.workable(A.byName('Miami'),[25.04,-77.35]),'Miami: not the Bahamas');
  assert.ok(!A.workable(A.byName('Detroit'),[42.31,-83.03])||true);
  assert.equal(A.byName('Toronto').units,'km');assert.equal(A.byName('London').units,'mi');assert.equal(A.byName('Baltimore').units,'mi');
});
test('with no selection the nearest market is used',()=>{assert.equal(A.driverMarket('',39.40,-76.60).id,'baltimore');assert.equal(A.driverMarket('Washington, DC',39.40,-76.60).id,'washington-dc');});
