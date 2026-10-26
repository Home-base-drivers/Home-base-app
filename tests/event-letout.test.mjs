// Event heat example: Ravens vs. Bengals, M&T Bank Stadium, Sun Oct 25 2026.
// Uber bonuses peaked 20-100 minutes after the final whistle across downtown,
// the harbor and the west side and faded about 2.5 hours later. Large venues
// keep that longer, wider departure window; small venues keep one hour.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const Policy=require('../dist/homebase-route-policy.js'),Heat=require('../dist/homebase-heat.js'),History=require('../dist/homebase-demand-history.js');
const end=Date.parse('2026-10-25T16:10:00-04:00'),at=min=>new Date(end+min*60000);
const game={name:'Bengals at Ravens',venue:'M&T Bank Stadium',eventStart:'2026-10-25T13:00:00-04:00',eventEnd:'2026-10-25T16:10:00-04:00',lat:39.278,lon:-76.6227,cat:'event',tags:{liveEvent:true},fetchedAt:new Date(end).toISOString()};
const club={...game,name:'Club show',venue:'Ottobar'};

test('a stadium let-out lasts about 2.5 hours and peaks 10-100 minutes after the final',()=>{
  assert.equal(Policy.venueClass(game),'stadium');
  assert.equal(Policy.eventPhase(game,at(100)),'exit');
  assert.equal(Policy.eventPhase(game,at(149)),'exit');
  assert.equal(Policy.eventPhase(game,at(151)),null);
  assert.equal(Policy.letOutStrength(game,at(30)),1);
  assert.ok(Policy.letOutStrength(game,at(130))<1&&Policy.letOutStrength(game,at(130))>0);
  assert.equal(Heat.currentEvidence(game,at(100),+at(100)),'event');
});
test('a small venue keeps the one-hour departure window',()=>{
  assert.equal(Policy.eventPhase(club,at(59)),'exit');
  assert.equal(Policy.eventPhase(club,at(61)),null);
});
test('stadium let-out heat spreads across surrounding neighborhoods',()=>{
  assert.ok(Heat.displayFootprintKm(game,'event',at(30))>=3.5);
  assert.ok(Heat.displayFootprintKm(game,'event',at(30))>Heat.displayFootprintKm(club,'event',at(30)));
});
test('heat and route policy use the same let-out profile',()=>{
  for(const s of [game,club])for(const m of [0,5,30,90,120,149,200])assert.equal(Heat.letOutStrength(s,at(m)),Policy.letOutStrength(s,at(m)));
});
test('the Oct 25 maps stay linked to the real game',()=>{
  const linked=History.observationRows().filter(r=>r.linked_event?.id==='nfl-20261025-cin-at-bal');
  assert.ok(linked.length>=7);
  assert.match(linked[0].linked_event.sourceUrl,/^https:\/\/www\.baltimoreravens\.com\//);
});
