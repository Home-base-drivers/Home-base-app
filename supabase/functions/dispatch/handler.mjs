import {failureDetails} from './errors.mjs';
// Shared foreground dispatch endpoint. Auth is checked before reading private driver data.
export function makeDispatchHandler({engine,authenticate,loadState,loadTrips,parseLanguage,translateLanguage,synthesizeVoice,createLiveSession,agent,reportFailure=details=>console.error(JSON.stringify({event:'homebase_dispatch_failure',...details}))}) {
 const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'https://home-base-drivers.github.io','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
 const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Cache-Control':'no-store'}});
 const failure=(error,operation)=>{const details=failureDetails(error),requestId=globalThis.crypto?.randomUUID?.()||'unavailable';reportFailure({operation,request_id:requestId,...details});const status=details.code==='ai_not_configured'?503:details.code==='ai_timeout'?504:details.code==='ai_provider_error'?502:400;return response({error:error?.message||'Home Base AI is unavailable.',...details,request_id:requestId},status)};
 return async request=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return response({error:'POST required'},405);
  const token=request.headers.get('Authorization');if(!token?.startsWith('Bearer '))return response({error:'Sign in first'},401);
  let user;try{user=await authenticate(token);}catch{return response({error:'Invalid session'},401);}
  if(!user?.id||user.is_anonymous)return response({error:'Sign in first'},401);
  let operation='dispatch';try{
   const raw=await request.text();if(raw.length>6_000_000)return response({error:'Request too large',code:'too_large'},413);
   const payload0=JSON.parse(raw);if(raw.length>65536&&!['agent','chat'].includes(payload0.operation))return response({error:'Request too large',code:'too_large'},413);
   const payload=payload0;if(!['score','recommend','chat','agent','agent-result','translate','voice','live-session'].includes(payload.operation))return response({error:'Unsupported operation'},400);operation=payload.operation;
   if(payload.operation==='live-session'){
    if(!createLiveSession)return response({configured:false,error:'GPT Live is not configured on the Home Base server.'},503);
    const live=await createLiveSession({sdp:payload.sdp,locale:payload.locale,voice:payload.voice,style:payload.style,history:payload.history,context:payload.context});return response(live,live?.configured===false?503:200);
   }
   if(payload.operation==='voice'){
    if(!synthesizeVoice)return response({configured:false,provider:'not_configured'});
    const result=await synthesizeVoice({text:payload.text,locale:payload.locale,voice:payload.voice,style:payload.style});
    if(!result.configured)return response(result);
    // Supabase functions.invoke only preserves binary responses as Blob for application/octet-stream.
    // Keep the actual media type in a dedicated header so the browser can still identify the audio.
    return new Response(result.audio,{status:200,headers:{...headers,'Content-Type':'application/octet-stream','Cache-Control':'no-store','X-HomeBase-Voice':'ai','X-HomeBase-Audio-Type':result.contentType||'audio/mpeg'}});
   }
   if(payload.operation==='translate'){if(!translateLanguage)return response({translated:false,provider:'not_configured'});return response(await translateLanguage(payload.text,payload.locale));}
   if(payload.operation==='agent'||payload.operation==='agent-result'||payload.operation==='chat'){if(agent){try{return response(await agent({userId:user.id,utterance:typeof payload.utterance==='string'?payload.utterance:'',context:payload.context||{},conversationId:String(payload.conversationId||'default').slice(0,120),capabilities:payload.capabilities||[],actionResults:payload.actionResults||[],channel:payload.channel==='chat'?'chat':'voice',attachments:payload.attachments||[]}));}catch(e){return failure(e,payload.operation);}}const language=parseLanguage?await parseLanguage(payload.utterance,payload.locale,payload.context):{command:engine.parseCommand(payload.utterance),provider:'not_configured',execution:'advisory'};return response(language);}
   const stored=await loadState(user.id),trips=await loadTrips(user.id);
   const state=engine.DriverState.create({...stored,...payload.state});
   // Request context is driver-reported; no client can create official capability support.
   const result=payload.operation==='score'?engine.scoreTrip(payload.trip,state,engine.learn(trips).weights):engine.recommend(state,payload.context||{});
   return response({...result,input_origin:'USER-REPORTED',execution:'advisory',server_evaluated:true});
  }catch(e){return failure(e,operation);}
 };
}
