import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { deleteAccountHandler } from '../supabase/functions/delete-account/handler.mjs';
const require=createRequire(import.meta.url);
const {canSync,areaAt,forecastRecords}=require('../dist/homebase-growth.js');

test('device owner must explicitly match the signed-in account before automatic upload',()=>{
  assert.equal(canSync(null,'alice'),false);assert.equal(canSync('bob','alice'),false);
  assert.equal(canSync('alice','alice'),true);assert.equal(canSync('alice',null),false);
});
test('collection derives neighborhoods, excludes holes and does not return precise coordinates',()=>{
  const features=[{properties:{areaType:'neighborhood',areaName:'Test'},geometry:{type:'Polygon',coordinates:[[[0,0],[3,0],[3,3],[0,3],[0,0]],[[1,1],[2,1],[2,2],[1,2],[1,1]]]}}];
  assert.equal(areaAt(features,.5,.5),'Test');assert.equal(areaAt(features,1.5,1.5),null);assert.equal(areaAt(features,8,8),null);
});
test('displayed estimates are timestamped future snapshots, not asserted probabilities or trained horizon models',()=>{
  let i=0;const rows=forecastRecords({area:'Midtown',apps:[{name:'Uber'}],rates:[30],now:0,uuid:()=>String(++i)});
  assert.deepEqual(rows.map(r=>r.horizon_minutes),[15,30,60]);
  assert.equal(rows[0].forecast_for,'1970-01-01T00:15:00.000Z');
  assert.ok(rows.every(r=>!('lat' in r)&&!('confidence' in r)));
  assert.deepEqual(forecastRecords({area:null,apps:[],rates:[],uuid:()=>''}),[]);
});

function handler({valid=true,connections=[],failSignOut=false}={}) {
  const calls=[];const client={auth:{getUser:async()=>({data:{user:valid?{id:'alice'}:null}}),admin:{
    signOut:async()=>{calls.push('revoke');return {error:failSignOut?new Error('failed'):null};},
    deleteUser:async id=>{calls.push('delete:'+id);return {};}}},
    from:()=>({select:()=>({eq:async()=>({data:connections})})})};
  return {calls,run:deleteAccountHandler(()=>client,()=> 'configured')};
}
const request=body=>new Request('https://test/delete-account',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify(body)});
test('account deletion requires confirmation and a verified user',async()=>{
  const h=handler();assert.equal((await h.run(request({}))).status,400);assert.equal(h.calls.length,0);
  const bad=handler({valid:false});assert.equal((await bad.run(request({confirmation:'DELETE',user_id:'bob'}))).status,401);assert.equal(bad.calls.length,0);
});
test('active providers block deletion; sessions revoke before verified identity deletion',async()=>{
  const blocked=handler({connections:[{status:'connected'}]});assert.equal((await blocked.run(request({confirmation:'DELETE'}))).status,409);assert.deepEqual(blocked.calls,[]);
  const ok=handler();assert.equal((await ok.run(request({confirmation:'DELETE',user_id:'bob'}))).status,200);assert.deepEqual(ok.calls,['revoke','delete:alice']);
  const failed=handler({failSignOut:true});assert.equal((await failed.run(request({confirmation:'DELETE'}))).status,503);assert.deepEqual(failed.calls,['revoke']);
});
