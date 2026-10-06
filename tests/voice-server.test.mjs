import {test} from 'node:test';
import assert from 'node:assert/strict';
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

test('AI voice rejects unsupported voice settings',async()=>{
 const synth=makeVoiceSynthesizer({apiKey:'test-key',fetchImpl:async()=>new Response()});
 await assert.rejects(()=>synth({text:'hello',locale:'xx-ZZ',voice:'cedar',style:'all'}),/Unsupported voice locale/);
 await assert.rejects(()=>synth({text:'hello',locale:'en-US',voice:'made-up',style:'all'}),/Unsupported AI voice/);
});

test('AI voice is disabled safely when the server key is absent',async()=>{
 const result=await makeVoiceSynthesizer({apiKey:''})({text:'hello',locale:'en-US',voice:'cedar',style:'all'});
 assert.deepEqual(result,{configured:false});
});
