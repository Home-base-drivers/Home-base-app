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
 assert.equal(f.calls[0].body.max_tokens,700);
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
