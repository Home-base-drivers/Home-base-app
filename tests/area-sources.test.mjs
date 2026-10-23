import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {areaSourceRows,toCsv,loadConfig} from '../scripts/area-sources.mjs';
test('config/area-sources.csv lists every configured source (run npm run area:sources after adding one)',async()=>{
  const {config,sites}=await loadConfig();
  const committed=fs.readFileSync(new URL('../config/area-sources.csv',import.meta.url),'utf8');
  assert.equal(committed,toCsv(areaSourceRows(config,sites)),'area-sources.csv is out of date with the source configuration');
});
test('the live refresh publishes the area source status CSV',()=>{
  const wf=fs.readFileSync(new URL('../.github/workflows/live-signals.yml',import.meta.url),'utf8');
  assert.match(wf,/area-sources\.mjs --status dist\/provider-signals\.json "\$out\/area-sources-status\.csv"/);
  assert.match(wf,/git add provider-signals\.json area-sources-status\.csv/);
});
test('status rows report each calendar and venue with its item count',async()=>{
  const {config,sites}=await loadConfig();
  const snap={markets:[{id:'north-jersey',publicRecords:{sources:[{name:'Ticketmaster New York public calendar',status:'unavailable',eventCount:0}]},publicSports:{status:'active',fetchedAt:'2026-10-23T01:50:54Z',gamesSeen:18,events:[{lat:40.71179,lon:-73.72604}]}}]};
  const rows=areaSourceRows(config,sites,snap).filter(r=>r.market_id==='north-jersey');
  assert.equal(rows.find(r=>r.source_name==='UBS Arena').items,1);
  assert.equal(rows.find(r=>r.source_type==='event_calendar'&&/Ticketmaster/.test(r.source_name)).status,'unavailable');
});
