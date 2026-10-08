import {makeSchoolSearch} from './calendar.mjs';
const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'https://home-base-drivers.github.io','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
const answer=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const keys=new Map<string,number>();
const search=makeSchoolSearch({lookup:async(host:string)=>{
 const resolved=await Promise.allSettled([Deno.resolveDns(host,'A'),Deno.resolveDns(host,'AAAA')]);
 return resolved.flatMap(r=>r.status==='fulfilled'?r.value:[]);
}});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return answer({error:'POST required'},405);
 // Public calendar data is available to every driver, including signed-out users.
 // Validate the project's client API key upstream, without granting private access.
 const key=req.headers.get('apikey')||'';
 if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))return answer({error:'Valid Home Base client key required'},401);
 if(!keys.has(key)||Date.now()-keys.get(key)!>3600000){
  try{const r=await fetch(Deno.env.get('SUPABASE_URL')+'/auth/v1/settings',{headers:{apikey:key},signal:AbortSignal.timeout(5000)});if(!r.ok)return answer({error:'Invalid client key'},401);await r.body?.cancel();if(keys.size>8)keys.clear();keys.set(key,Date.now());}catch{return answer({error:'Calendar service unavailable'},503);}
 }
 try{const raw=await req.text();if(raw.length>2048)return answer({error:'Request too large'},413);return answer(await search(JSON.parse(raw)));}catch{return answer({error:'Public school calendar search unavailable'},400);}
});
