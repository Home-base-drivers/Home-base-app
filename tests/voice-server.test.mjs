import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeDispatchHandler} from '../supabase/functions/dispatch/handler.mjs';
import {makeVoiceSynthesizer} from '../supabase/functions/dispatch/voice.mjs';

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
