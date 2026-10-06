import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeDispatchHandler} from '../supabase/functions/dispatch/handler.mjs';
import {makeVoiceSynthesizer} from '../supabase/functions/dispatch/voice.mjs';
import {makeLiveSessionCreator} from '../supabase/functions/dispatch/live.mjs';

test('AI voice sends Dominican accent and masculine presentation instructions',async()=>{
 let sent;
 const synth=makeVoiceSynthesizer({apiKey:'test-key',fetchImpl:async(url,options)=>{sent={url,body:JSON.parse(options.body)};return new Response(new Uint8Array([1,2,3]),{status:200,headers:{'content-type':'audio/mpeg'}})}});
 const result=await synth({text:'Hola desde Home Base.',locale:'es-DO',voice:'cedar',style:'masculine'});
 assert.equal(sent.url,'https://api.openai.com/v1/audio/speech');
 assert.equal(sent.body.model,'gpt-4o-mini-tts');
 assert.equal(sent.body.voice,'cedar');
 assert.match(sent.body.instructions,/Dominican Spanish/);
 assert.match(sent.body.instructions,/masculine vocal presentation/);
 assert.equal(result.contentType,'audio/mpeg');
 assert.equal(result.audio.length,3);
});

test('dispatch voice response is binary-safe for Supabase functions.invoke',async()=>{
 const handler=makeDispatchHandler({
  engine:{},
  authenticate:async()=>({id:'user-1',is_anonymous:false}),
  loadState:async()=>({}),
  loadTrips:async()=>[],
  synthesizeVoice:async()=>({configured:true,audio:new Uint8Array([1,2,3]),contentType:'audio/mpeg'})
 });
 const response=await handler(new Request('https://example.test/dispatch',{
  method:'POST',
  headers:{Authorization:'Bearer test-token','Content-Type':'application/json'},
  body:JSON.stringify({operation:'voice',text:'Hola',locale:'es-DO',voice:'cedar',style:'masculine'})
 }));
 assert.equal(response.status,200);
 assert.equal(response.headers.get('content-type'),'application/octet-stream');
 assert.equal(response.headers.get('x-homebase-audio-type'),'audio/mpeg');
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[1,2,3]);
});

test('AI voice rejects unsupported voice settings',async()=>{
 const synth=makeVoiceSynthesizer({apiKey:'test-key',fetchImpl:async()=>new Response()});
 await assert.rejects(()=>synth({text:'hello',locale:'xx-ZZ',voice:'cedar',style:'all'}),/Unsupported voice locale/);
 await assert.rejects(()=>synth({text:'hello',locale:'en-US',voice:'made-up',style:'all'}),/Unsupported AI voice/);
});

test('AI voice is disabled safely when the server key is absent',async()=>{
 const result=await makeVoiceSynthesizer({apiKey:''})({text:'hello',locale:'en-US',voice:'cedar',style:'all'});
 assert.deepEqual(result,{configured:false});
});


test('GPT Live creates a full-duplex multilingual session with Responses web search',async()=>{
 let sent;
 const create=makeLiveSessionCreator({apiKey:'test-key',fetchImpl:async(url,options)=>{sent={url,body:JSON.parse(options.body)};return new Response(JSON.stringify({session:{id:'live_test'},transport:{type:'webrtc',sdp:'answer-sdp'}}),{status:201,headers:{'content-type':'application/json'}})}});
 const result=await create({sdp:'v=0\\r\\no=- 123456789 2 IN IP4 127.0.0.1\\r\\ns=-\\r\\nt=0 0\\r\\n',locale:'es-DO',voice:'cedar',style:'masculine',history:[{role:'user',text:'Hola'}]});
 assert.equal(sent.url,'https://api.openai.com/v1/live/sessions');
 assert.equal(sent.body.session.model,'gpt-live-1');
 assert.equal(sent.body.session.delegation.type,'responses');
 assert.equal(sent.body.session.delegation.responses.model,'gpt-6-luna');
 assert.deepEqual(sent.body.session.delegation.responses.tools,[{type:'web_search'}]);
 assert.equal(sent.body.session.delegation.responses.tool_choice,'auto');
 assert.equal(sent.body.session.delegation.responses.parallel_tool_calls,true);
 assert.equal(sent.body.session.delegation.responses.max_output_tokens,1200);
 assert.equal(sent.body.session.delegation.tool_choice,undefined);
 assert.match(sent.body.session.instructions,/full duplex/i);
 assert.match(sent.body.session.instructions,/substantive request in another language/i);
 assert.equal(sent.body.transport.type,'webrtc');
 assert.equal(result.transport.sdp,'answer-sdp');
});

test('dispatch protects GPT Live behind authenticated Home Base session',async()=>{
 let livePayload;
 const handler=makeDispatchHandler({engine:{},authenticate:async()=>({id:'user-1',is_anonymous:false}),loadState:async()=>({}),loadTrips:async()=>[],createLiveSession:async payload=>(livePayload=payload,{configured:true,session:{id:'live_1'},transport:{type:'webrtc',sdp:'answer'}})});
 const response=await handler(new Request('https://example.test/dispatch',{method:'POST',headers:{Authorization:'Bearer test-token','Content-Type':'application/json'},body:JSON.stringify({operation:'live-session',sdp:'v=0 '+'.'.repeat(80),locale:'fr-FR',history:[]})}));
 assert.equal(response.status,200);assert.equal(livePayload.locale,'fr-FR');assert.equal((await response.json()).session.id,'live_1');
});
