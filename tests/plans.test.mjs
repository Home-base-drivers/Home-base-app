import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeDispatchHandler} from '../supabase/functions/dispatch/handler.mjs';

function setup(plan,{liveFails=false,used=false}={}){
 const calls=[];
 const entitlements={
  allowance:async()=>({plan,remaining_seconds:plan==='pro'?15600:0}),
  claim:async(id,op)=>{calls.push('claim:'+op);return{usage_id:1,plan,web_searches:1};},release:async()=>{calls.push('release');},
  start:async()=>{calls.push('start');if(plan==='free')throw Error('plan_required');if(used)throw Error('voice_minutes_used_up');return{session_id:'11111111-2222-4333-8444-555555555555',max_seconds:7200,plan,remaining_seconds:7200};},
  heartbeat:async id=>{calls.push('heartbeat:'+id);return{open:true,seconds_left:7000};},
  end:async(id,reason)=>{calls.push('end:'+reason);return{plan,used_seconds:60};}
 };
 const handler=makeDispatchHandler({engine:{},authenticate:async()=>({id:'u1'}),loadState:async()=>({}),loadTrips:async()=>[],entitlements,
  agent:async()=>({answer:'GPT answer'}),synthesizeVoice:async()=>({configured:false}),
  createLiveSession:async()=>{if(liveFails)throw Object.assign(Error('down'),{code:'ai_provider_error'});return{configured:true,transport:{sdp:'answer'}};},reportFailure(){}});
 const call=body=>handler(new Request('https://x/dispatch',{method:'POST',headers:{Authorization:'Bearer t'},body:JSON.stringify(body)}));
 return{call,calls};
}

test('every plan gets Home Base AI (Claude) answers, counted; GPT voices are Pro only',async()=>{
 const free=setup('free');const r=await free.call({operation:'agent',utterance:'hi',channel:'chat'});
 assert.equal(r.status,200);assert.equal((await r.json()).answer,'GPT answer');assert.deepEqual(free.calls,['claim:agent']);
 const v=await free.call({operation:'voice',text:'hi'});assert.equal(v.status,402);const body=await v.json();assert.equal(body.code,'plan_required');assert.match(body.error,/Pro/);
 assert.equal((await setup('plus').call({operation:'voice',text:'hi'})).status,402,'GPT voices are Pro only');
 const pro=setup('pro');assert.equal((await pro.call({operation:'voice',text:'hi'})).status,200);assert.deepEqual(pro.calls,['claim:voice','release'],'no GPT voice configured: the message is given back');
});

test('GPT Live opens a metered session, refuses free/used-up, and never bills a failed start',async()=>{
 assert.equal((await (await setup('free').call({operation:'live-session',sdp:'x'.repeat(50)})).json()).code,'plan_required');
 const used=await setup('plus',{used:true}).call({operation:'live-session',sdp:'x'.repeat(50)});assert.equal(used.status,402);assert.equal((await used.json()).code,'voice_minutes_used_up');
 const plus=setup('plus');const r=await plus.call({operation:'live-session',sdp:'x'.repeat(50)});const body=await r.json();
 assert.equal(r.status,200);assert.equal(body.voiceSessionId,'11111111-2222-4333-8444-555555555555');assert.equal(body.maxSeconds,7200);
 const failing=setup('plus',{liveFails:true});const f=await failing.call({operation:'live-session',sdp:'x'.repeat(50)});
 assert.equal(f.status,502);assert.deepEqual(failing.calls,['start','end:failed']);
 const hb=await plus.call({operation:'live-heartbeat',voiceSessionId:body.voiceSessionId});assert.equal((await hb.json()).seconds_left,7000);
 await plus.call({operation:'live-end',voiceSessionId:body.voiceSessionId,reason:'idle'});assert.ok(plus.calls.includes('end:idle'));
 assert.equal((await plus.call({operation:'live-end',voiceSessionId:'not-a-session'})).status,400);
 assert.equal((await (await plus.call({operation:'allowance'})).json()).plan,'plus');
});

test('client: hybrid voice by default, metered GPT Live with idle and cap stops',()=>{
 const live=fs.readFileSync(new URL('../dist/homebase-live-assistant.js',import.meta.url),'utf8');
 assert.match(live,/IDLE_SECONDS=20/);assert.match(live,/operation:'live-end'/);assert.match(live,/operation:'live-heartbeat'/);
 assert.match(live,/voiceMode/);assert.match(live,/startLive/);
 const copilot=fs.readFileSync(new URL('../dist/homebase-copilot.js',import.meta.url),'utf8');
 assert.ok(copilot.includes("let'?s talk|go live"),'wake phrase opens GPT Live');
});
