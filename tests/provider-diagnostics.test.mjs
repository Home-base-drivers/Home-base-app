import {test} from 'node:test';
import assert from 'node:assert/strict';
import {providerFailure,failureDetails} from '../supabase/functions/dispatch/errors.mjs';
import {makeDispatchHandler} from '../supabase/functions/dispatch/handler.mjs';
test('provider diagnostics preserve machine reasons without exposing the response message',()=>{
 const e=providerFailure(new Response('',{status:429,headers:{'x-request-id':'req_support123'}}),{error:{code:'insufficient_quota',message:'private input and secret credential',param:'model'}},'live-session');
 assert.match(e.message,/quota/);assert.doesNotMatch(e.message,/private input|secret credential/);
 assert.deepEqual(failureDetails(e),{code:'ai_provider_error',provider_status:429,provider_code:'insufficient_quota',provider_param:'model',provider_stage:'live-session',provider_request_id:'req_support123'});
 const bad=providerFailure(new Response('',{status:400}),{error:{code:'unsafe credential / text',param:'user@example.com'}},'responses');
 assert.equal(bad.provider_code,'unknown');assert.equal(bad.provider_param,undefined);
});
test('Live provider failures return 502 with a safe diagnostic and never become generic 400s',async()=>{
 const logs=[];const error=providerFailure(new Response('',{status:403}),{error:{code:'model_not_found',message:'private body'}},'live-session');
 const handler=makeDispatchHandler({engine:{},authenticate:async()=>({id:'driver'}),createLiveSession:async()=>{throw error},reportFailure:r=>logs.push(r)});
 const r=await handler(new Request('https://example.test/dispatch',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({operation:'live-session',sdp:'offer'})}));
 const b=await r.json();assert.equal(r.status,502);assert.equal(b.provider_code,'model_not_found');assert.ok(b.request_id);assert.equal(r.headers.get('cache-control'),'no-store');
 assert.equal(logs[0].operation,'live-session');assert.doesNotMatch(JSON.stringify(logs),/fixture|private body|driver/);
});
test('unconfigured Live is a service failure, not a successful session',async()=>{
 const handler=makeDispatchHandler({authenticate:async()=>({id:'driver'}),createLiveSession:async()=>({configured:false,error:'Not configured'})});
 const r=await handler(new Request('https://example.test/dispatch',{method:'POST',headers:{Authorization:'Bearer fixture'},body:'{"operation":"live-session"}'}));assert.equal(r.status,503);
});
