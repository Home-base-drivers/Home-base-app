// Claude (Anthropic Messages API) for Home Base text intelligence: the agent, chat,
// command understanding and translation. Claude has no realtime voice, so spoken
// replies use the phone's own voice; GPT Live stays optional when OpenAI is funded.
import {providerFailure} from './errors.mjs';
export const CLAUDE_URL='https://api.anthropic.com/v1/messages';
export const WEB_SEARCH={type:'web_search_20250305',name:'web_search',max_uses:3};

// Claude needs alternating user/assistant turns that start with the user.
export function claudeMessages(turns){
 const out=[];
 for(const t of turns||[]){const role=t.role==='assistant'?'assistant':'user',content=t.content;if(!content||(typeof content==='string'&&!content.trim()))continue;
  if(!out.length&&role==='assistant')continue;
  const last=out[out.length-1];
  if(last&&last.role===role&&typeof last.content==='string'&&typeof content==='string')last.content+='\n\n'+content;
  else out.push({role,content});}
 return out;
}
export function claudeTools(tools){return(tools||[]).map(t=>t.type==='function'?{name:t.name,description:t.description,input_schema:t.parameters}:t);}
export function claudeImage(dataUrl){const m=/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl||''));if(!m)return null;return{type:'image',source:{type:'base64',media_type:m[1]==='image/jpg'?'image/jpeg':m[1],data:m[2]}};}
export function textOf(message){return(message?.content||[]).filter(b=>b.type==='text').map(b=>b.text||'').join('').trim();}
export function sourcesOf(message){const seen=new Map();for(const b of message?.content||[])for(const c of b.citations||[])if(c?.url&&!seen.has(c.url))seen.set(c.url,c.title||c.url);return[...seen].slice(0,5).map(([url,title])=>({url,title}));}
export function toolCalls(message){return(message?.content||[]).filter(b=>b.type==='tool_use').map(b=>({callId:b.id,name:b.name,arguments:b.input||{}}));}

// One request, continuing the server-side search loop if Claude pauses (pause_turn).
export async function callClaude({apiKey,fetchImpl=fetch,timeoutMs=60000,stage='messages',...body}){
 let messages=body.messages,last=null;
 for(let round=0;round<3;round++){
  let response;
  try{response=await fetchImpl(CLAUDE_URL,{method:'POST',signal:AbortSignal.timeout(timeoutMs),headers:{'x-api-key':apiKey,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({...body,messages})});}
  catch(error){if(error?.name==='TimeoutError'||error?.name==='AbortError')throw Object.assign(new Error('Home Base AI took too long to answer.'),{code:'ai_timeout'});throw error;}
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw providerFailure(response,payload,stage,'Anthropic');
  last=last?{...payload,content:[...last.content,...(payload.content||[])]}:payload;
  if(payload.stop_reason!=='pause_turn')return last;
  messages=[...messages,{role:'assistant',content:payload.content||[]}];
 }
 return last;
}
// Structured output: force one tool call and return its input.
export async function claudeJson({apiKey,model,system,user,name,schema,maxTokens=600,fetchImpl,timeoutMs=15000,stage}){
 const message=await callClaude({apiKey,fetchImpl,timeoutMs,stage,model,max_tokens:maxTokens,system,messages:[{role:'user',content:user}],tools:[{name,description:'Return the result.',input_schema:schema}],tool_choice:{type:'tool',name}});
 const call=(message.content||[]).find(b=>b.type==='tool_use'&&b.name===name);
 if(!call)throw Object.assign(new Error('Home Base AI returned no answer.'),{code:'ai_empty'});
 return call.input||{};
}
