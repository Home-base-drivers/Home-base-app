(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HomeBaseVoice=api;})(globalThis,function(){
 'use strict';
 // Voice choices always come from voices actually supplied by the device.
 // Home Base stores the user's language/region/voice preference, but never
 // fabricates a voice ID or assumes a particular system voice is installed.
 const dispatcherNames=['Alex','Aaron','Daniel','Nathan','Guy','Ryan','David','Thomas','Jorge','Diego','Carlos','Juan','Enrique','Raul','Felipe','Tiago','Joao','Henrique','Rishi','Samantha','Ava','Serena','Karen','Moira','Tessa','Monica','Paulina','Luciana','Marisol','Helena','Amelie','Marie','Anna','Yuna','Kyoko'];
 const masculineNames=['Alex','Aaron','Daniel','Nathan','Guy','Ryan','David','Thomas','Jorge','Diego','Carlos','Juan','Enrique','Raul','Felipe','Tiago','Joao','Henrique','Rishi','Otoya','Markus','Martin','Lukas','Nicolas','Henri'];
 const feminineNames=['Samantha','Ava','Serena','Karen','Moira','Tessa','Monica','Paulina','Luciana','Marisol','Helena','Amelie','Marie','Anna','Yuna','Kyoko','Ting-Ting','Mei-Jia','Lekha','Veena'];
 function normalizeLocale(locale='en-US'){return String(locale||'en-US').replace('_','-');}
 function languageOf(locale='en-US'){return normalizeLocale(locale).split('-')[0].toLowerCase();}
 function voicesForLocale(voices,locale='en-US'){
  const all=Array.from(voices||[]),wanted=normalizeLocale(locale),language=languageOf(wanted);
  const exact=all.filter(v=>normalizeLocale(v.lang).toLowerCase()===wanted.toLowerCase());
  const sameLanguage=all.filter(v=>languageOf(v.lang)===language&&!exact.includes(v));
  return [...exact,...sameLanguage];
 }
 function voiceStyle(voice){
  const name=String(voice?.name||'');
  if(masculineNames.some(n=>new RegExp('\\b'+n+'\\b','i').test(name)))return'masculine';
  if(feminineNames.some(n=>new RegExp('\\b'+n+'\\b','i').test(name)))return'feminine';
  return'neutral';
 }
 function voicesForPreference(voices,locale='en-US',style='all'){
  const available=voicesForLocale(voices,locale);
  if(!style||style==='all')return available;
  const filtered=available.filter(v=>voiceStyle(v)===style);
  return filtered.length?filtered:available;
 }
 function englishVoices(voices){return voicesForLocale(voices,'en-US').filter(v=>languageOf(v.lang)==='en');}
 function selectVoice(voices,preferredURI='',locale='en-US',style='all'){
  const available=voicesForPreference(voices,locale,style),saved=available.find(v=>v.voiceURI===preferredURI);
  if(saved)return saved;
  const wanted=normalizeLocale(locale);
  const score=v=>{
   const index=dispatcherNames.findIndex(n=>new RegExp('\\b'+n+'\\b','i').test(v.name||''));
   return(index<0?0:70-index*2)+(normalizeLocale(v.lang).toLowerCase()===wanted.toLowerCase()?40:8)+(/premium|enhanced|natural|neural/i.test(v.name||'')?18:0)+(v.localService===true?5:0)+(v.default?2:0);
  };
  return available.map((v,i)=>({v,i,score:score(v)})).sort((a,b)=>b.score-a.score||a.i-b.i)[0]?.v||Array.from(voices||[]).find(v=>v.default)||Array.from(voices||[])[0]||null;
 }
 function delivery(message,{driverName='',address=false}={}){
  const text=String(message||'').replace(/\s+/g,' ').trim();
  if(!text)return{ text:'',rate:.94,pitch:.86,volume:1 };
  const name=String(driverName||'').trim().match(/^[\p{L}\p{M}'’-]{1,32}/u)?.[0]||'';
  const body=text.replace(/^Home Base(?: Copilot)?[.:,]\s*/i,'');
  return{text:address?(name?'Home Base to '+name+'. ':'Home Base. ')+body:text,rate:.94,pitch:.86,volume:1};
 }
 return{normalizeLocale,languageOf,voiceStyle,voicesForLocale,voicesForPreference,englishVoices,selectVoice,delivery};
});
