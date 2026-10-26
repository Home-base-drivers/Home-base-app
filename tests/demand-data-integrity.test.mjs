// Demand data contract. Heat-map design changes (colors, blur, layout) must never
// remove or disconnect the data that feeds heat, events and the route. These tests
// fail if any update drops stored surge history, unhooks a data source, or leaves a
// market with no keyless event source.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {placeGame} from '../scripts/public-sports.mjs';
const require=createRequire(import.meta.url);
const loadHistory=require('./fixtures/load-history.cjs');
const History=require('../dist/homebase-demand-history.js');
const PublicData=require('../dist/homebase-public-data.js');
const RoutePolicy=require('../dist/homebase-route-policy.js');
const manifest=JSON.parse(fs.readFileSync(new URL('./fixtures/demand-history-manifest.json',import.meta.url)));
const markets=JSON.parse(fs.readFileSync(new URL('../config/provider-markets.json',import.meta.url))).markets;
const snapshot=JSON.parse(fs.readFileSync(new URL('./fixtures/provider-signals-baltimore.json',import.meta.url)));
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const BALTIMORE=[39.2904,-76.6122];

test('surge history is append-only: no stored record or observation is ever lost',()=>{
  const rows=loadHistory(),ids=new Set(rows.map(r=>r.id));
  const missing=manifest.ids.filter(id=>!ids.has(id));
  assert.deepEqual(missing,[],'Stored demand records were removed. Restore them; history must only grow.');
  const observations=rows.reduce((n,r)=>n+(r.area_observations||[]).length,0);
  assert.ok(observations>=manifest.minimumObservations,`observations fell from ${manifest.minimumObservations} to ${observations}`);
  assert.equal(new Set(rows.map(r=>r.id)).size,rows.length,'duplicate record ids');
});

test('stored history still feeds the heat map and the route',()=>{
  // Weekday 7:30 AM: the Empower west/east-side wave must produce recurring heat points.
  const when=new Date('2026-10-28T07:30:00-04:00');
  assert.ok(History.patternSources(when).length>=5,'recurring-pattern heat points disappeared');
  // After-school Uber pattern in the north county.
  assert.ok(History.forecastFor('Towson',new Date('2026-10-28T15:15:00-04:00'),true).distinctDates>=3);
  // A route stop with no dated event is allowed only with 2+ days of history; Mondawmin has them.
  const ev=RoutePolicy.generalEvidence({name:'Mondawmin',cat:'neighborhood',lat:39.3176,lon:-76.6594},{},when,{history:(s,w)=>History.forecastAt(s.lat,s.lon,w)});
  assert.equal(ev?.kind,'history');
});

test('published snapshot still yields events, places and school bells for Baltimore',()=>{
  const now=Date.parse(snapshot.generatedAt);
  assert.ok(PublicData.eventsForLocation(snapshot,...BALTIMORE,now).length>0,'no events from the snapshot');
  assert.ok(PublicData.placesForLocation(snapshot,...BALTIMORE,20,now).length>0,'no places from the snapshot');
  assert.ok(PublicData.bellTimesForLocation(snapshot,...BALTIMORE).length>0,'no school bells from the snapshot');
});

test('every market has an event source that works without a paid provider key',()=>{
  for(const m of markets){
    const keyless=(m.sportsVenues||[]).length>0||(m.publicCalendars||[]).some(c=>!/ticketmaster\.com/.test(c.url||''));
    assert.ok(keyless,`${m.id} has only Ticketmaster web listings, which fail without a key; add sports venues or another calendar`);
  }
});

test('New York and North Jersey games are placed at their real venues',()=>{
  for(const id of ['north-jersey','new-york']){
    const m=markets.find(x=>x.id===id);
    for(const venue of ['MetLife Stadium','Prudential Center','Madison Square Garden','Barclays Center','Yankee Stadium','Citi Field','UBS Arena','Sports Illustrated Stadium']){
      const placed=placeGame({name:'Game',venue,city:m.sportsVenues.find(v=>v.name===venue).city},m,[]);
      assert.ok(placed&&Number.isFinite(placed.lat),`${venue} not placed in ${id}`);
    }
  }
});

test('the app loads every data module, in order, before the map uses them',()=>{
  const order=['homebase-heat.js','homebase-demand-history.js','homebase-route-policy.js','homebase-public-data.js','homebase-sports.js','homebase-school-events.js'];
  const at=order.map(f=>html.indexOf('src="'+f));
  assert.ok(at.every(i=>i>0),'a data module script tag was removed');
  assert.deepEqual([...at].sort((a,b)=>a-b),at,'data module load order changed');
  // The heat renderer draws data; it must not hold or rewrite stored history.
  assert.ok(!fs.readFileSync(new URL('../dist/homebase-heat.js',import.meta.url),'utf8').includes('SCREENSHOT_BENCHMARKS'));
});

test('all demand sources are re-checked every time the app is opened or comes back online',()=>{
  assert.match(html,/function recheckDemandSources\(\)/);
  assert.match(html,/addEventListener\('visibilitychange',\(\)=>\{if\(document\.visibilityState==='visible'\)recheckDemandSources\(\)\}\)/);
  assert.match(html,/addEventListener\('online',recheckDemandSources\)/);
  assert.match(html,/setTimeout\(autoRefreshGps,150\)/,'first-open refresh removed');
});

test('alerts shown only as "1h ago" count for their whole hour at full weight',()=>{
  // Monday Oct 26: Rosemont $17 arrived "1h ago" on a 9:52 AM capture (7:52-8:52 AM).
  const row=History.observationRows().find(r=>r.id.startsWith('empower-baltimore-20261026-')&&r.area_observations.some(o=>o.shown_usd===17));
  assert.ok(row,'Rosemont $17 record');
  assert.equal(row.notifications[0].earliest,'2026-10-26T07:52:00-04:00');
  const early=History.forecastAt(39.3065,-76.653,new Date('2026-11-02T07:55:00-05:00')),late=History.forecastAt(39.3065,-76.653,new Date('2026-11-02T08:45:00-05:00'));
  assert.ok(early.strength>0&&late.strength>0,'both ends of the hour see the pattern');
});
