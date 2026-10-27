import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import './engine.js';
import {makeLanguageParser,makeLanguageTranslator} from './language.mjs';
import {makeDispatchHandler} from './handler.mjs';
import {makeVoiceSynthesizer} from './voice.mjs';
import {makeLiveSessionCreator} from './live.mjs';
import {makeHomeBaseAgent} from './agent.mjs';
import {withAllowedOrigin} from './cors.mjs';
const engine=(globalThis as any).HomeBaseDispatch;
// Text intelligence runs on Claude when ANTHROPIC_API_KEY is set (AI_PROVIDER=openai forces OpenAI).
// GPT voice and GPT Live stay OpenAI-only and switch on only when OPENAI_API_KEY is set; without it
// spoken replies use the phone's own voice and the conversation still uses Home Base AI answers.
const openaiKey=Deno.env.get('OPENAI_API_KEY'),claudeKey=Deno.env.get('ANTHROPIC_API_KEY');
const provider=Deno.env.get('AI_PROVIDER')==='openai'||!claudeKey?'openai':'anthropic';
const textKey=provider==='anthropic'?claudeKey:openaiKey;
// Everyday answers use the small, inexpensive model; only driver-app screenshots
// (photos) use the larger vision model. CLAUDE_MODEL is no longer used for chat so an
// old setting cannot quietly raise the cost of every message.
const claudeModel=Deno.env.get('CLAUDE_CHAT_MODEL')||'claude-haiku-5-5',claudeVisionModel=Deno.env.get('CLAUDE_VISION_MODEL')||'claude-sonnet-5-5',claudeFastModel=Deno.env.get('CLAUDE_FAST_MODEL')||'claude-haiku-5-5';
// Usage is recorded with the service role only; drivers cannot write or erase it.
const usageDb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const fastModel=provider==='anthropic'?claudeFastModel:Deno.env.get('OPENAI_COPILOT_MODEL');
const parseLanguage=makeLanguageParser({engine,provider,apiKey:textKey,model:fastModel});
const translateLanguage=makeLanguageTranslator({provider,apiKey:textKey,model:fastModel});
const synthesizeVoice=makeVoiceSynthesizer({apiKey:openaiKey,model:Deno.env.get('OPENAI_TTS_MODEL')||'gpt-4o-mini-tts'});
const createLiveSession=openaiKey?makeLiveSessionCreator({apiKey:openaiKey,liveModel:Deno.env.get('OPENAI_LIVE_MODEL')||'gpt-live-1',backendModel:Deno.env.get('OPENAI_LIVE_BACKEND_MODEL')||'gpt-6-luna'}):null;
Deno.serve(withAllowedOrigin(async(request:Request)=>{
 const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:request.headers.get('Authorization')||''}},auth:{persistSession:false,autoRefreshToken:false}});
 const agent=makeHomeBaseAgent({provider,apiKey:textKey,fastModel:claudeFastModel,visionModel:provider==='anthropic'?claudeVisionModel:undefined,model:provider==='anthropic'?claudeModel:Deno.env.get('OPENAI_AGENT_MODEL')||Deno.env.get('OPENAI_LIVE_BACKEND_MODEL')||'gpt-6-luna',
  loadMemory:async(userId:string)=>{const {data,error}=await client.from('homebase_agent_memory').select('memory_key,memory_type,content,confidence,source,learned_at').eq('user_id',userId).eq('active',true).order('learned_at',{ascending:false}).limit(80);if(error)throw error;return data||[];},
  loadTurns:async(userId:string,conversationId:string)=>{const {data,error}=await client.from('homebase_agent_turns').select('role,content,created_at').eq('user_id',userId).eq('conversation_id',conversationId).order('created_at',{ascending:false}).limit(60);if(error)throw error;return(data||[]).reverse();},
  saveTurn:async(userId:string,conversationId:string,role:string,content:string,context:any)=>{const {error}=await client.from('homebase_agent_turns').insert({user_id:userId,conversation_id:conversationId,role,content,context});if(error)throw error;},
  forgetMemories:async(userId:string,keys:string[])=>{const {error}=await client.from('homebase_agent_memory').update({active:false}).eq('user_id',userId).in('memory_key',keys.map(k=>String(k).slice(0,160)));if(error)throw error;},
  upsertMemories:async(userId:string,memories:any[])=>{for(const m of memories){const {error}=await client.from('homebase_agent_memory').upsert({user_id:userId,memory_key:String(m.key).slice(0,160),memory_type:m.type,content:{summary:String(m.summary).slice(0,1200)},confidence:Math.max(0,Math.min(1,Number(m.confidence)||.7)),source:'agent_learning',active:true,learned_at:new Date().toISOString()},{onConflict:'user_id,memory_key'});if(error)throw error;}}
 });
 // Plan checks and GPT Live minutes run as the signed-in driver through
 // security-definer functions; the phone cannot change its own plan or usage.
 const rpc=async(name:string,args?:Record<string,unknown>)=>{const {data,error}=await client.rpc(name,args);if(error)throw Object.assign(new Error(error.message),{code:error.message?.includes('plan_required')?'plan_required':error.message?.includes('voice_minutes_used_up')?'voice_minutes_used_up':undefined});return data;};
 const entitlements={allowance:()=>rpc('my_ai_allowance'),
  claim:async(userId:string,operation:string,image:boolean)=>{const {data,error}=await usageDb.rpc('claim_ai_usage',{p_user:userId,p_operation:operation,p_image:image});if(error)throw Object.assign(new Error(error.message),{code:error.message});return data;},
  release:async(id:number,userId:string)=>{const {error}=await usageDb.rpc('release_ai_usage',{p_usage:id,p_user:userId});if(error)throw error;},start:()=>rpc('start_voice_session'),heartbeat:(id:string)=>rpc('heartbeat_voice_session',{p_session:id}),end:(id:string,reason:string)=>rpc('end_voice_session',{p_session:id,p_reason:reason})};
 return makeDispatchHandler({engine,parseLanguage,translateLanguage,synthesizeVoice,createLiveSession,agent,entitlements,
  authenticate:async(token:string)=>{const {data,error}=await client.auth.getUser(token.slice(7));if(error)throw error;return data.user;},
  loadState:async(userId:string)=>{const {data,error}=await client.from('driver_dispatch_state').select('settings').eq('user_id',userId).maybeSingle();if(error)throw error;return data?.settings||{};},
  loadTrips:async(userId:string)=>{const {data,error}=await client.from('dispatch_recommendations').select('outcome').eq('user_id',userId).not('outcome','is',null).limit(500);if(error)throw error;return(data||[]).map((r:any)=>r.outcome);}
 })(request);
}));
