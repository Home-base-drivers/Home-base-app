import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const live=fs.readFileSync(new URL('../dist/homebase-live-assistant.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../dist/sw.js',import.meta.url),'utf8');

test('Homebase microphone is upgraded to GPT Live WebRTC',()=>{
 assert.match(live,/new RTCPeerConnection\(\)/);
 assert.match(live,/createDataChannel\('oai-events'\)/);
 assert.match(live,/getUserMedia/);
 assert.match(live,/operation:'live-session'/);
 assert.match(live,/window\.HomeBaseCopilot\.toggleConversation=start/);
});

test('GPT Live keeps user and assistant transcripts in Copilot history',()=>{
 assert.match(live,/session\.input_transcript\.delta/);
 assert.match(live,/session\.output_transcript\.delta/);
 assert.match(live,/HomeBaseShell\?\.logChat/);
});

test('GPT Live asset is versioned and cached by the PWA',()=>{
 assert.match(html,/homebase-live-assistant\.js\?v=\d+/);
 assert.match(sw,/homebase-live-assistant\.js\?v=\d+/);
 assert.match(sw,/home-base-v\d+/);
});

function voiceHarness(getUser,{mediaError=true,voiceMode='live',plan='plus',execute=async()=>({ok:false,confirmed:false,requested:true}),dispatch=async()=>({transport:{sdp:'answer'}})}={}){
 const calls=[],messages=[],sent=[];let peer;
 class Events{listeners=new Map();addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(fn)}removeEventListener(name,fn){this.listeners.get(name)?.delete(fn)}emit(name,event={}){for(const fn of this.listeners.get(name)||[])fn(event)}}
 class Peer extends Events{constructor(){super();peer=this;this.connectionState='new';this.iceGatheringState='complete';this.channel=new Events();this.channel.readyState='open';this.channel.send=s=>sent.push(JSON.parse(s));this.channel.close=()=>{this.channel.readyState='closed'}}addTrack(){}createDataChannel(){return this.channel}async createOffer(){return{type:'offer',sdp:'valid-offer'}}async setLocalDescription(d){this.localDescription=d}async setRemoteDescription(){calls.push('answer applied')}close(){this.connectionState='closed'}}
 const track={stop:()=>calls.push('track stopped')};
 const ctx={document:{getElementById:id=>id==='navProfile'?{click:()=>calls.push('profile')}:null,querySelector:()=>({focus:()=>calls.push('focus')}),addEventListener:()=>{}},
  navigator:{mediaDevices:{getUserMedia:async()=>{calls.push('microphone');if(mediaError)throw Error('Test microphone unavailable');return{getTracks:()=>[track]}}}},
  RTCPeerConnection:Peer,HomeBaseAccounts:{backend:{getUser:async()=>{calls.push('auth');return getUser();},evaluateDispatch:async(...a)=>{calls.push('dispatch:'+a[0].operation);return dispatch(...a)}}},
  HomeBaseAgentClient:{execute},HomeBaseCopilot:{toggleConversation:()=>calls.push('guest voice'),stopConversation:()=>calls.push('old voice stopped')},HomeBaseShell:{setVoiceStatus:text=>messages.push(text)},clearTimeout,setTimeout,setInterval:()=>0,clearInterval(){},Date,
  localStorage:{getItem:k=>k==='homeBaseVoicePrefs'?JSON.stringify({voiceMode}):null},HomeBaseInternalAI:{serverPlan:()=>plan,refreshEntitlement(){}}};
 ctx.document.body={append:()=>{}};ctx.document.createElement=()=>({setAttribute:()=>{},pause:()=>{},remove:()=>{},play:()=>Promise.resolve()});
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(live,ctx);
 return{start:ctx.HomeBaseLiveAssistant.start,stop:ctx.HomeBaseLiveAssistant.stop,calls,messages,sent,assistant:ctx.HomeBaseLiveAssistant,get peer(){return peer},event:e=>peer.channel.emit('message',{data:JSON.stringify(e)})};
}
test('missing Home Base session starts guest voice without opening Profile',async()=>{
 const h=voiceHarness(()=>{throw Object.assign(Error('Auth session missing!'),{name:'AuthSessionMissingError'});});
 await h.start();assert.deepEqual(h.calls,['auth','guest voice']);assert.equal(h.assistant.starting,false);
 assert.match(h.messages.at(-1),/no account needed/i);
});
test('anonymous identity can use guest voice without creating an account',async()=>{
 const h=voiceHarness(()=>({id:'anonymous',is_anonymous:true}));await h.start();assert.deepEqual(h.calls,['auth','guest voice']);
});
test('signed-in Live failures do not silently downgrade to phone voice',async()=>{
 const h=voiceHarness(()=>({id:'driver'}));await h.start();assert.deepEqual(h.calls,['auth','old voice stopped','microphone']);
 assert.equal(h.assistant.active,false);assert.match(h.messages.at(-1),/Test microphone unavailable.*retry/);
 const failed=voiceHarness(()=>{throw Error('Network request failed');});await failed.start();assert.deepEqual(failed.calls,['auth']);assert.doesNotMatch(failed.messages.at(-1),/no account needed/i);
});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('SDP answer alone cannot report Live connected; session event and WebRTC are required',async()=>{
 const h=voiceHarness(()=>({id:'driver'}),{mediaError:false});const starting=h.start();await tick();
 assert.ok(h.calls.includes('answer applied'));assert.equal(h.assistant.active,false);assert.equal(h.assistant.starting,true);
 h.event({type:'session.started'});await tick();assert.equal(h.assistant.active,false);
 h.peer.connectionState='connected';h.peer.emit('connectionstatechange');await starting;
 assert.equal(h.assistant.active,true);assert.match(h.messages.at(-1),/connected/);await h.stop();assert.ok(h.calls.includes('track stopped'));
});
test('stop during account lookup cannot later open the microphone',async()=>{
 let resolve;const h=voiceHarness(()=>new Promise(r=>{resolve=r}));const starting=h.start();await h.stop();resolve({id:'driver'});await starting;assert.deepEqual(h.calls,['auth']);assert.equal(h.assistant.active,false);
});
test('delegation validation failure closes Live without phone fallback',async()=>{
 const h=voiceHarness(()=>({id:'driver'}),{mediaError:false});const starting=h.start();await tick();h.event({type:'error',error:{code:'responses_validation_failed',message:'Model access rejected'}});await starting;
 assert.equal(h.assistant.active,false);assert.match(h.messages.at(-1),/Model access rejected/);assert.ok(!h.calls.includes('guest voice'));
});
test('Live tools share verified app actions and duplicate calls are not executed twice',async()=>{
 let executions=0;const h=voiceHarness(()=>({id:'driver'}),{mediaError:false,execute:async()=>{executions++;return{ok:false,confirmed:false,requested:true}}});const starting=h.start();await tick();h.peer.connectionState='connected';h.event({type:'session.started'});await starting;
 const event={type:'response.event',event:{type:'response.output_item.done',item:{type:'function_call',name:'homebase_action',call_id:'call-1',arguments:'{"action":"refresh_location"}'}}};h.event(event);h.event(event);await tick();
 assert.equal(executions,1);const tool=h.sent.find(e=>e.type==='response.item.create');assert.equal(JSON.parse(tool.item.output).confirmed,false);await h.stop();
});
test('hybrid voice (default) and free plans talk on the phone without opening GPT Live',async()=>{
 const hybrid=voiceHarness(()=>({id:'driver'}),{voiceMode:'hybrid'});await hybrid.start();assert.deepEqual(hybrid.calls,['guest voice']);assert.match(hybrid.messages.at(-1),/let's talk/);
 const free=voiceHarness(()=>({id:'driver'}),{plan:'free'});await free.start();assert.deepEqual(free.calls,['guest voice']);
});
test('GPT Live reports its end to the meter, and a refused plan falls back to phone voice',async()=>{
 const h=voiceHarness(()=>({id:'driver'}),{mediaError:false,dispatch:async p=>p.operation==='live-session'?{transport:{sdp:'answer'},voiceSessionId:'11111111-2222-4333-8444-555555555555',maxSeconds:600}:{}});
 const starting=h.start();await tick();h.peer.connectionState='connected';h.event({type:'session.started'});await starting;
 assert.equal(h.assistant.active,true);await h.stop();await tick();assert.ok(h.calls.includes('dispatch:live-end'));
 const refused=voiceHarness(()=>({id:'driver'}),{mediaError:false,dispatch:async()=>{throw Object.assign(Error('plan'),{code:'voice_minutes_used_up'})}});
 await refused.start();await tick();assert.ok(refused.calls.includes('guest voice'),'keeps talking on the phone');assert.ok(!refused.calls.includes('dispatch:live-end'));
});
