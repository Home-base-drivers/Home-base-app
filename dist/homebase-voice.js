(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HomeBaseVoice=api;})(globalThis,function(){
 'use strict';
 // These are preferences among voices actually supplied by the device, not
 // fabricated voice IDs or a promise that any particular voice is installed.
 const dispatcherNames=['Alex','Aaron','Daniel','Nathan','Guy','Ryan','David','Thomas'];
 function englishVoices(voices){return Array.from(voices||[]).filter(v=>/^en(?:[-_]|$)/i.test(v.lang||''));}
 function selectVoice(voices,preferredURI=''){
  const available=englishVoices(voices),saved=available.find(v=>v.voiceURI===preferredURI);
  if(saved)return saved;
  const score=v=>{const index=dispatcherNames.findIndex(n=>new RegExp('\\b'+n+'\\b','i').test(v.name||''));return(index<0?0:100-index*3)+(/^en[-_]US$/i.test(v.lang)?15:5)+(/premium|enhanced|natural|neural/i.test(v.name||'')?15:0)+(v.localService===true?5:0)+(v.default?1:0);};
  return available.map((v,i)=>({v,i,score:score(v)})).sort((a,b)=>b.score-a.score||a.i-b.i)[0]?.v||null;
 }
 function delivery(message,{driverName='',address=false}={}){
  const text=String(message||'').replace(/\s+/g,' ').trim();
  if(!text)return{ text:'',rate:.94,pitch:.86,volume:1 };
  const name=String(driverName||'').trim().match(/^[\p{L}\p{M}'’-]{1,32}/u)?.[0]||'';
  const body=text.replace(/^Home Base(?: Copilot)?[.:,]\s*/i,'');
  // Never truncate instructions: estimated values, uncertainty, and platform
  // restrictions are part of the dispatch message and must remain audible.
  return{text:address?(name?'Home Base to '+name+'. ':'Home Base. ')+body:text,rate:.94,pitch:.86,volume:1};
 }
 return{englishVoices,selectVoice,delivery};
});
