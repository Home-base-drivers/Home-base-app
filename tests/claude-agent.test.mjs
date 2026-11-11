import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeHomeBaseAgent} from '../supabase/functions/dispatch/agent.mjs';
import {makeLanguageParser,makeLanguageTranslator} from '../supabase/functions/dispatch/language.mjs';
import {claudeMessages,callClaude} from '../supabase/functions/dispatch/claude.mjs';

const memory=()=>{const turns=[],mem=[];return{turns,mem,loadMemory:async()=>[],loadTurns:async()=>turns.slice(),saveTurn:async(u,c,role,content)=>{turns.push({role,content})},upsertMemories:async(u,m)=>{mem.push(...m)}};};
function fakeClaude(responses){const calls=[];return{calls,fetchImpl:async(url,init)=>{calls.push({url,headers:init.headers,body:JSON.parse(init.body)});const r=responses.shift();return new Response(JSON.stringify(r.body),{status:r.status||200,headers:{'request-id':'req_1'}});}};}

test('Home Base AI answers through Claude with web search, sources and driver memory',async()=>{
 const m=memory(),f=fakeClaude([
  {body:{stop_reason:'end_turn',content:[{type:'server_tool_use',id:'srv_1',name:'web_search',input:{query:'Ravens game time'}},{type:'web_search_tool_result',tool_use_id:'srv_1',content:[]},{type:'text',text:'Kickoff is 1 PM. ',citations:[{type:'web_search_result_location',url:'https://www.baltimoreravens.com/schedule',title:'Ravens schedule'}]},{type:'text',text:'Be near the stadium by 4:15.'}]}},
  {body:{stop_reason:'tool_use',content:[{type:'tool_use',id:'tu_1',name:'save_memories',input:{memories:[{key:'goal',type:'goal',summary:'Wants $100 every 3 hours',confidence:.8}]}}]}}]);
 const agent=makeHomeBaseAgent({provider:'anthropic',apiKey:'sk-ant-x',model:'claude-sonnet-5-5',fastModel:'claude-haiku-5-5',fetchImpl:f.fetchImpl,...m});
 const r=await agent({userId:'u1',utterance:'When is the Ravens game? My goal is $100 every 3 hours.',channel:'chat'});
 assert.equal(r.provider,'Claude');assert.match(r.answer,/Kickoff is 1 PM\. Be near the stadium by 4:15\./);assert.match(r.answer,/\*\*Sources:\*\* \[Ravens schedule\]\(https:\/\/www\.baltimoreravens\.com\/schedule\)/);
 const req=f.calls[0];assert.equal(req.url,'https://api.anthropic.com/v1/messages');assert.equal(req.headers['x-api-key'],'sk-ant-x');assert.equal(req.headers['anthropic-version'],'2023-06-01');
 assert.equal(req.body.model,'claude-sonnet-5-5');assert.ok(req.body.tools.some(t=>t.type==='web_search_20250305'));assert.ok(req.body.tools.some(t=>t.name==='navigate'&&t.input_schema));
 assert.match(req.body.system,/Home Base Copilot/);assert.equal(req.body.messages.at(-1).role,'user');
 assert.equal(f.calls[1].body.model,'claude-haiku-5-5');assert.deepEqual(f.calls[1].body.tool_choice,{type:'tool',name:'save_memories'});
 assert.equal(m.mem[0].summary,'Wants $100 every 3 hours');assert.equal(m.turns.length,2);
});

test('spoken requests get no source list, app actions come back as actions, and pause_turn continues',async()=>{
 const m=memory(),f=fakeClaude([
  {body:{stop_reason:'pause_turn',content:[{type:'server_tool_use',id:'s',name:'web_search',input:{query:'x'}}]}},
  {body:{stop_reason:'tool_use',content:[{type:'tool_use',id:'tu_9',name:'navigate',input:{}}]}}]);
 const agent=makeHomeBaseAgent({provider:'anthropic',apiKey:'k',model:'claude-sonnet-5-5',fetchImpl:f.fetchImpl,...m});
 const r=await agent({userId:'u1',utterance:'take me there',channel:'voice',capabilities:['navigate']});
 assert.equal(r.execution,'action_required');assert.equal(r.actions[0].name,'navigate');assert.equal(r.actions[0].callId,'tu_9');
 assert.equal(f.calls.length,2);assert.equal(f.calls[1].body.messages.at(-1).role,'assistant','paused turn is sent back to continue');
 assert.equal(f.calls[0].body.max_tokens,2048);assert.deepEqual(f.calls[0].body.output_config,{effort:'low'},'spoken replies think briefly');
});

test('a Claude account with no credit gets a plain owner message, not a crash',async()=>{
 const m=memory(),f=fakeClaude([{status:400,body:{type:'error',error:{type:'invalid_request_error',message:'Your credit balance is too low to access the Anthropic API.'}}}]);
 const agent=makeHomeBaseAgent({provider:'anthropic',apiKey:'k',model:'claude-sonnet-5-5',fetchImpl:f.fetchImpl,...m});
 await assert.rejects(agent({userId:'u1',utterance:'hi',channel:'chat'}),e=>e.code==='ai_no_credit'&&/no credit left/.test(e.message)&&!/credit balance is too low/.test(e.message));
});

test('turns are reshaped into the alternating order Claude requires',()=>{
 assert.deepEqual(claudeMessages([{role:'assistant',content:'hello'},{role:'user',content:'a'},{role:'user',content:'b'},{role:'assistant',content:'c'},{role:'user',content:''}]),[{role:'user',content:'a\n\nb'},{role:'assistant',content:'c'}]);
});

test('command understanding and translation run on Claude with forced structured output',async()=>{
 const engine={MODES:['diamond','max_profit'],parseCommand:()=>({type:'unknown'})};
 const f=fakeClaude([{body:{stop_reason:'tool_use',content:[{type:'tool_use',id:'t',name:'homebase_copilot_result',input:{kind:'command',answer:null,type:'target',mode:null,amount:150,additional:false,thenHome:false,remaining:false}}]}},
  {body:{stop_reason:'tool_use',content:[{type:'tool_use',id:'t2',name:'dispatch_translation',input:{text:'Ve a [[HB0]] ahora.'}}]}}]);
 const parse=makeLanguageParser({provider:'anthropic',apiKey:'k',model:'claude-haiku-5-5',fetchImpl:f.fetchImpl,engine});
 const r=await parse('I want to make a hundred fifty today');assert.equal(r.provider,'Claude');assert.equal(r.command.type,'target');assert.equal(r.command.amount,150);
 assert.equal(f.calls[0].body.model,'claude-haiku-5-5');assert.ok(!/use web search/.test(f.calls[0].body.system));
 const t=await makeLanguageTranslator({provider:'anthropic',apiKey:'k',model:'claude-haiku-5-5',fetchImpl:f.fetchImpl})('Go to Uber now.','es-US');
 assert.equal(t.provider,'Claude');assert.equal(t.text,'Ve a Uber ahora.');
});

test('a Claude reply with no words is retried once without tools, and a second empty reply names its stop reason',async()=>{
 const m=memory(),f=fakeClaude([
  {body:{stop_reason:'end_turn',content:[{type:'server_tool_use',id:'s',name:'web_search',input:{query:'x'}}]}},
  {body:{stop_reason:'end_turn',content:[{type:'text',text:'Head to Fells Point after 9.'}]}},
  {body:{stop_reason:'tool_use',content:[{type:'tool_use',id:'tu_1',name:'save_memories',input:{memories:[]}}]}}]);
 const agent=makeHomeBaseAgent({provider:'anthropic',apiKey:'k',model:'claude-haiku-5-5',fetchImpl:f.fetchImpl,...m});
 const r=await agent({userId:'u1',utterance:'Where should I drive tonight?',channel:'voice'});
 assert.equal(r.answer,'Head to Fells Point after 9.');
 assert.ok(f.calls[0].body.tools.length);assert.equal(f.calls[1].body.tools,undefined,'the retry has no tools');
 const m2=memory(),g=fakeClaude([{body:{stop_reason:'end_turn',content:[]}},{body:{stop_reason:'max_tokens',content:[]}}]);
 const again=makeHomeBaseAgent({provider:'anthropic',apiKey:'k',model:'claude-haiku-5-5',fetchImpl:g.fetchImpl,...m2});
 await assert.rejects(again({userId:'u1',utterance:'hi',channel:'voice'}),e=>e.code==='ai_empty'&&e.provider_code==='max_tokens'&&e.provider_stage==='agent_retry');
 assert.equal(m2.turns.length,0);
});

test('thinking that fills the token cap no longer leaves the driver with a blank answer',async()=>{
 // What production logged on Oct 30: Claude thought, hit max_tokens, and wrote no words.
 const m=memory(),f=fakeClaude([
  {body:{stop_reason:'max_tokens',content:[{type:'thinking',thinking:'',signature:'sig'}]}},
  {body:{stop_reason:'end_turn',content:[{type:'thinking',thinking:'',signature:'sig2'},{type:'text',text:'Downtown is busiest right now.'}]}},
  {body:{stop_reason:'tool_use',content:[{type:'tool_use',id:'tu_1',name:'save_memories',input:{memories:[]}}]}}]);
 const agent=makeHomeBaseAgent({provider:'anthropic',apiKey:'k',model:'claude-haiku-5-5',fetchImpl:f.fetchImpl,...m});
 const r=await agent({userId:'u1',utterance:'Where is it busy?',channel:'voice'});
 assert.equal(r.answer,'Downtown is busiest right now.','thinking blocks are not read as the answer');
 assert.ok(f.calls[0].body.max_tokens>=2048,'room for thinking plus a spoken reply');
 assert.equal(f.calls[1].body.max_tokens,4096);assert.deepEqual(f.calls[1].body.output_config,{effort:'low'});assert.equal(f.calls[1].body.tools,undefined);
});

test('state sent to Home Base AI keeps the strongest zones, adds the live forecast and the local time',async()=>{
 const {compactState,loadOpenMeteoForecast,localNow}=await import('../supabase/functions/dispatch/agent.mjs');
 const zones=Array.from({length:56},(_,i)=>({name:'Zone '+i,score:i/100,location:[39.2,-76.6],provenance:'PREDICTED'}));
 const s=compactState({zones,safety:{weatherAlerts:[]},market:'Baltimore'});
 assert.equal(s.zones.length,12);assert.equal(s.zones[0].name,'Zone 55');assert.equal(s.zones[0].location,undefined);assert.match(s.zonesShown,/top 12 of 56/);assert.deepEqual(s.safety,{weatherAlerts:[]});
 assert.ok(JSON.stringify(s).length<2500);
 let asked;const weather={timezone:'America/New_York',hourly:{time:['2026-11-09T01:00'],temperature_2m:[41.26],apparent_temperature:[36],precipitation_probability:[20],precipitation:[0],snowfall:[0],weather_code:[3],wind_speed_10m:[7]},daily:{time:['2026-11-09'],temperature_2m_max:[55],temperature_2m_min:[38],precipitation_probability_max:[40],precipitation_sum:[0.05],weather_code:[61]}};
 const f=await loadOpenMeteoForecast([39.29,-76.61],{fetchImpl:async url=>{asked=url;return new Response(JSON.stringify(weather))}});
 assert.match(asked,/^https:\/\/api\.open-meteo\.com\/v1\/forecast\?latitude=39\.290&longitude=-76\.610/);assert.match(asked,/temperature_unit=fahrenheit/);
 assert.equal(f.source,'Open-Meteo');assert.equal(f.hourly[0].tempF,41.3);assert.equal(f.daily[0].highF,55);assert.equal(f.daily[0].rainChance,40);
 assert.equal(await loadOpenMeteoForecast(null),null);
 assert.equal(await loadOpenMeteoForecast([39,-76],{fetchImpl:async()=>{throw Error('down')}}),null);
 assert.equal(await loadOpenMeteoForecast([39,-76],{fetchImpl:(u,{signal})=>new Promise((_,no)=>signal.addEventListener('abort',()=>no(Error('abort')))),timeoutMs:20}),null);
 assert.match(localNow('America/New_York',new Date('2026-11-09T06:21:00Z')).text,/Monday, November 9, 2026.*1:21\sAM/);
 assert.equal(localNow('Not/AZone').timeZone,'America/New_York');
 const m=memory(),c=fakeClaude([{body:{stop_reason:'end_turn',content:[{type:'text',text:'High of 55, 40% rain chance this afternoon.'}]}},{body:{stop_reason:'tool_use',content:[{type:'tool_use',id:'t',name:'save_memories',input:{memories:[],forget:[]}}]}}]);
 const agent=makeHomeBaseAgent({provider:'anthropic',apiKey:'k',model:'claude-haiku-5-5',fetchImpl:c.fetchImpl,loadForecast:async loc=>{assert.deepEqual(loc,[39.29,-76.61]);return f},...m});
 const r=await agent({userId:'u1',utterance:"What's the weather today",context:{location:[39.29,-76.61],zones},channel:'voice'});
 assert.match(r.answer,/High of 55/);const sys=c.calls[0].body.system;
 assert.match(sys,/CURRENT LOCAL TIME FOR THE DRIVER: .*\(America\/New_York\)/);assert.match(sys,/"forecast":\{"source":"Open-Meteo"/);assert.match(sys,/"zonesShown":"top 12 of 56 by score"/);
});

test('the driver gets the answer without waiting for memory learning when the runtime can finish it later',async()=>{
 const m=memory();let releaseLearning;const learningGate=new Promise(r=>{releaseLearning=r;});
 const responses=[{body:{stop_reason:'end_turn',content:[{type:'text',text:'Head to Federal Hill.'}]}},{body:{stop_reason:'tool_use',content:[{type:'tool_use',id:'tu_1',name:'save_memories',input:{memories:[{key:'area',type:'preference',summary:'Likes Federal Hill',confidence:.7}]}}]}}];
 let calls=0;const fetchImpl=async()=>{calls++;if(calls===2)await learningGate;return new Response(JSON.stringify(responses.shift().body),{status:200});};
 const deferred=[];
 const agent=makeHomeBaseAgent({provider:'anthropic',apiKey:'sk-ant-x',model:'claude-haiku-5-5',fetchImpl,background:work=>deferred.push(work),...m});
 const r=await agent({userId:'u1',utterance:'Where should I drive?',channel:'voice'});
 assert.equal(r.answer,'Head to Federal Hill.');assert.equal(m.turns.length,2);
 assert.equal(deferred.length,1);assert.equal(m.mem.length,0,'learning is still running after the answer returned');
 releaseLearning();await deferred[0];assert.equal(m.mem[0].summary,'Likes Federal Hill');
});

test('without a background runner, learning still finishes before the answer returns',async()=>{
 const m=memory(),f=fakeClaude([{body:{stop_reason:'end_turn',content:[{type:'text',text:'Dry tonight.'}]}},{body:{stop_reason:'tool_use',content:[{type:'tool_use',id:'tu_1',name:'save_memories',input:{memories:[{key:'w',type:'preference',summary:'Asks about weather',confidence:.6}]}}]}}]);
 const agent=makeHomeBaseAgent({provider:'anthropic',apiKey:'sk-ant-x',model:'claude-haiku-5-5',fetchImpl:f.fetchImpl,...m});
 const r=await agent({userId:'u1',utterance:'Weather?',channel:'chat'});
 assert.equal(r.answer,'Dry tonight.');assert.equal(m.mem[0].summary,'Asks about weather');
});
