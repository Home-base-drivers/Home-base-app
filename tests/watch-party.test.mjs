import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const req=createRequire(import.meta.url),S=req('../dist/homebase-sports.js'),P=req('../dist/homebase-route-policy.js');
test('Ravens away game puts demand at Baltimore bar districts',()=>{
  const d=S.watchParties({name:'BAL @ HOU',league:'NFL'});
  assert.ok(d.length>=5);assert.ok(d.some(x=>x.name==='Federal Hill'));assert.equal(d[0].team,'Ravens');
});
test('home games and other teams are not watch parties',()=>{
  assert.equal(S.watchParties({name:'CIN @ BAL',league:'NFL'}).length,0);
  assert.equal(S.watchParties({name:'DAL @ NYG',league:'NFL'}).length,0);
  assert.equal(S.watchParties({name:'BAL @ NYY',league:'MLB'}).length,0);
});
test('watch party events get a demand boost but are not stadium-size',()=>{
  const e={cat:'event',eventStart:new Date().toISOString(),venue:'Federal Hill bars',name:'Ravens game at bars',tags:{watchParty:true,league:'Watch party'}};
  assert.deepEqual(P.eventSize(e),{major:false,bonus:5});
  assert.equal(P.crowdTier(e),'local');
});
