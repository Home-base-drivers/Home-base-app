// Surge patterns are known values: computed once per weekday/5-minute slot, kept across
// launches until new surge data arrives, and established patterns read hot on the map.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const heat=require('../dist/homebase-heat.js');

test('an established pattern reads hot even without a live signal',()=>{
  const p=heat.composePixel(0,0,{},.6);assert.ok(p.level>=.7&&p.opacity>=.55,JSON.stringify(p));
  assert.ok(heat.composePixel(0,0,{},.6).level>heat.composePixel(0,0,{},.3).level);
  assert.equal(heat.composePixel(0,0,{current:1},.6).opacity,0,'fresh evidence still replaces history');
});
test('pattern values are stored for reuse and restored on the next launch',async()=>{
  const store=new Map();global.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
  try{
    const H=require('../dist/homebase-demand-history.js');
    const first=H.forecastAt(39.3065,-76.653,new Date('2026-11-02T07:30:00-05:00'));
    await new Promise(r=>setTimeout(r,3300));
    const saved=JSON.parse(store.get('homeBasePatternTable'));
    assert.ok(saved&&saved.signature&&saved.entries.length>0);
    assert.ok(saved.entries.some(([k])=>k.startsWith('a|39.3065,-76.6530|')));
    // Same weekday and time a week later: same known value.
    const again=H.forecastAt(39.3065,-76.653,new Date('2026-11-09T07:30:00-05:00'));
    assert.equal(again.strength,first.strength);
  }finally{delete global.localStorage;}
});
