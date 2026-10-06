import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {makeLanguageTranslator,makeLanguageParser} from '../supabase/functions/dispatch/language.mjs';
import {makeDispatchHandler} from '../supabase/functions/dispatch/handler.mjs';
const require=createRequire(import.meta.url),L=require('../dist/homebase-languages.js'),V=require('../dist/homebase-voice.js'),D=require('../dist/homebase-dispatch.js');
test('all 20 language choices have valid locales, native examples and six local commands',()=>{
 assert.equal(L.languages.length,20);assert.equal(new Set(L.languages.map(l=>l.id)).size,20);
 for(const l of L.languages){assert.ok(l.preview&&l.noVoice&&l.englishFallback&&l.paused);assert.equal(l.commands.length,6);for(const [locale] of l.regions)assert.equal(new Intl.Locale(locale).language,l.id);
  const types=['plan','why','mode','pause','resume','earnings'];l.commands.forEach((phrase,i)=>assert.equal(L.parseCommand('Home Base, '+phrase+'?',l.id)?.type,types[i],l.id+': '+phrase));
  assert.equal(L.localize('Copy. Recommendations paused.',l.id),l.id==='en'?'Copy. Recommendations paused.':l.paused);
 }
 assert.equal(L.get('ar-SA').dir,'rtl');assert.equal(L.get('ur-PK').dir,'rtl');
});
test('language detection and saved Dominican Spanish survive reload; corrupt preferences recover',()=>{
 assert.deepEqual(L.preferences({},['xx-XX','pt-BR']),{language:'pt',locale:'pt-BR',voiceURI:'',conversation:true});
 assert.equal(L.preferences({language:'es',locale:'es-DO',voiceURI:'saved',conversation:false},['en-US']).locale,'es-DO');
 assert.equal(L.preferences({language:'es',locale:'xx-XX'}).locale,'es-US');
 assert.equal(L.preferences({language:'unknown',locale:'xx'}).locale,'en-US');
 assert.equal(L.parseCommand('do not take me home','fr'),null);
});
test('voices never silently cross language and exact accent beats preferred names',()=>{
 const voices=[{name:'Alex',lang:'en-US',voiceURI:'us',default:true},{name:'Unlisted Voice',lang:'en-GB',voiceURI:'gb'}];
 assert.equal(V.selectVoice(voices,'','en-GB').voiceURI,'gb');assert.equal(V.selectVoice(voices,'us','hi-IN'),null);assert.equal(V.selectVoice([],'','es-DO'),null);
 assert.equal(V.normalizeLocale('zh_Hans_CN'),'zh-Hans-CN');
});
const mock=text=>async()=>new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify({text})}]}]}));
test('translation preserves source numbers and platform names, disables storage',async()=>{
 let body;
 const translate=makeLanguageTranslator({apiKey:'test',model:'test',fetchImpl:async(_,options)=>{body=JSON.parse(options.body);return mock('[[HB0]] : estimation de [[HB1]] dollars. Non vérifiée.')();}});
 const result=await translate('Uber: estimated 25.50 dollars. Unverified.','fr-FR');
 assert.equal(result.text,'Uber : estimation de 25.50 dollars. Non vérifiée.');assert.equal(result.translated,true);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.match(body.instructions,/uncertainty/);
});
test('translation rejects lost, duplicate and invented numeric values',async()=>{
 for(const text of ['25 dollars','[[HB0]] [[HB0]]','[[HB0]] plus 10','[[HB9]]']){
  const translate=makeLanguageTranslator({apiKey:'test',model:'test',fetchImpl:mock(text)});
  await assert.rejects(()=>translate('Estimated 25 dollars.','es-DO'));
 }
});
test('unconfigured translation is explicit; invalid language cannot reach the provider',async()=>{
 const translate=makeLanguageTranslator({});assert.equal((await translate('Estimated 25 dollars.','es-DO')).translated,false);
 await assert.rejects(()=>translate('hello','not-supported'));await assert.rejects(()=>translate('[[HB0]]','es-DO'));
 const parse=makeLanguageParser({engine:D});assert.equal((await parse('negocio','es-DO')).command.type,'unknown');
});
test('translation endpoint requires authentication and never reads private trip data',async()=>{
 let calls=0;const handler=makeDispatchHandler({engine:D,authenticate:async()=>({id:'driver'}),loadState:()=>assert.fail('state read'),loadTrips:()=>assert.fail('trip read'),translateLanguage:async(text,locale)=>{calls++;return{text,locale,translated:true};}});
 const body=JSON.stringify({operation:'translate',text:'test',locale:'fr-FR'});
 assert.equal((await handler(new Request('https://test',{method:'POST',body}))).status,401);assert.equal(calls,0);
 const response=await handler(new Request('https://test',{method:'POST',body,headers:{Authorization:'Bearer test'}}));assert.equal(response.status,200);assert.equal((await response.json()).locale,'fr-FR');assert.equal(calls,1);
});

function speechFixture({translate,ai=true}={}){
 const source=readFileSync(new URL('../dist/homebase-copilot.js',import.meta.url),'utf8');
 const say=source.slice(source.indexOf(' async function say('),source.indexOf(' function save()'));
 const nodes={},logs=[],spoken=[],notices=[];
 const synthesis={getVoices:()=>[{name:'English',lang:'en-US',voiceURI:'en'},{name:'French',lang:'fr-FR',voiceURI:'fr'}],speak:u=>spoken.push(u)};
 const ctx={HomeBaseLanguages:L,HomeBaseVoice:V,HomeBaseAccounts:{backend:{evaluateDispatch:translate}},speechSynthesis:synthesis,SpeechSynthesisUtterance:function(text){this.text=text;},Date,setTimeout,readProfile:()=>({name:''}),getVoicePrefs:()=>({language:'fr',locale:'fr-FR'}),q:id=>nodes[id]??(nodes[id]={}),state:{aiUnderstanding:ai},HomeBaseShell:{logChat:(_,t)=>logs.push(t),setVoiceStatus:t=>notices.push(t)}};ctx.window=ctx;
 vm.createContext(ctx);vm.runInContext('let replySequence=0,speechSequence=0,speechBusy=false,voiceEnabled=true,quietUntil=0,recognition=null,listening=false,conversationActive=false,radioAddressed=false;function cancelSpeech(){++replySequence;++speechSequence;speechBusy=false;}'+say,ctx);
 return{ctx,logs,spoken,notices,run:()=>vm.runInContext("say('Estimated 25 dollars.')",ctx),cancel:()=>vm.runInContext('cancelSpeech()',ctx)};
}
test('dynamic replies use translated French or explicitly labeled English with matching voice',async()=>{
 const translated=speechFixture({translate:async()=>({text:'Estimation de 25 dollars.',translated:true,locale:'fr-FR'})});await translated.run();assert.equal(translated.spoken[0].lang,'fr-FR');assert.equal(translated.logs[0],'Estimation de 25 dollars.');
 const fallback=speechFixture({translate:async()=>{throw Error('not deployed')}});await fallback.run();assert.equal(fallback.spoken[0].lang,'en-US');assert.match(fallback.logs[0],/anglais/);
});
test('stopping conversation discards an in-flight translation before logging or speaking',async()=>{
 let resolve;const fixture=speechFixture({translate:()=>new Promise(r=>{resolve=r;})});const request=fixture.run();fixture.cancel();resolve({text:'Estimation de 25 dollars.',translated:true,locale:'fr-FR'});await request;assert.equal(fixture.spoken.length,0);assert.equal(fixture.logs.length,0);
});
