import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const Voice=createRequire(import.meta.url)('../dist/homebase-voice.js');

const voices=[
 {name:'Samantha',lang:'en-US',voiceURI:'en-us',default:true,localService:true},
 {name:'Daniel',lang:'en-GB',voiceURI:'en-gb',localService:true},
 {name:'Monica',lang:'es-ES',voiceURI:'es-es',localService:true},
 {name:'Paulina',lang:'es-MX',voiceURI:'es-mx',localService:true},
 {name:'Jorge',lang:'es-ES',voiceURI:'es-male',localService:true},
 {name:'Mei-Jia',lang:'zh-TW',voiceURI:'zh-female',localService:true}
];

test('voice picker prefers the requested accent when available',()=>{
 assert.equal(Voice.selectVoice(voices,'','en-GB').voiceURI,'en-gb');
 assert.equal(Voice.selectVoice(voices,'','es-MX').voiceURI,'es-mx');
});

test('voice picker falls back to the same language when an exact accent is unavailable',()=>{
 assert.equal(Voice.selectVoice(voices,'','es-DO').lang.startsWith('es'),true);
});

test('saved voice is retained only when it matches the selected language family',()=>{
 assert.equal(Voice.selectVoice(voices,'es-es','es-DO').voiceURI,'es-es');
 assert.notEqual(Voice.selectVoice(voices,'en-us','es-MX').voiceURI,'en-us');
});

test('voice style can prefer a masculine installed voice',()=>{
 const selected=Voice.selectVoice(voices,'','es-DO','masculine');
 assert.equal(selected.voiceURI,'es-male');
 assert.equal(Voice.voiceStyle(selected),'masculine');
});

test('global language matching keeps Chinese voices in the Chinese family',()=>{
 assert.equal(Voice.selectVoice(voices,'','zh-CN').lang.startsWith('zh'),true);
});
