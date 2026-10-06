import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import './engine.js';
import {makeLanguageParser,makeLanguageTranslator} from './language.mjs';
import {makeDispatchHandler} from './handler.mjs';
import {makeVoiceSynthesizer} from './voice.mjs';
import {makeLiveSessionCreator} from './live.mjs';
import {makeHomeBaseAgent} from './agent.mjs';
const engine=(globalThis as any).HomeBaseDispatch;
const parseLanguage=makeLanguageParser({engine,apiKey:Deno.env.get('OPENAI_API_KEY'),model:Deno.env.get('OPENAI_COPILOT_MODEL')});
const translateLanguage=makeLanguageTranslator({apiKey:Deno.env.get('OPENAI_API_KEY'),model:Deno.env.get('OPENAI_COPILOT_MODEL')});
const synthesizeVoice=makeVoiceSynthesizer({apiKey:Deno.env.get('OPENAI_API_KEY'),model:Deno.env.get('OPENAI_TTS_MODEL')||'gpt-4o-mini-tts'});
const createLiveSession=makeLiveSessionCreator({apiKey:Deno.env.get('OPENAI_API_KEY'),liveModel:Deno.env.get('OPENAI_LIVE_MODEL')||'gpt-live-1',backendModel:Deno.env.get('OPENAI_LIVE_BACKEND_MODEL')||'gpt-6-luna'});
Deno.serve(async(request:Request)=>{
 const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:request.headers.get('Authorization')||''}},auth:{persistSession:false,autoRefreshToken:false}});
 const agent=makeHomeBaseAgent({apiKey:Deno.env.get('OPENAI_API_KEY'),model:Deno.env.get('OPENAI_AGENT_MODEL')||Deno.env.get('OPENAI_LIVE_BACKEND_MODEL')||'gpt-6-luna',
  loadMemory:async(userId:string)=>{const {data,error}=await client.from('homebase_agent_memory').select('memory_key,memory_type,content,confidence,source,learned_at').eq('user_id',userId).eq('active',true).order('learned_at',{ascending:false}).limit(100);if(error)throw error;return data||[];},
  loadTurns:async(userId:string,conversationId:string)=>{const {data,error}=await client.from('homebase_agent_turns').select('role,content,created_at').eq('user_id',userId).eq('conversation_id',conversationId).order('created_at',{ascending:false}).limit(30);if(error)throw error;return(data||[]).reverse();},
  saveTurn:async(userId:string,conversationId:string,role:string,content:string,context:any)=>{const {error}=await client.from('homebase_agent_turns').insert({user_id:userId,conversation_id:conversationId,role,content,context});if(error)throw error;},
  upsertMemories:async(userId:string,memories:any[])=>{for(const m of memories){const {error}=await client.from('homebase_agent_memory').upsert({user_id:userId,memory_key:String(m.key).slice(0,160),memory_type:m.type,content:{summary:String(m.summary).slice(0,1200)},confidence:Math.max(0,Math.min(1,Number(m.confidence)||.7)),source:'agent_learning',active:true,learned_at:new Date().toISOString()},{onConflict:'user_id,memory_key'});if(error)throw error;}}
 });
 return makeDispatchHandler({engine,parseLanguage,translateLanguage,synthesizeVoice,createLiveSession,agent,
  authenticate:async(token:string)=>{const {data,error}=await client.auth.getUser(token.slice(7));if(error)throw error;return data.user;},
  loadState:async(userId:string)=>{const {data,error}=await client.from('driver_dispatch_state').select('settings').eq('user_id',userId).maybeSingle();if(error)throw error;return data?.settings||{};},
  loadTrips:async(userId:string)=>{const {data,error}=await client.from('dispatch_recommendations').select('outcome').eq('user_id',userId).not('outcome','is',null).limit(500);if(error)throw error;return(data||[]).map((r:any)=>r.outcome);}
 })(request);
});
