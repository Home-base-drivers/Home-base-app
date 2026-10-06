// Shared foreground dispatch endpoint. Auth is checked before reading private driver data.
export function makeDispatchHandler({engine,authenticate,loadState,loadTrips,parseLanguage,translateLanguage,synthesizeVoice}) {
 const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'https://home-base-drivers.github.io','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
 const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 return async request=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return response({error:'POST required'},405);
  const token=request.headers.get('Authorization');if(!token?.startsWith('Bearer '))return response({error:'Sign in first'},401);
  let user;try{user=await authenticate(token);}catch{return response({error:'Invalid session'},401);}
  if(!user?.id||user.is_anonymous)return response({error:'Sign in first'},401);
  try{
   const raw=await request.text();if(raw.length>65536)return response({error:'Request too large'},413);
   const payload=JSON.parse(raw);if(!['score','recommend','chat','translate','voice'].includes(payload.operation))return response({error:'Unsupported operation'},400);
   if(payload.operation==='voice'){
    if(!synthesizeVoice)return response({configured:false,provider:'not_configured'});
    const result=await synthesizeVoice({text:payload.text,locale:payload.locale,voice:payload.voice,style:payload.style});
    if(!result.configured)return response(result);
    return new Response(result.audio,{status:200,headers:{...headers,'Content-Type':result.contentType||'audio/mpeg','Cache-Control':'no-store','X-HomeBase-Voice':'ai'}});
   }
   if(payload.operation==='translate'){if(!translateLanguage)return response({translated:false,provider:'not_configured'});return response(await translateLanguage(payload.text,payload.locale));}
   if(payload.operation==='chat'){const language=parseLanguage?await parseLanguage(payload.utterance,payload.locale):{command:engine.parseCommand(payload.utterance),provider:'not_configured',execution:'advisory'};return response(language);}
   const stored=await loadState(user.id),trips=await loadTrips(user.id);
   const state=engine.DriverState.create({...stored,...payload.state});
   // Request context is driver-reported; no client can create official capability support.
   const result=payload.operation==='score'?engine.scoreTrip(payload.trip,state,engine.learn(trips).weights):engine.recommend(state,payload.context||{});
   return response({...result,input_origin:'USER-REPORTED',execution:'advisory',server_evaluated:true});
  }catch(e){return response({error:e.message||'Dispatch calculation unavailable'},400);}
 };
}
