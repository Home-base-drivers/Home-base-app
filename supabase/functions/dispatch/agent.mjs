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
Event discovery is operational, not a general event calendar: when finding events for Home Base, use web search for the driver's Current Location or selected Custom Location and include only events that are live now or begin within the next 12 hours. Prioritize events likely to materially affect rideshare demand (major sports, concerts, festivals, conventions/conferences, large performing-arts/comedy shows, graduations/commencements, and other high-attendance gatherings). Exclude small, virtual, low-impact, or irrelevant events. Return event date and local start time, venue/location, and rideshare relevance. Never extend the Home Base event window beyond 12 hours unless the driver explicitly asks for a different period.
The learning loop records recommendations, whether followed, actual earnings, time, miles, destination, next-trip wait and final profitability so future advice improves per driver.
Driver privacy: exact home location is sensitive; minimize storage and never expose it in shared analytics.
`;

function safe(value,limit=14000){try{return JSON.stringify(value??{}).slice(0,limit)}catch{return'{}'}}
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

export function makeHomeBaseAgent({apiKey,model='gpt-6-luna',fetchImpl=fetch,loadMemory,loadTurns,saveTurn,upsertMemories}={}){
 return async({userId,utterance,context={},conversationId='default',capabilities=[],actionResults=[]}={})=>{
  if(!apiKey)throw Error('Home Base AI is not configured.');
  if(!userId)throw Error('Sign in first.');
  if(typeof utterance!=='string'||!utterance.trim()||utterance.length>4000)throw Error('Ask Home Base a shorter question.');
  const memories=await loadMemory(userId);
  const turns=await loadTurns(userId,conversationId);
  const instructions=`You are Home Base Copilot, a persistent learning AI dispatcher and general-purpose assistant. You are the primary intelligence, not a command parser. Use the project brain below as durable product knowledge.

${PROJECT_KNOWLEDGE}

CURRENT DRIVER MEMORY:
${safe(memories,12000)}

CURRENT HOME BASE STATE:
${safe(context,14000)}

Behavior:
- Answer the driver's actual question. Never respond with a canned command menu merely because wording is unfamiliar.
- Treat conversation history, current state, and durable memory as context. Preserve active goals and constraints until changed.
- If a fact may be current, local, changing, unknown, or outside supplied Home Base data, use web search. Do not guess.
- For driving questions, combine real-world facts with Home Base state and provide actionable advice: what to do, where/direction, timing, platform/mode, why, and uncertainty.
- Never present a prediction as live platform data.
- Do not fabricate demand, surge, earnings, events, traffic, weather, airport conditions, or platform capabilities.
- For general knowledge questions, answer normally. Driving advice is optional unless relevant.
- Learn from outcomes and explicit preferences, but do not treat one observation as a permanent truth. Prefer repeated evidence.
- Never self-modify code or security rules. Learning means updating driver memory and future recommendations.
- If the driver is moving, lead with the decision and use short spoken-friendly paragraphs. If parked or asking for detail, be more comprehensive.
- Sound like a capable human dispatcher, not a radio parody.`;
  const verifiedResults=Array.isArray(actionResults)?actionResults.slice(0,8):[];
  const input=[...turns.slice(-20).map(t=>({role:t.role,content:t.content})),{role:'user',content:utterance+(verifiedResults.length?'\n\nVERIFIED HOME BASE ACTION RESULTS:\n'+safe(verifiedResults,5000):'')}];
  const response=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',signal:AbortSignal.timeout(25000),headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({model,store:false,instructions,input,reasoning:{effort:'medium'},tools:[{type:'web_search'},...ACTION_TOOLS.filter(t=>!Array.isArray(capabilities)||!capabilities.length||capabilities.includes(t.name))],tool_choice:'auto',max_output_tokens:1400})});
  const payload=await response.json().catch(()=>({}));if(!response.ok)throw Error(payload?.error?.message||'Home Base AI is unavailable.');
  const actions=actionCalls(payload);
  const answer=outputText(payload);
  if(actions.length)return{answer:answer||'Executing the requested Home Base action.',actions,provider:'OpenAI',agent:true,execution:'action_required'};
  if(!answer)throw Error('Home Base AI returned no answer.');
  await saveTurn(userId,conversationId,'user',utterance,context);
  await saveTurn(userId,conversationId,'assistant',answer,{});
  try{
   const learn=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',signal:AbortSignal.timeout(9000),headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({model,store:false,instructions:'Extract only durable driver-specific information that should improve future Home Base recommendations: explicit preferences, goals, constraints, repeated lessons, stable facts, or strategies. Do not save transient weather, one-time locations, secrets, passwords, exact home address, health data, or guesses. Return JSON only.',input:'User: '+utterance+'\nAssistant: '+answer,max_output_tokens:400,text:{format:{type:'json_schema',name:'homebase_memory_update',strict:true,schema:{type:'object',additionalProperties:false,required:['memories'],properties:{memories:{type:'array',maxItems:5,items:{type:'object',additionalProperties:false,required:['key','type','summary','confidence'],properties:{key:{type:'string'},type:{type:'string',enum:['preference','goal','constraint','lesson','fact','strategy']},summary:{type:'string'},confidence:{type:'number'}}}}}}}}})});
   if(learn.ok){const lp=await learn.json(),raw=outputText(lp),parsed=JSON.parse(raw||'{"memories":[]}');if(Array.isArray(parsed.memories)&&parsed.memories.length)await upsertMemories(userId,parsed.memories);}
  }catch{}
  return{answer,provider:'OpenAI',agent:true,execution:verifiedResults.length?'verified_action_result':'advisory'};
 };
}
