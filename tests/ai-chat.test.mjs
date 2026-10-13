import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {makeHomeBaseAgent} from '../supabase/functions/dispatch/agent.mjs';
import {makeDispatchHandler} from '../supabase/functions/dispatch/handler.mjs';

function fakeOpenAI(reply='Head toward Fells Point.'){
 const calls=[];
 const fetchImpl=async(url,init)=>{const body=JSON.parse(init.body);calls.push({url,body});
  if(body.text?.format?.name==='homebase_memory_update')return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:'{"memories":[]}'}]}]}),{status:200});
  return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:reply}]}]}),{status:200});};
 return{calls,fetchImpl};
}
function agentWith(fetchImpl,turns=[]){
 const saved=[];
 return{saved,agent:makeHomeBaseAgent({apiKey:'test',fetchImpl,loadMemory:async()=>[],loadTurns:async()=>turns,saveTurn:async(...a)=>saved.push(a),upsertMemories:async()=>{}})};
}

test('typed chat sends the whole conversation and asks for ChatGPT-style formatting',async()=>{
 const ai=fakeOpenAI();const {agent,saved}=agentWith(ai.fetchImpl,[{role:'user',content:'Where is the game?'},{role:'assistant',content:'M&T Bank Stadium.'}]);
 const r=await agent({userId:'u1',utterance:'How long until it lets out?',channel:'chat'});
 assert.equal(r.answer,'Head toward Fells Point.');
 const main=ai.calls[0].body;
 assert.equal(main.input.length,3,'prior turns plus the new message');
 assert.equal(main.input[1].content,'M&T Bank Stadium.');
 assert.match(main.instructions,/TYPED/);assert.match(main.instructions,/Markdown/);
 assert.ok(main.max_output_tokens>=4000);
 assert.equal(saved.length,2);
});

test('spoken requests get short, read-aloud answers',async()=>{
 const ai=fakeOpenAI();const {agent}=agentWith(ai.fetchImpl);
 await agent({userId:'u1',utterance:'Where should I go?',channel:'voice'});
 assert.match(ai.calls[0].body.instructions,/SPOKEN/);assert.match(ai.calls[0].body.instructions,/no Markdown/);
});

test('a screenshot is passed to the AI as an image',async()=>{
 const ai=fakeOpenAI();const {agent,saved}=agentWith(ai.fetchImpl);
 await agent({userId:'u1',utterance:'Is this surge worth it?',channel:'chat',attachments:[{dataUrl:'data:image/jpeg;base64,AAAA'}]});
 const content=ai.calls[0].body.input.at(-1).content;
 assert.equal(content[0].type,'input_text');assert.equal(content[1].type,'input_image');
 assert.match(saved[0][3],/photo attached/);
 const bad=fakeOpenAI();const b=agentWith(bad.fetchImpl);
 await b.agent({userId:'u1',utterance:'hi',channel:'chat',attachments:[{dataUrl:'javascript:alert(1)'}]});
 assert.equal(typeof bad.calls[0].body.input.at(-1).content,'string','unsafe attachment dropped');
});

test('missing server key reports not configured instead of a canned answer',async()=>{
 const agent=makeHomeBaseAgent({apiKey:'',loadMemory:async()=>[],loadTurns:async()=>[],saveTurn:async()=>{},upsertMemories:async()=>{}});
 const handler=makeDispatchHandler({engine:{},agent,authenticate:async()=>({id:'u1'}),loadState:async()=>({}),loadTrips:async()=>[]});
 const res=await handler(new Request('https://x/dispatch',{method:'POST',headers:{Authorization:'Bearer t'},body:JSON.stringify({operation:'agent',utterance:'hi',channel:'chat'})}));
 assert.equal(res.status,503);const body=await res.json();assert.equal(body.code,'ai_not_configured');
});

test('photo-sized chat requests are accepted, other operations stay small',async()=>{
 const ai=fakeOpenAI();const {agent}=agentWith(ai.fetchImpl);
 const handler=makeDispatchHandler({engine:{},agent,authenticate:async()=>({id:'u1'}),loadState:async()=>({}),loadTrips:async()=>[]});
 const big='data:image/jpeg;base64,'+'A'.repeat(200000);
 const ok=await handler(new Request('https://x/dispatch',{method:'POST',headers:{Authorization:'Bearer t'},body:JSON.stringify({operation:'agent',utterance:'read this',channel:'chat',attachments:[{dataUrl:big}]})}));
 assert.equal(ok.status,200);
 const no=await handler(new Request('https://x/dispatch',{method:'POST',headers:{Authorization:'Bearer t'},body:JSON.stringify({operation:'score',pad:'x'.repeat(70000)})}));
 assert.equal(no.status,413);
});

test('chat Markdown renderer is safe and readable',()=>{
 const code=fs.readFileSync(new URL('../dist/homebase-chat.js',import.meta.url),'utf8');
 const ctx={window:{},setInterval:()=>0,clearInterval:()=>{},document:{getElementById:()=>null}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(code,ctx);
 const f=ctx.HomeBaseChat.format;
 assert.equal(f('<img src=x onerror=alert(1)>').includes('<img'),false);
 assert.match(f('**Go now**\n- Fells Point\n- Canton'),/<strong>Go now<\/strong>[\s\S]*<ul><li>Fells Point<\/li><li>Canton<\/li><\/ul>/);
 assert.match(f('[Ravens](https://www.baltimoreravens.com)'),/href="https:\/\/www\.baltimoreravens\.com" target="_blank" rel="noopener noreferrer"/);
 assert.equal(f('[x](javascript:alert(1))').includes('href'),false);
 assert.match(f('| Area | Surge |\n|---|---|\n| Towson | $13 |'),/<table>[\s\S]*<td>Towson<\/td><td>\$13<\/td>/);
});

test('app routes questions to Home Base AI by default and shows real failures',()=>{
 const copilot=fs.readFileSync(new URL('../dist/homebase-copilot.js',import.meta.url),'utf8');
 const client=fs.readFileSync(new URL('../dist/homebase-agent-client.js',import.meta.url),'utf8');
 const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
 assert.match(copilot,/if\(state\.aiUnderstanding===undefined\)state\.aiUnderstanding=true;/);
 assert.match(copilot,/aiFailure=window\.HomeBaseAgentClient\?\.describeError/);
 assert.match(client,/describeError/);assert.match(client,/channel/);
 assert.match(html,/homebase-chat\.js\?v=\d+/);
});
