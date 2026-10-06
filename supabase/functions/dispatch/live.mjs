const LIVE_VOICES=new Set(['marin','cedar','quartz','ripple','vesper','willow','stone','gleam','meridian','bossa','tempo','beacon','delta','cinder']);
function liveVoice(voice,style){if(LIVE_VOICES.has(voice))return voice;if(style==='masculine')return'meridian';if(style==='feminine')return'gleam';return'marin'}
function cleanHistory(history){if(!Array.isArray(history))return[];return history.slice(-16).flatMap(item=>{const role=item?.role==='assistant'?'assistant':item?.role==='user'?'user':null,text=String(item?.text||'').trim().slice(0,1800);if(!role||!text)return[];return[{type:'message',role,content:[{type:role==='assistant'?'output_text':'input_text',text}]}]})}
export function makeLiveSessionCreator({apiKey,fetchImpl=fetch,liveModel='gpt-live-1',backendModel='gpt-6-luna'}={}){
 return async({sdp,locale='en-US',voice='marin',style='all',history=[]}={})=>{
  if(!apiKey)return{configured:false,error:'GPT Live is not configured on the Home Base server.'};
  if(typeof sdp!=='string'||sdp.length<40||sdp.length>100000)throw Error('Invalid WebRTC offer.');
  const language=String(locale||'en-US').slice(0,32);
  const session={
   model:liveModel,store:false,
   instructions:`You are Home Base, a fast, capable virtual assistant inside a driver app. Speak naturally and concisely. You are full duplex: allow interruptions and immediately follow the user's latest correction. Answer ordinary questions directly. Delegate questions needing reasoning, detailed knowledge, or current information to the Responses backend. Language policy: begin in the user's selected locale (${language}), but if the user gives a substantive request in another language, answer in that language. Do not switch language because of accent, names, filler words, or isolated foreign words. Never pretend an external action happened unless a tool or the app confirms it.`,
   input:cleanHistory(history),audio:{output:{voice:liveVoice(voice,style)}},
   delegation:{type:'responses',responses:{model:backendModel,instructions:'You are the reasoning and research backend for Home Base voice assistant. Answer questions across general knowledge and practical topics. Use web search whenever information may be current, local, changing, or the user asks to look something up. Prefer accurate, concise facts that GPT-Live can speak naturally. Never claim a real-world or app action succeeded without verified tool output. For high-stakes medical, legal, financial, or safety topics, be appropriately cautious and distinguish general information from professional advice.',reasoning:{effort:'low'},tools:[{type:'web_search'}],tool_choice:'auto',parallel_tool_calls:true,max_output_tokens:1200}}
  };
  const response=await fetchImpl('https://api.openai.com/v1/live/sessions',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({session,transport:{type:'webrtc',sdp}})});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data?.error?.message||`GPT Live session failed (${response.status}).`);
  return{configured:true,session:data.session,transport:data.transport};
 };
}
