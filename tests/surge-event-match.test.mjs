import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const H=require('../dist/homebase-demand-history.js');
const loadHistory=require('./fixtures/load-history.cjs');
const row={id:'t',record_type:'uber_reference',captured_at:'2026-10-27T18:45:00-04:00',area_observations:[{area:'Downtown',band:'high',lat:39.285,lon:-76.62},{area:'Towson',band:'calm',lat:39.40,lon:-76.60}]};
const SIX={name:'SIX (Touring)',venue:'Hippodrome at France-Merrick Performing Arts Center',lat:39.2896,lon:-76.6213,eventStart:'2026-10-27T23:30:00.000Z'};

test('a surge is matched to a nearby event inside its arrival-to-let-out window',()=>{
  const [m]=H.matchEvents(row,[SIX]);
  assert.equal(m.name,'SIX (Touring)');assert.equal(m.phase,'arrivals');assert.ok(m.distanceKm<1);
  assert.equal(H.matchEvents({...row,captured_at:'2026-10-27T22:00:00-04:00'},[SIX])[0].phase,'during');
  assert.equal(H.matchEvents({...row,captured_at:'2026-10-27T23:45:00-04:00'},[SIX])[0].phase,'let-out');
});
test('far, out-of-window, calm-area and campus-room events are not matched',()=>{
  assert.equal(H.matchEvents({...row,captured_at:'2026-10-27T15:00:00-04:00'},[SIX]).length,0);
  assert.equal(H.matchEvents(row,[{...SIX,lat:39.50,lon:-76.30}]).length,0);
  assert.equal(H.matchEvents(row,[{...SIX,lat:39.401,lon:-76.601}]).length,0,'only the calm Towson area is near');
  assert.equal(H.matchEvents(row,[{...SIX,name:'Study with a Buddy',venue:'University Union'}]).length,0);
});
test('stored matches load onto records and never replace hand-checked links',()=>{
  const rows=loadHistory(),src=fs.readFileSync(new URL('../dist/homebase-demand-history.js',import.meta.url),'utf8');
  const links=JSON.parse(src.match(/const EVENT_LINKS=(\{.*?\});\n/s)[1]);
  const id=Object.keys(links).find(k=>rows.find(r=>r.id===k)?.linked_event);
  assert.ok(id,'a hand-linked record also has auto matches');
  const r=rows.find(x=>x.id===id);assert.ok(r.linked_event.name&&r.matched_events.length);
  assert.ok(rows.find(x=>x.id==='uber-baltimore-20261027-1845').matched_events.some(e=>e.name==='SIX (Touring)'));
});
test('event history is append-only, sorted and has coordinates',()=>{
  const h=JSON.parse(fs.readFileSync(new URL('../config/event-history.json',import.meta.url),'utf8'));
  assert.ok(h.events.length>=800);
  for(let i=1;i<h.events.length;i++)assert.ok(h.events[i-1].eventStart<=h.events[i].eventStart);
  assert.ok(h.events.every(e=>Number.isFinite(e.lat)&&Number.isFinite(e.lon)&&e.name));
});
test('all-day calendar listings do not match the next morning',()=>{
  const allDay={name:'Leftover Salmon',venue:'Nevermore Hall',lat:39.28936,lon:-76.60689,eventStart:'2026-10-31T02:00:00.000Z',eventEnd:'2026-11-01T02:00:00.000Z'};
  const r={...row,captured_at:'2026-10-31T06:54:00-04:00'};
  assert.equal(H.matchEvents(r,[allDay]).length,0);
  assert.equal(H.matchEvents({...r,captured_at:'2026-10-30T23:00:00-04:00'},[allDay])[0].phase,'during');
});
