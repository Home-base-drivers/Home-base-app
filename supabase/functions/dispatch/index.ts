import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import './engine.js';
import {makeLanguageParser,makeLanguageTranslator} from './language.mjs';
import {makeDispatchHandler} from './handler.mjs';
import {makeVoiceSynthesizer} from './voice.mjs';
const engine=(globalThis as any).HomeBaseDispatch;
const parseLanguage=makeLanguageParser({engine,apiKey:Deno.env.get('OPENAI_API_KEY'),model:Deno.env.get('OPENAI_COPILOT_MODEL')});
const translateLanguage=makeLanguageTranslator({apiKey:Deno.env.get('OPENAI_API_KEY'),model:Deno.env.get('OPENAI_COPILOT_MODEL')});
const synthesizeVoice=makeVoiceSynthesizer({apiKey:Deno.env.get('OPENAI_API_KEY'),model:Deno.env.get('OPENAI_TTS_MODEL')||'gpt-4o-mini-tts'});
Deno.serve(async(request:Request)=>{
 const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:request.headers.get('Authorization')||''}},auth:{persistSession:false,autoRefreshToken:false}});
 return makeDispatchHandler({engine,parseLanguage,translateLanguage,synthesizeVoice,
  authenticate:async(token:string)=>{const {data,error}=await client.auth.getUser(token.slice(7));if(error)throw error;return data.user;},
  loadState:async(userId:string)=>{const {data,error}=await client.from('driver_dispatch_state').select('settings').eq('user_id',userId).maybeSingle();if(error)throw error;return data?.settings||{};},
  loadTrips:async(userId:string)=>{const {data,error}=await client.from('dispatch_recommendations').select('outcome').eq('user_id',userId).not('outcome','is',null).limit(500);if(error)throw error;return(data||[]).map((r:any)=>r.outcome);}
 })(request);
});
