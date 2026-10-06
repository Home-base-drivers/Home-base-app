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
 assert.match(html,/homebase-live-assistant\.js\?v=4/);
 assert.match(sw,/homebase-live-assistant\.js\?v=4/);
 assert.match(sw,/home-base-v\d+/);
});

function voiceHarness(getUser){
 const calls=[],messages=[];
 const ctx={document:{getElementById:id=>id==='navProfile'?{click:()=>calls.push('profile')}:null,querySelector:()=>({focus:()=>calls.push('focus')}),addEventListener:()=>{}},
  navigator:{mediaDevices:{getUserMedia:async()=>{calls.push('microphone');throw Error('Test microphone unavailable');}}},
  RTCPeerConnection:function(){},HomeBaseAccounts:{backend:{getUser:async()=>{calls.push('auth');return getUser();}}},
  HomeBaseCopilot:{toggleConversation:()=>calls.push('guest voice'),stopConversation:()=>calls.push('old voice stopped')},HomeBaseShell:{setVoiceStatus:text=>messages.push(text)},clearTimeout,setTimeout,Date};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(live,ctx);
 return{start:ctx.HomeBaseLiveAssistant.start,calls,messages,assistant:ctx.HomeBaseLiveAssistant};
}
test('missing Home Base session starts guest voice without opening Profile',async()=>{
 const h=voiceHarness(()=>{throw Object.assign(Error('Auth session missing!'),{name:'AuthSessionMissingError'});});
 await h.start();assert.deepEqual(h.calls,['auth','guest voice']);assert.equal(h.assistant.starting,false);
 assert.match(h.messages.at(-1),/no account needed/i);
});
test('anonymous identity can use guest voice without creating an account',async()=>{
 const h=voiceHarness(()=>({id:'anonymous',is_anonymous:true}));await h.start();assert.deepEqual(h.calls,['auth','guest voice']);
});
test('confirmed account upgrades to GPT Live while account lookup failures fall back to guest voice',async()=>{
 const h=voiceHarness(()=>({id:'driver'}));await h.start();assert.deepEqual(h.calls,['auth','old voice stopped','microphone','guest voice']);
 const failed=voiceHarness(()=>{throw Error('Network request failed');});await failed.start();assert.deepEqual(failed.calls,['auth','guest voice']);assert.match(failed.messages.at(-1),/no account needed/i);
});
