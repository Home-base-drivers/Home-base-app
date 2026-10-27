(function(){
 'use strict';
 function conversationId(){try{return JSON.parse(localStorage.getItem('homeBaseCopilotActiveChat')||'null')||'default';}catch{return'default';}}
 function click(id){const el=document.getElementById(id);if(!el||el.disabled||el.hidden)return{ok:false,confirmed:false,error:'control_unavailable'};el.click();return{ok:false,confirmed:false,requested:true,status:'requested',message:'Control requested; completion is not confirmed.'}}
 function toggle(id){const el=document.getElementById(id);if(!el||el.disabled||el.hidden)return{ok:false,confirmed:false,error:'control_unavailable'};const before=el.getAttribute('aria-pressed');el.click();const after=el.getAttribute('aria-pressed');const confirmed=['true','false'].includes(before)&&['true','false'].includes(after)&&before!==after;return{ok:confirmed,confirmed,requested:true,state:after,error:confirmed?undefined:'state_change_unconfirmed'}}
 const actions=Object.freeze({
  refresh:()=>click('refreshBtn'),
  bonuses:()=>toggle('bonusToggle'),
  navigate:()=>click('mapsBtn'),
  events:()=>{const el=document.getElementById('todayEvents');if(!el)return{ok:false,confirmed:false,error:'events_unavailable'};el.scrollIntoView({behavior:'smooth',block:'center'});return{ok:false,confirmed:false,requested:true,status:'requested',message:'Events view requested; visibility is not confirmed.'}},
  heatmap:()=>toggle('layerBtn'),
  twelve_hour:()=>toggle('timelineQuickBtn')
 });
 async function execute(action){if(!action||typeof action!=='object')return{ok:false,error:'invalid_action'};const name=String(action.name||action.type||'').toLowerCase().replaceAll('-','_');const fn=actions[name];if(!fn)return{ok:false,error:'unsupported_action',action:name};try{return{action:name,...await fn(action.arguments||action.args||{})}}catch(error){return{ok:false,error:String(error?.message||error),action:name}}}
 // Plain-language reason for an AI failure. Never hide it behind a canned answer.
 function describeError(error){
  const code=String(error?.code||''),message=String(error?.message||error||'');
  if(code==='plan_required')return'GPT answers and GPT Live voice are part of Home Base Plus. The built-in AI is free and still answers.';
  if(code==='daily_messages_used_up')return'Today\'s free Home Base AI messages are used. Home Base Plus has unlimited conversation; offline answers continue.';
  if(code==='voice_minutes_used_up')return'This month\'s GPT Live minutes are used. Voice continues on this phone with the built-in AI.';
  if(code==='ai_not_configured'||/not configured|not tied to a workspace/i.test(message))return'Home Base AI is not switched on yet on the server.';
  if(code==='sign_in'||error?.name==='AuthSessionMissingError'||/sign in.*first|auth session missing|invalid session/i.test(message))return'You are signed out on this phone. Sign in from Profile to use Home Base AI.';
  if(code==='ai_timeout'||/timed? ?out|abort/i.test(message))return'Home Base AI took too long to answer. Try again.';
  if(/failed to fetch|network|load failed|offline/i.test(message))return'Can\'t reach Home Base AI right now. Check your signal and try again.';
  if(/backend unavailable/i.test(message))return'Home Base AI is still loading. Try again in a moment.';
  return message&&message.length<200?'Home Base AI: '+message:'Home Base AI could not answer. Try again.';
 }
 async function signedIn(){try{const user=await window.HomeBaseAccounts?.backend?.getUser?.();return!!(user?.id&&!user.is_anonymous)}catch(error){if(error?.name==='AuthSessionMissingError'||/auth session missing|sign in.*first|invalid session/i.test(error?.message||''))return false;throw error}}
 async function ask(raw,prefs={},options={}){
  if(!window.HomeBaseAccounts?.backend?.evaluateDispatch)throw new Error('Home Base backend unavailable');
  if(!await signedIn())throw Object.assign(new Error('Sign in first'),{code:'sign_in'});
  const channel=options.channel||prefs.channel||'voice',attachments=Array.isArray(options.attachments)?options.attachments.slice(0,1):[];
  const base={utterance:String(raw||'').trim(),locale:prefs.locale||navigator.language||'en-US',conversationId:options.conversationId||conversationId(),channel};
  const result=await window.HomeBaseAccounts.backend.evaluateDispatch({operation:'agent',...base,context:window.HomeBaseCopilot?.liveContext?.()||{},capabilities:Object.keys(actions),attachments});
  const requested=Array.isArray(result?.actions)?result.actions:result?.action?[result.action]:[];
  const actionResults=[];for(const action of requested)actionResults.push(await execute(action));
  if(actionResults.length){try{const verified=await window.HomeBaseAccounts.backend.evaluateDispatch({operation:'agent-result',...base,context:window.HomeBaseCopilot?.liveContext?.()||{},actionResults});if(verified?.answer)return{...result,...verified,actionResults}}catch(error){return{...result,answer:'The Home Base control was requested, but I could not confirm completion. '+describeError(error),execution:'unconfirmed_action_result',actionResults}}}
  return{...result,actionResults};
 }
 window.HomeBaseAgentClient={ask,execute,actions:Object.keys(actions),conversationId,describeError,signedIn};
 window.HomeBaseAgentBridge=async function(raw,prefs){const result=await ask(raw,prefs,{channel:prefs?.channel||'voice'});const answer=typeof result?.answer==='string'?result.answer.trim():'';if(!answer)throw new Error('Home Base Agent returned no answer');return answer;};
})();
