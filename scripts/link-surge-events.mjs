#!/usr/bin/env node
// Matches every stored surge record (Uber maps, Empower alerts) to the events that were near
// its areas at that time, using the saved event calendars, and stores the matches in the
// EVENT_LINKS block of dist/homebase-demand-history.js. Run after every screenshot upload.
//
//   node scripts/link-surge-events.mjs [--add extra-snapshot.json ...] [--since 2026-10-01]
//
// Reads the machine-owned branches (origin/calendar-archive, origin/signals) plus any --add files.
// Live feeds drop events once they pass, so every event read is also saved to
// config/event-history.json (append-only) and matching always uses that full history.
// Append-only: existing matches are kept; hand-checked linked_event fields are never touched.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const args=process.argv.slice(2),flag=k=>{const i=args.indexOf(k);return i>=0?args.splice(i,2)[1]:null;};
const since=flag('--since'),extra=[];let a;while((a=flag('--add')))extra.push(a);
const git=ref=>{try{return JSON.parse(execFileSync('git',['show',ref],{encoding:'utf8',maxBuffer:1<<28}));}catch{return null;}};
const sources=[git('origin/calendar-archive:calendar-archive.json'),git('origin/signals:provider-signals.json'),...extra.map(f=>JSON.parse(fs.readFileSync(f,'utf8')))].filter(Boolean);
const histFile=new URL('../config/event-history.json',import.meta.url);
const hist=fs.existsSync(histFile)?JSON.parse(fs.readFileSync(histFile,'utf8')):{note:'Every public event Home Base has read (append-only), kept so past surges can be matched to events after live feeds drop them.',events:[]};
const norm=n=>String(n).toLowerCase().replace(/[\u2013\u2014-]/g,'-').replace(/\s+/g,' ').trim();
const key=e=>norm(e.name).trim()+'|'+new Date(e.eventStart).toISOString().slice(0,16)+'|'+Number(e.lat).toFixed(3);
const seen=new Set(hist.events.map(key));let saved=0;
const walk=o=>{if(Array.isArray(o))o.forEach(walk);else if(o&&typeof o==='object'){const st=o.eventStart||o.start;
  if(st&&Number.isFinite(Date.parse(st))&&Number.isFinite(Number(o.lat))&&Number.isFinite(Number(o.lon))&&(o.name||o.title)){
    const e={name:String(o.name||o.title).slice(0,160),venue:String(o.venue||o.venueName||'').slice(0,120),lat:+Number(o.lat).toFixed(6),lon:+Number(o.lon).toFixed(6),eventStart:new Date(st).toISOString(),eventEnd:o.eventEnd&&Number.isFinite(Date.parse(o.eventEnd))?new Date(o.eventEnd).toISOString():null,source:String(o.source||'').slice(0,60)};
    const k=key(e);if(!seen.has(k)){seen.add(k);hist.events.push(e);saved++;}}
  Object.values(o).forEach(walk);}};
sources.forEach(walk);
hist.events.sort((x,y)=>x.eventStart.localeCompare(y.eventStart));
fs.writeFileSync(histFile,JSON.stringify(hist));
const events=hist.events;
const rows=require('../tests/fixtures/load-history.cjs')();
const H=require('../dist/homebase-demand-history.js');
const file=new URL('../dist/homebase-demand-history.js',import.meta.url),src=fs.readFileSync(file,'utf8');
const m=src.match(/\/\* EVENT_LINKS:BEGIN \*\/\n  const EVENT_LINKS=(\{.*?\});\n  \/\* EVENT_LINKS:END \*\//s);
if(!m)throw Error('EVENT_LINKS block not found');
const links=JSON.parse(m[1]);let added=0,matchedRows=0;const report=[];
for(const row of rows){
  if(!['uber_reference','empower_reference'].includes(row.record_type)||!row.captured_at)continue;
  if(since&&row.captured_at<since)continue;
  const found=H.matchEvents(row,events);
  const hand=row.linked_event||(row.related_events||[]).length;
  if(found.length){matchedRows++;const have=links[row.id]||[],keys=new Set(have.map(e=>norm(e.name)+'|'+e.eventStart.slice(0,16)));
    for(const e of found){const k=norm(e.name)+'|'+e.eventStart.slice(0,16);if(!keys.has(k)){have.push(e);keys.add(k);added++;}}
    links[row.id]=have;}
  if(since)report.push(`${row.captured_at.slice(0,16)}  ${row.id.padEnd(58)} ${found.length?found.map(e=>`${e.name} @ ${e.venue} (${e.phase}, ${e.distanceKm} km)`).join('; '):hand?'(hand-linked)':row.cause_note?'no event: '+row.cause_note:'no event found'}`);
}
const sorted=Object.fromEntries(Object.entries(links).sort(([a],[b])=>a.localeCompare(b)));
fs.writeFileSync(file,src.replace(m[0],`/* EVENT_LINKS:BEGIN */\n  const EVENT_LINKS=${JSON.stringify(sorted)};\n  /* EVENT_LINKS:END */`));
console.log(`event history: ${events.length} (new ${saved}) · records with matches: ${matchedRows} · new links: ${added} · records linked in file: ${Object.keys(sorted).length}`);
if(report.length)console.log(report.join('\n'));
