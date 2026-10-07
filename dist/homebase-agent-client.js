(function(){
 'use strict';
 function conversationId(){try{return JSON.parse(localStorage.getItem('homeBaseCopilotActiveChat')||'null')||'default';}catch{return'default';}}
 function click(id){const el=document.getElementById(id);if(!el)return{ok:false,error:'control_unavailable'};el.click();return{ok:true}}
 const actions=Object.freeze({
  refresh:()=>click('refreshBtn'),
  bonuses:()=>click('bonusToggle'),
  navigate:()=>click('mapsBtn'),
  events:()=>{const el=document.getElementById('todayEvents');if(!el)return{ok:false,error:'events_unavailable'};el.scrollIntoView({behavior:'smooth',block:'center'});return{ok:true}},
  heatmap:()=>click('layerBtn'),
  twelve_hour:()=>click('timelineQuickBtn')
 });
 async function execute(action){if(!action||typeof action!=='object')return{ok:false,error:'invalid_action'};const name=String(action.name||action.type||'').toLowerCase().replaceAll('-','_');const fn=actions[name];if(!fn)return{ok:false,error:'unsupported_action',action:name};try{return{action:name,...await fn(action.arguments||action.args||{})}}catch(error){return{ok:false,error:String(error?.message||error),action:name}}}
 async function ask(raw,prefs={}){
  if(!window.HomeBaseAccounts?.backend?.evaluateDispatch)throw new Error('Home Base backend unavailable');
  const result=await window.HomeBaseAccounts.backend.evaluateDispatch({operation:'agent',utterance:String(raw||'').trim(),locale:prefs.locale||navigator.language||'en-US',context:window.HomeBaseCopilot?.liveContext?.()||{},conversationId:conversationId(),capabilities:Object.keys(actions)});
  const requested=Array.isArray(result?.actions)?result.actions:result?.action?[result.action]:[];
  const actionResults=[];for(const action of requested)actionResults.push(await execute(action));
  if(actionResults.length){try{const verified=await window.HomeBaseAccounts.backend.evaluateDispatch({operation:'agent-result',utterance:String(raw||'').trim(),locale:prefs.locale||navigator.language||'en-US',context:window.HomeBaseCopilot?.liveContext?.()||{},conversationId:conversationId(),actionResults});if(verified?.answer)return{...result,...verified,actionResults}}catch{}}
  return{...result,actionResults};
 }
 window.HomeBaseAgentClient={ask,execute,actions:Object.keys(actions),conversationId};
 window.HomeBaseAgentBridge=async function(raw,prefs){const result=await ask(raw,prefs);const answer=typeof result?.answer==='string'?result.answer.trim():'';if(!answer)throw new Error('Home Base Agent returned no answer');return answer;};
})();
