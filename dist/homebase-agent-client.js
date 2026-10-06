(function(){
 'use strict';
 function conversationId(){
  try{return JSON.parse(localStorage.getItem('homeBaseCopilotActiveChat')||'null')||'default';}catch{return'default';}
 }
 async function ask(raw,prefs={}){
  if(!window.HomeBaseAccounts?.backend?.evaluateDispatch)throw new Error('Home Base backend unavailable');
  const result=await window.HomeBaseAccounts.backend.evaluateDispatch({
   operation:'agent',
   utterance:String(raw||'').trim(),
   locale:prefs.locale||navigator.language||'en-US',
   context:window.HomeBaseCopilot?.liveContext?.()||{},
   conversationId:conversationId()
  });
  return result;
 }
 window.HomeBaseAgentClient={ask,conversationId};
 window.HomeBaseAgentBridge=async function(raw,prefs){
  const result=await ask(raw,prefs);
  const answer=typeof result?.answer==='string'?result.answer.trim():'';
  if(!answer)throw new Error('Home Base Agent returned no answer');
  return answer;
 };
})();