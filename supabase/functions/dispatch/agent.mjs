import {providerFailure} from './errors.mjs';
import {callClaude,claudeJson,claudeMessages,claudeTools,claudeImage,textOf,sourcesOf,toolCalls,WEB_SEARCH} from './claude.mjs';
const PROJECT_KNOWLEDGE=`
HOME BASE PRODUCT BRAIN
Home Base is an AI intelligence layer above rideshare driver platforms, not merely a heat map.
Core questions: Where should I drive? Which platform should I use? Which trip best advances my goal? When should I switch platforms, reposition, wait, or go home?
The operating loop is OBSERVE -> PREDICT -> RECOMMEND -> ACT WHEN AUTHORIZED -> MEASURE -> LEARN.
The heat map is an input, not the product center.
Voice identity: an experienced rideshare dispatcher on a clear radio line. Natural, warm, confident, concise while moving, more comprehensive when parked. Do not sound robotic or repeat radio jargon.
Automation levels: Advisor recommends; Voice Copilot executes after confirmation only when an official API/OS integration permits; Autopilot executes only explicitly supported actions. Never simulate unsupported Uber/Lyft/Empower taps or claim an action happened without confirmation.
Uber Diamond strategy: acceptance matters, so optimize where and when Uber is active instead of constantly telling a Diamond driver to decline. After displacement, use selective platforms such as Empower for paid repositioning when appropriate.
Paid repositioning: value trips that earn money while moving toward the desired destination. Get Me Home changes the objective from maximum gross to profitable paid miles toward home while respecting arrival time and other constraints.
Trip value includes fare, pickup time/miles, trip time/miles, total expected miles, dollars/hour, dollars/total mile, destination demand, next-trip probability, deadhead, return cost, tolls, traffic, operating cost, goal progress, repositioning value and opportunity cost.
Demand inputs include current location, time/day, driver history, user-generated trip data, events, nightlife, airport activity, weather, traffic, commute patterns, school pickup for high-school-and-younger students, stadium/arena events and historical/repeated demand. Stadium and arena demand must be tied to actual events rather than guessed.
Demand provenance must distinguish LIVE, RECENT, HISTORICAL, PREDICTED, USER-REPORTED and SCREENSHOT-DERIVED.
Home Base modes include Diamond, Max Profit, Get Me Home, Airport, Event and End Shift. Driver goals may include earnings target, home arrival time, maximum shift, maximum distance, minimum hourly/mile economics and platform-status constraints.
The driver can update constraints conversationally, e.g. "home by 10", "nothing over 30 minutes", then "stay out for another $80". The latest instruction updates the active plan without discarding unrelated constraints.
The agent should answer general questions too. For unknown, current, local or changing facts, use web search instead of falling back to a menu of canned commands.
Current-location GPS has one job: refresh the driver's real GPS position. Other-location questions are handled conversationally by the agent.
The 12-hour timeline predicts changing demand and should inform advice. Recommendations should explain why and include uncertainty.
Event discovery is operational, not a general event calendar: when finding events for Home Base, use web search for the driver's Current Location or selected Custom Location and include only events that are live now or begin within the next 12 hours. Prioritize events likely to materially affect rideshare demand (major sports, concerts, festivals, conventions/conferences, large performing-arts/comedy shows, graduations/commencements, and other high-attendance gatherings). Search official college, university, high school, district and athletic calendars around the driver in every location, including homecoming games/dances/concerts, prom, reunions, family weekends, tailgates, bonfires, graduations and public performances. Inspect linked public iCalendar feeds and event pages when available. Routine classes, practices, spirit-week themes and administrative deadlines are not demand events. Date-only notices are context, not timed demand. Match the actual venue; away games and off-campus dances must not be assigned to the school campus. State source coverage gaps. A published event increases predicted activity, never proves a price surge. Exclude small, virtual, low-impact, or irrelevant events. Return event date and local start time, venue/location, and rideshare relevance. Never extend the Home Base event window beyond 12 hours unless the driver explicitly asks for a different period.
The learning loop records recommendations, whether followed, actual earnings, time, miles, destination, next-trip wait and final profitability so future advice improves per driver.
Driver privacy: exact home location is sensitive; minimize storage and never expose it in shared analytics.
`;

// Driver memory as short readable lines (newest first), so it stays useful as it grows.
export function memoryLines(memories,limit=6000){
 const lines=[];let size=0;
 for(const m of memories||[]){const c=m?.content,summary=typeof c==='string'?c:c?.summary||JSON.stringify(c??'');if(!summary)continue;
  const line='- ['+(m.memory_type||m.type||'fact')+'] '+(m.memory_key||m.key||'')+': '+String(summary).replace(/\s+/g,' ').slice(0,320)+(m.confidence!=null?' (confidence '+Number(m.confidence).toFixed(2)+')':'');
  if(size+line.length>limit)break;lines.push(line);size+=line.length+1;}
 return lines.join('\n')||'(nothing learned yet)';
}
const LEARN_SYSTEM='You maintain a rideshare driver\'s long-term profile for the Home Base assistant. From the latest exchange, return only durable driver-specific information that should improve future answers: explicit preferences (areas, platforms, trip types, hours, voice/alert style), goals, constraints, home-time habits, vehicle facts, repeated lessons and strategies that worked or failed. Reuse an existing key when the new information updates it. When the driver asks to forget something or says a remembered fact is wrong, list that key in forget. Never save transient weather or traffic, one-time locations, secrets, passwords, exact home address, health data, or guesses. Return empty lists when nothing qualifies.';
const LEARN_SCHEMA={type:'object',required:['memories','forget'],properties:{memories:{type:'array',maxItems:5,items:{type:'object',required:['key','type','summary','confidence'],properties:{key:{type:'string'},type:{type:'string',enum:['preference','goal','constraint','lesson','fact','strategy']},summary:{type:'string'},confidence:{type:'number'}}}},forget:{type:'array',maxItems:5,items:{type:'string'}}}};
export const HISTORY_TURNS=12;
// Room for Claude's thinking plus the reply (thinking counts toward max_tokens).
export const AGENT_MAX_TOKENS={voice:2048,typed:4096};
function safe(value,limit=14000){try{return JSON.stringify(value??{}).slice(0,limit)}catch{return'{}'}}
// The phone sends every market zone (56 in Baltimore, about 7 KB). Left as is,
// that list filled the 8 KB state budget and cut off safety, events and the
// forecast. Keep the strongest zones and drop their coordinates.
export const STATE_ZONES=12;
export function compactState(context){
 if(!context||typeof context!=='object')return{};
 const out={...context};
 if(Array.isArray(context.zones)){
  const zones=context.zones.filter(z=>z&&typeof z==='object');
  out.zones=zones.slice().sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0)).slice(0,STATE_ZONES).map(z=>({name:z.name,score:Number.isFinite(Number(z.score))?Math.round(Number(z.score)*1000)/1000:null,provenance:z.provenance}));
  if(zones.length>STATE_ZONES)out.zonesShown=`top ${STATE_ZONES} of ${zones.length} by score`;
 }
 return out;
}
function point(location){
 const lat=Array.isArray(location)?location[0]:location?.lat??location?.latitude;
 const lon=Array.isArray(location)?location[1]:location?.lng??location?.lon??location?.longitude;
 return Number.isFinite(Number(lat))&&Number.isFinite(Number(lon))&&Math.abs(lat)<=90&&Math.abs(lon)<=180?[Number(lat),Number(lon)]:null;
}
// The model has no clock. Give it the driver's local date and time so it can
// tell "tonight" from "already over". Falls back to Eastern (the launch market).
export function localNow(timeZone,now=new Date()){
 for(const tz of [timeZone,'America/New_York']){
  if(typeof tz!=='string'||!tz)continue;
  try{return{timeZone:tz,text:new Intl.DateTimeFormat('en-US',{timeZone:tz,weekday:'long',year:'numeric',month:'long',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(now)}}catch{}
 }
 return{timeZone:'UTC',text:now.toISOString()};
}
// Hourly and daily forecast for the driver's location from Open-Meteo (free,
// no key; already credited in data-attributions.txt). Best effort: null on
// any failure or after timeoutMs, so a slow weather service never delays an answer much.
export async function loadOpenMeteoForecast(location,{fetchImpl=fetch,timeoutMs=2000,hours=18}={}){
 const at=point(location);if(!at)return null;
 const url='https://api.open-meteo.com/v1/forecast?latitude='+at[0].toFixed(3)+'&longitude='+at[1].toFixed(3)
  +'&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,snowfall,weather_code,wind_speed_10m'
  +'&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,weather_code'
  +'&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=2&forecast_hours='+hours;
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeoutMs);
 try{
  const res=await fetchImpl(url,{signal:ctrl.signal});if(!res.ok)return null;
  const w=await res.json(),h=w?.hourly||{},d=w?.daily||{},n=v=>v==null||!Number.isFinite(Number(v))?null:Math.round(Number(v)*10)/10;
  const hourly=(h.time||[]).slice(0,hours).map((time,i)=>({time,tempF:n(h.temperature_2m?.[i]),feelsLikeF:n(h.apparent_temperature?.[i]),rainChance:n(h.precipitation_probability?.[i]),precipIn:n(h.precipitation?.[i]),snowIn:n(h.snowfall?.[i]),windMph:n(h.wind_speed_10m?.[i]),code:h.weather_code?.[i]??null}));
  const daily=(d.time||[]).slice(0,2).map((date,i)=>({date,highF:n(d.temperature_2m_max?.[i]),lowF:n(d.temperature_2m_min?.[i]),rainChance:n(d.precipitation_probability_max?.[i]),precipIn:n(d.precipitation_sum?.[i]),code:d.weather_code?.[i]??null}));
  if(!hourly.length&&!daily.length)return null;
  return{source:'Open-Meteo',timezone:w.timezone||null,codes:'WMO weather codes: 0 clear, 1-3 partly cloudy to overcast, 45-48 fog, 51-57 drizzle, 61-67 rain, 71-77 snow, 80-82 showers, 85-86 snow showers, 95-99 thunderstorm',daily,hourly};
 }catch{return null}finally{clearTimeout(timer)}
}
function outputText(payload){return(payload?.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text||'').join('\n').trim()}
function actionCalls(payload){return(payload?.output||[]).filter(x=>x?.type==='function_call').flatMap(x=>{try{return[{callId:x.call_id||x.id,name:x.name,arguments:JSON.parse(x.arguments||'{}')}]}catch{return[]}})}
const ACTION_TOOLS=[
 {type:'function',name:'refresh',description:'Refresh Home Base GPS and live signals when the driver explicitly asks to refresh or update their current position.',parameters:{type:'object',properties:{},additionalProperties:false}},
 {type:'function',name:'heatmap',description:'Toggle the Home Base demand heat map when the driver explicitly asks to show, hide, enable, disable, or toggle it.',parameters:{type:'object',properties:{},additionalProperties:false}},
 {type:'function',name:'bonuses',description:'Toggle confirmed live driver bonus markers when explicitly requested.',parameters:{type:'object',properties:{},additionalProperties:false}},
 {type:'function',name:'events',description:'Open the Home Base rideshare-relevant events view when explicitly requested.',parameters:{type:'object',properties:{},additionalProperties:false}},
 {type:'function',name:'twelve_hour',description:'Open the Home Base 12-hour demand timeline when explicitly requested.',parameters:{type:'object',properties:{},additionalProperties:false}},
 {type:'function',name:'navigate',description:'Start navigation to the destination already selected in Home Base. Use only when the driver clearly asks to navigate/go/take me there; never invent a destination.',parameters:{type:'object',properties:{},additionalProperties:false}}
];

// Accept at most one driver photo (screenshot of a driver app, a sign, a receipt) as a data URL.
function cleanAttachments(attachments){
 if(!Array.isArray(attachments))return[];
 return attachments.slice(0,1).flatMap(a=>{const url=String(a?.dataUrl||a?.url||'');if(!/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(url)||url.length>5_000_000)return[];return[{type:'input_image',image_url:url,detail:'auto'}]});
}
function errorWithCode(message,code){return Object.assign(new Error(message),{code})}

export function makeHomeBaseAgent({provider='openai',apiKey,model='gpt-6-luna',visionModel,fastModel,fetchImpl=fetch,loadMemory,loadTurns,saveTurn,upsertMemories,forgetMemories=async()=>{},loadForecast=async()=>null,timeoutMs=60000}={}){
 // Cost bounds per message (we pay per message): recent history only, compact
 // context, short replies, and the plan's web-search allowance.
 return async({userId,utterance,context={},conversationId='default',capabilities=[],actionResults=[],channel='voice',attachments=[],webSearches}={})=>{
  if(!apiKey)throw errorWithCode('Home Base AI is not configured.','ai_not_configured');
  if(!userId)throw errorWithCode('Sign in first.','sign_in');
  const images=cleanAttachments(attachments);
  if(typeof utterance!=='string'||utterance.length>8000)throw Error('Ask Home Base a shorter question.');
  if(!utterance.trim()&&!images.length)throw Error('Ask Home Base a question.');
  const typed=channel==='chat';
  const [memories,turns,forecast]=await Promise.all([loadMemory(userId),loadTurns(userId,conversationId),Promise.resolve().then(()=>loadForecast(context?.location)).catch(()=>null)]);
  const state=compactState(context);if(forecast)state.forecast=forecast;
  const clock=localNow(forecast?.timezone||context?.tz);
  const instructions=`You are Home Base Copilot, a persistent learning AI dispatcher and a full general-purpose assistant. You are the primary intelligence, not a command parser. Use the project brain below as durable product knowledge.

${PROJECT_KNOWLEDGE}

WHAT YOU HAVE LEARNED ABOUT THIS DRIVER (from past conversations; newest first):
${memoryLines(memories,4000)}

HOW THIS DRIVER USES HOME BASE (measured on the phone):
${safe(context?.driverProfile||{},3000)}

CURRENT LOCAL TIME FOR THE DRIVER: ${clock.text} (${clock.timeZone})

CURRENT HOME BASE STATE:
${safe(state,12000)}

Behavior:
- Hold a real back-and-forth conversation. Use the earlier turns in this conversation; resolve "it", "there", "that one" from them. Ask a short follow-up question only when you truly cannot answer.
- Answer the driver's actual question, whatever the topic. Never respond with a canned command menu merely because wording is unfamiliar.
- Treat conversation history, current state, and durable memory as context. Preserve active goals and constraints until changed.
- If a fact may be current, local, changing, unknown, or outside supplied Home Base data, use web search. Do not guess.
- For driving questions, combine real-world facts with Home Base state and provide actionable advice: what to do, where/direction, timing, platform/mode, why, and uncertainty.
- If the driver attaches a photo (for example a driver-app screenshot), read it carefully and use what it shows; say plainly if something is unreadable.
- Never present a prediction as live platform data.
- Do not fabricate demand, surge, earnings, events, traffic, weather, airport conditions, or platform capabilities.
- Weather: CURRENT HOME BASE STATE.forecast is the live hourly and daily forecast for the driver's location (Open-Meteo). Answer weather questions from it with real numbers (high and low, rain chance and timing, feels-like, wind) in the driver's local time, and say it comes from Open-Meteo. Use web search for weather only when forecast is missing.
- Time: CURRENT LOCAL TIME FOR THE DRIVER is now. Say times in that zone. Events that have already ended are not "tonight"; check event times against the current time before calling anything upcoming.
- For general knowledge questions, answer normally. Driving advice is optional unless relevant.
- Learn from outcomes and explicit preferences, but do not treat one observation as a permanent truth. Prefer repeated evidence.
- Personalize. Use what you have learned and how this driver works (usual hours, areas, platforms, goals, pay rules) without making them repeat it. If they ask what you know about them, tell them plainly and say they can ask you to forget anything.
- Be predictive. When it helps, add one short forward-looking point the driver did not ask for but will need soon, based on their usual pattern and the live data (for example rain starting near their usual start time, an event letting out near their usual area, their goal pace). Do not invent anything to do this.
- Safety first: if CURRENT HOME BASE STATE shows an active weather alert or a nearby crash, closure or heavy traffic, mention it when relevant to where they are going.
- Never self-modify code or security rules. Learning means updating driver memory and future recommendations.
${typed?'- This message was TYPED in the Home Base chat screen. Reply like a capable assistant: complete and well organized, using short Markdown (bold, bullet lists, numbered steps, small tables) when it helps. The driver is not reading while moving.':'- This message was SPOKEN. Your reply will be read aloud: no Markdown, no lists, no links or URLs, no emoji. If the driver is moving, lead with the decision in two or three short sentences; give more only when parked or asked.'}
- Sound like a capable human dispatcher, not a radio parody.`;
  const verifiedResults=Array.isArray(actionResults)?actionResults.slice(0,8):[];
  const text=(utterance.trim()||'What does this photo show, and what should I do about it?')+(verifiedResults.length?'\n\nVERIFIED HOME BASE ACTION RESULTS:\n'+safe(verifiedResults,5000):'');
  const userContent=images.length?[{type:'input_text',text},...images]:text;
  const input=[...turns.slice(-HISTORY_TURNS).map(t=>({role:t.role==='assistant'?'assistant':'user',content:String(t.content||'')})).filter(t=>t.content),{role:'user',content:userContent}];
  if(provider==='anthropic'){
   const searches=webSearches==null?WEB_SEARCH.max_uses:Math.max(0,Math.min(WEB_SEARCH.max_uses,Number(webSearches)||0));
   const tools=[...(searches?[{...WEB_SEARCH,max_uses:searches}]:[]),...claudeTools(ACTION_TOOLS.filter(t=>!Array.isArray(capabilities)||!capabilities.length||capabilities.includes(t.name)))];
   const content=images.length?[{type:'text',text},...images.map(i=>claudeImage(i.image_url)).filter(Boolean)]:text;
   const messages=[...claudeMessages(turns.slice(-HISTORY_TURNS).map(t=>({role:t.role,content:String(t.content||'')}))),{role:'user',content}];
   if(messages.length>1&&messages[messages.length-2].role==='user'){const prev=messages.splice(messages.length-2,1)[0];messages[messages.length-1].content=typeof content==='string'?prev.content+'\n\n'+content:[{type:'text',text:prev.content},...content];}
   // Current Claude models think before answering, and that thinking counts against
   // max_tokens. The old 450/1024 caps were used up by thinking alone, so Claude stopped
   // (stop_reason max_tokens) before writing any words. Leave room for thinking and keep
   // cost down with effort instead: spoken replies think briefly, typed replies a bit more.
   // Short answers are still asked for in the instructions; unused room is not billed.
   const request={apiKey,fetchImpl,timeoutMs,stage:'agent',model:images.length&&visionModel?visionModel:model,max_tokens:typed?AGENT_MAX_TOKENS.typed:AGENT_MAX_TOKENS.voice,output_config:{effort:typed||images.length?'medium':'low'},system:instructions,messages};
   let message=await callClaude({...request,tools});
   let actions=toolCalls(message),sources=sourcesOf(message);
   let answer=textOf(message);
   // A reply with no words (a search that never finished, or a stop with no text) gets one
   // plain retry without tools and with the least thinking, so the driver hears a real answer.
   if(!actions.length&&!answer){const first=message?.stop_reason;message=await callClaude({...request,stage:'agent_retry',max_tokens:AGENT_MAX_TOKENS.typed,output_config:{effort:'low'}});actions=toolCalls(message);sources=sourcesOf(message);answer=textOf(message);
    if(!answer)throw Object.assign(errorWithCode('Home Base AI returned no answer.','ai_empty'),{provider_code:String(message?.stop_reason||first||'none'),provider_stage:'agent_retry'});}
   if(actions.length)return{answer:answer||'Executing the requested Home Base action.',actions,provider:'Claude',agent:true,execution:'action_required'};
   if(typed&&sources.length)answer+='\n\n**Sources:** '+sources.map(s=>'['+String(s.title).replace(/[\[\]]/g,'')+']('+s.url+')').join(' · ');
   const savedUtterance=(utterance.trim()||'(photo)')+(images.length&&utterance.trim()?' [photo attached]':'');
   await saveTurn(userId,conversationId,'user',savedUtterance,context);
   await saveTurn(userId,conversationId,'assistant',answer,{channel});
   try{
    const learned=await claudeJson({apiKey,fetchImpl,timeoutMs:12000,stage:'memory',model:fastModel||model,maxTokens:600,name:'save_memories',system:LEARN_SYSTEM,
     user:'Existing memory:\n'+memoryLines(memories,3000)+'\n\nDriver said: '+savedUtterance+'\nHome Base answered: '+answer.slice(0,3000),schema:LEARN_SCHEMA});
    const known=new Set((memories||[]).map(m=>m.memory_key||m.key));
    const forget=(Array.isArray(learned.forget)?learned.forget:[]).filter(k=>known.has(k));
    if(forget.length)await forgetMemories(userId,forget);
    if(Array.isArray(learned.memories)&&learned.memories.length)await upsertMemories(userId,learned.memories);
   }catch{}
   return{answer,sources,provider:'Claude',agent:true,channel,conversationId,execution:verifiedResults.length?'verified_action_result':'advisory'};
  }
  let response;
  try{response=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',signal:AbortSignal.timeout(timeoutMs),headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({model,store:false,instructions,input,reasoning:{effort:typed?'medium':'low'},tools:[{type:'web_search'},...ACTION_TOOLS.filter(t=>!Array.isArray(capabilities)||!capabilities.length||capabilities.includes(t.name))],tool_choice:'auto',max_output_tokens:typed?4000:1400})});}
  catch(error){if(error?.name==='TimeoutError'||error?.name==='AbortError')throw errorWithCode('Home Base AI took too long to answer.','ai_timeout');throw error;}
  const payload=await response.json().catch(()=>({}));if(!response.ok)throw providerFailure(response,payload,'responses');
  const actions=actionCalls(payload);
  const answer=outputText(payload);
  if(actions.length)return{answer:answer||'Executing the requested Home Base action.',actions,provider:'OpenAI',agent:true,execution:'action_required'};
  if(!answer)throw errorWithCode('Home Base AI returned no answer.','ai_empty');
  const savedUtterance=(utterance.trim()||'(photo)')+(images.length&&utterance.trim()?' [photo attached]':'');
  await saveTurn(userId,conversationId,'user',savedUtterance,context);
  await saveTurn(userId,conversationId,'assistant',answer,{channel});
  try{
   const learn=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',signal:AbortSignal.timeout(9000),headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({model,store:false,instructions:'Extract only durable driver-specific information that should improve future Home Base recommendations: explicit preferences, goals, constraints, repeated lessons, stable facts, or strategies. Do not save transient weather, one-time locations, secrets, passwords, exact home address, health data, or guesses. Return JSON only.',input:'User: '+savedUtterance+'\nAssistant: '+answer,max_output_tokens:400,text:{format:{type:'json_schema',name:'homebase_memory_update',strict:true,schema:{type:'object',additionalProperties:false,required:['memories'],properties:{memories:{type:'array',maxItems:5,items:{type:'object',additionalProperties:false,required:['key','type','summary','confidence'],properties:{key:{type:'string'},type:{type:'string',enum:['preference','goal','constraint','lesson','fact','strategy']},summary:{type:'string'},confidence:{type:'number'}}}}}}}}})});
   if(learn.ok){const lp=await learn.json(),raw=outputText(lp),parsed=JSON.parse(raw||'{"memories":[]}');if(Array.isArray(parsed.memories)&&parsed.memories.length)await upsertMemories(userId,parsed.memories);}
  }catch{}
  return{answer,provider:'OpenAI',agent:true,channel,conversationId,execution:verifiedResults.length?'verified_action_result':'advisory'};
 };
}
