import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const H=require('../dist/homebase-demand-history.js');
const Heat=require('../dist/homebase-heat.js');

test('signed-up Boost+ offers become confirmed surge heat only inside their window',()=>{
  const during=H.boostSources('2026-11-03T06:30:00-05:00');
  assert.ok(during.some(s=>/Towson/.test(s.name)&&s.tags.boostUsdPerHour===11));
  assert.ok(during.some(s=>/Inner Harbor/.test(s.name)));
  const s=during.find(x=>/Towson/.test(x.name));
  assert.equal(Heat.currentEvidence(s,'2026-11-03T06:30:00-05:00'),'surge');
  assert.ok(Heat.sourceStrength(s,'2026-11-03T06:30:00-05:00',()=>0)>=.9);
  assert.equal(Heat.sourceFootprintKm(s),1.3);
  assert.ok(H.boostSources('2026-11-03T04:50:00-05:00').some(x=>/Towson/.test(x.name)),'shows 15 minutes early');
  assert.equal(H.boostSources('2026-11-03T12:00:00-05:00').length,0);
  assert.equal(Heat.sourceStrength(s,'2026-11-03T12:00:00-05:00',()=>5),0);
});
test('surge is quantized to whole hexagons with crisp edges',()=>{
  const w=40,h=40,data=new Float32Array(w*h);
  for(let i=0;i<data.length;i++){const x=i%w,y=Math.floor(i/w),d=Math.hypot(x-20,y-20);data[i]=Math.max(0,1-d/14);}
  Heat.hexQuantize(data,w,h,i=>(i%w)*.05,i=>Math.floor(i/w)*.05);
  const cell=(x,y)=>Heat.hexCell(x*.05,y*.05,Heat.HEX_RADIUS_KM).join(',');
  const groups=new Map();for(let i=0;i<data.length;i++){const k=cell(i%w,Math.floor(i/w));(groups.get(k)||groups.set(k,new Set()).get(k)).add(data[i].toFixed(5));}
  for(const vals of groups.values())assert.equal(vals.size,1,'one value per hex');
  assert.ok(data[20*w+20]>.8);assert.equal(data[0],0,'weak tail drops out');
});
test('party holidays light nightlife, suburbs and campuses at full strength',()=>{
  const at='2026-10-31T22:00:00-04:00',src=H.holidaySources(at),names=src.map(s=>s.name).join('|');
  for(const area of ['Federal Hill','Cockeysville','Odenton','Towson University'])assert.match(names,new RegExp(area));
  const top=src.find(s=>/Federal Hill/.test(s.name));
  assert.equal(Heat.currentEvidence(top,at),'event');assert.equal(Heat.sourceStrength(top,at,()=>0),1);
  assert.ok(H.holidaySources('2026-11-25T23:00:00-05:00').some(s=>/Thanksgiving Eve/.test(s.name)));
  assert.ok(H.holidaySources('2027-01-01T00:45:00-05:00').some(s=>/New Year/.test(s.name)));
  assert.ok(H.holidaySources('2027-10-29T22:00:00-04:00').some(s=>/Halloween weekend/.test(s.name)),'next year Friday before Halloween');
  assert.equal(H.holidaySources('2026-11-04T15:00:00-05:00').length,0);
});
test('a party holiday outweighs a big single stadium event in strength',()=>{
  const hw=H.holidaySources('2026-10-31T22:00:00-04:00').find(s=>/Federal Hill/.test(s.name));
  assert.ok(hw.tags.holidayStrength>=.95);assert.equal(Heat.sourceFootprintKm(hw),1.4);
  const sub=H.holidaySources('2026-10-31T22:00:00-04:00').find(s=>/Cockeysville/.test(s.name));assert.equal(Heat.sourceFootprintKm(sub),2.4);
});
