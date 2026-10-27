import {failureDetails} from './errors.mjs';
// Shared foreground dispatch endpoint. Auth is checked before reading private driver data.
export function makeDispatchHandler({engine,authenticate,loadState,loadTrips,parseLanguage,translateLanguage,synthesizeVoice,createLiveSession,agent,entitlements=null,reportFailure=details=>console.error(JSON.stringify({event:'homebase_dispatch_failure',...details}))}) {
 const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'https://home-base-drivers.github.io','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
 const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Cache-Control':'no-store'}});
 const failure=(error,operation)=>{const details=failureDetails(error),requestId=globalThis.crypto?.randomUUID?.()||'unavailable';reportFailure({operation,request_id:requestId,...details});const status=PAYWALL.has(details.code)?402:['ai_not_configured','ai_no_credit'].includes(details.code)?503:details.code==='ai_timeout'?504:details.code==='ai_provider_error'?502:400;return response({error:error?.message||'Home Base AI is unavailable.',...details,request_id:requestId},status)};
 // Plans and usage are enforced here, not on the phone. Every plan gets Claude
 // answers up to finite daily/monthly limits recorded by the server (we pay per
 // message); GPT voices and GPT Live are Pro only.
 const PAYWALL=new Set(['plan_required','voice_minutes_used_up','daily_messages_used_up','monthly_messages_used_up','daily_images_used_up','free_pool_used_up','email_unconfirmed']);
 const METERED=new Set(['agent','agent-result','chat','translate','voice']);
 const PAYWALL_TEXT={
  plan_required:'GPT voices and GPT Live are part of Home Base Pro. Home Base AI answers keep working with your phone\'s voice.',
  voice_minutes_used_up:'This month\'s GPT Live minutes are used. Voice continues with your phone\'s voice, or add minutes.',
  daily_messages_used_up:'Today\'s Home Base AI messages on your plan are used. They reset at midnight; a higher plan includes more. Offline answers still work.',
  monthly_messages_used_up:'This month\'s Home Base AI messages on your plan are used. A higher plan includes more. Offline answers still work.',
  daily_images_used_up:'Today\'s screenshot readings on your plan are used. The phone can still read screenshots offline.',
  free_pool_used_up:'Free Home Base AI is at today\'s limit for everyone. Plus and Pro keep their own allowance. Offline answers still work.',
  email_unconfirmed:'Confirm your email address to use Home Base AI. Check your inbox for the sign-in link.'};
 const planError=error=>{const m=String(error?.message||'')+' '+String(error?.code||'');const code=[...PAYWALL].find(c=>m.includes(c));if(!code)return error;return Object.assign(Error(PAYWALL_TEXT[code]),{code});};
 // The provider refused the request (nothing billed): give the message back.
 const refusedByProvider=e=>['ai_not_configured','ai_no_credit'].includes(e?.code)||[400,401,403,404,413,429,529].includes(Number(e?.provider_status));
 return async request=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return response({error:'POST required'},405);
  const token=request.headers.get('Authorization');if(!token?.startsWith('Bearer '))return response({error:'Sign in first'},401);
  let user;try{user=await authenticate(token);}catch{return response({error:'Invalid session'},401);}
  if(!user?.id||user.is_anonymous)return response({error:'Sign in first'},401);
  let operation='dispatch';try{
   const raw=await request.text();if(raw.length>6_000_000)return response({error:'Request too large',code:'too_large'},413);
   const payload0=JSON.parse(raw);if(raw.length>65536&&!['agent','chat'].includes(payload0.operation))return response({error:'Request too large',code:'too_large'},413);
   const payload=payload0;if(!['score','recommend','chat','agent','agent-result','translate','voice','live-session','live-heartbeat','live-end','allowance'].includes(payload.operation))return response({error:'Unsupported operation'},400);operation=payload.operation;
   if(payload.operation==='allowance'){if(!entitlements)return response({plan:'unmetered'});return response(await entitlements.allowance());}
   if(payload.operation==='live-heartbeat'||payload.operation==='live-end'){
    if(!entitlements)return response({open:false});const id=String(payload.voiceSessionId||'');if(!/^[0-9a-f-]{36}$/i.test(id))return response({error:'Unknown voice session'},400);
    return response(payload.operation==='live-end'?await entitlements.end(id,['ended','idle','cap','failed','background'].includes(payload.reason)?payload.reason:'ended'):await entitlements.heartbeat(id));
   }
   let usage=null;
   if(entitlements&&METERED.has(payload.operation)){
    if(payload.operation==='voice'){const allowance=await entitlements.allowance();if(allowance?.plan!=='pro')throw planError(Error('plan_required'));}
    const image=['agent','chat'].includes(payload.operation)&&Array.isArray(payload.attachments)&&payload.attachments.length>0;
    try{usage=await entitlements.claim(user.id,payload.operation,image);}catch(e){throw planError(e);}
   }
   const metered=async fn=>{try{return await fn();}catch(e){if(usage?.usage_id&&refusedByProvider(e))await entitlements.release(usage.usage_id,user.id).catch(()=>{});throw e;}};
   if(payload.operation==='live-session'){
    if(!createLiveSession)return response({configured:false,code:'live_unavailable',error:'Live voice uses your phone\'s voice with Home Base AI answers.'},503);
    // Open the metered session first; it refuses free plans and used-up months.
    let meter=null;if(entitlements){try{meter=await entitlements.start();}catch(e){throw planError(e);}}
    let live;try{live=await createLiveSession({sdp:payload.sdp,locale:payload.locale,voice:payload.voice,style:payload.style,history:payload.history,context:payload.context});}
    catch(e){if(meter)await entitlements.end(meter.session_id,'failed').catch(()=>{});throw e;}
    if(meter&&live?.configured===false)await entitlements.end(meter.session_id,'failed').catch(()=>{});
    return response(meter?{...live,voiceSessionId:meter.session_id,maxSeconds:meter.max_seconds,plan:meter.plan,remainingSeconds:meter.remaining_seconds}:live,live?.configured===false?503:200);
   }
   if(payload.operation==='voice'){
    if(!synthesizeVoice)return response({configured:false,provider:'not_configured'});
    const result=await metered(()=>synthesizeVoice({text:payload.text,locale:payload.locale,voice:payload.voice,style:payload.style}));
    if(!result.configured){if(usage?.usage_id)await entitlements.release(usage.usage_id,user.id).catch(()=>{});return response(result);}
    // Supabase functions.invoke only preserves binary responses as Blob for application/octet-stream.
    // Keep the actual media type in a dedicated header so the browser can still identify the audio.
    return new Response(result.audio,{status:200,headers:{...headers,'Content-Type':'application/octet-stream','Cache-Control':'no-store','X-HomeBase-Voice':'ai','X-HomeBase-Audio-Type':result.contentType||'audio/mpeg'}});
   }
   if(payload.operation==='translate'){if(!translateLanguage)return response({translated:false,provider:'not_configured'});return response(await metered(()=>translateLanguage(payload.text,payload.locale)));}
   if(payload.operation==='agent'||payload.operation==='agent-result'||payload.operation==='chat'){if(agent){try{return response(await metered(()=>agent({webSearches:usage?usage.web_searches:undefined,userId:user.id,utterance:typeof payload.utterance==='string'?payload.utterance:'',context:payload.context||{},conversationId:String(payload.conversationId||'default').slice(0,120),capabilities:payload.capabilities||[],actionResults:payload.actionResults||[],channel:payload.channel==='chat'?'chat':'voice',attachments:payload.attachments||[]})));}catch(e){return failure(e,payload.operation);}}const language=parseLanguage?await metered(()=>parseLanguage(payload.utterance,payload.locale,payload.context)):{command:engine.parseCommand(payload.utterance),provider:'not_configured',execution:'advisory'};return response(language);}
   const stored=await loadState(user.id),trips=await loadTrips(user.id);
   const state=engine.DriverState.create({...stored,...payload.state});
   // Request context is driver-reported; no client can create official capability support.
   const result=payload.operation==='score'?engine.scoreTrip(payload.trip,state,engine.learn(trips).weights):engine.recommend(state,payload.context||{});
   return response({...result,input_origin:'USER-REPORTED',execution:'advisory',server_evaluated:true});
  }catch(e){return failure(planError(e),operation);}
 };
}
