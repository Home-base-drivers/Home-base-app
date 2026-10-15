(function(){'use strict';
let pc=null,dc=null,stream=null,audio=null,active=false,starting=false,guestActive=false,oldStop=null,oldToggle=null;
let generation=0,sessionStarted=false,startupReady=null,startupError=null;
const handledCalls=new Set();
let transcript={user:'',assistant:''},flushTimers={user:null,assistant:null};
const status=(text,sticky=false)=>window.HomeBaseShell?.setVoiceStatus?.(text,sticky);
const buttonState=(on,label)=>{const b=document.getElementById('copilotListen');if(b){b.textContent=on?'Live':'Talk';b.setAttribute('aria-pressed',on?'true':'false');b.setAttribute('aria-label',on?'Stop GPT Live conversation':'Start GPT Live conversation')}const s=document.getElementById('copilotStatus');if(s)s.textContent=label||(on?'GPT Live · listening':'Tap Talk for GPT Live')};
function readPrefs(){try{return window.HomeBaseLanguages?.preferences(JSON.parse(localStorage.getItem('homeBaseVoicePrefs')||'{}'),navigator.languages||[navigator.language])||{locale:navigator.language||'en-US',voiceStyle:'all',aiVoice:'marin'}}catch{return{locale:navigator.language||'en-US',voiceStyle:'all',aiVoice:'marin'}}}
function history(){try{const chats=JSON.parse(localStorage.getItem('homeBaseCopilotChats')||'[]'),id=JSON.parse(localStorage.getItem('homeBaseCopilotActiveChat')||'null'),chat=chats.find(x=>x.id===id)||chats[chats.length-1];return(chat?.messages||[]).slice(-16).map(m=>({role:m.role==='assistant'?'assistant':'user',text:String(m.text||'').slice(0,1800)})).filter(m=>m.text)}catch{return[]}}
function flush(role){clearTimeout(flushTimers[role]);flushTimers[role]=null;const text=transcript[role].trim();transcript[role]='';if(text)window.HomeBaseShell?.logChat?.(role,text)}
function transcriptDelta(role,delta){if(!delta)return;transcript[role]+=delta;status((role==='user'?'You · ':'Home Base · ')+transcript[role].trim(),true);clearTimeout(flushTimers[role]);flushTimers[role]=setTimeout(()=>flush(role),850)}
function sendToolResult(callId,output){if(!dc||dc.readyState!=='open')return;dc.send(JSON.stringify({type:'response.item.create',event_id:'homebase-tool-'+Date.now(),item:{type:'function_call_output',call_id:callId,output:JSON.stringify(output)}}));dc.send(JSON.stringify({type:'response.create',event_id:'homebase-continue-'+Date.now()}))}
async function runHomeBaseAction(item){
 if(!item.call_id||handledCalls.has(item.call_id))return;handledCalls.add(item.call_id);
 const channel=dc;let args={};try{args=JSON.parse(item.arguments||'{}')}catch{return sendToolResult(item.call_id,{ok:false,confirmed:false,error:'Invalid action arguments'})}
 const names={refresh_location:'refresh',toggle_heatmap:'heatmap',toggle_bonus_signals:'bonuses',toggle_12h_timeline:'twelve_hour',start_navigation:'navigate'},name=names[args.action];
 const result=name&&window.HomeBaseAgentClient?.execute?await window.HomeBaseAgentClient.execute({name}):{ok:false,confirmed:false,error:'Unsupported Home Base action'};
 if(dc===channel)sendToolResult(item.call_id,result);
}
function handleEvent(event){
 if(event.type==='response.event'){const nested=event.event||{};if(nested.type==='response.output_item.done'&&nested.item?.type==='function_call'&&nested.item?.name==='homebase_action'){void runHomeBaseAction(nested.item);return}if(nested.type==='response.failed'){status('GPT Live research failed. '+(nested.response?.error?.message||'Please retry your question.'),true);return}}
 if(event.type==='session.started'){sessionStarted=true;startupReady?.check();return}
 if(event.type==='session.input_transcript.delta'){transcriptDelta('user',event.delta);return}
 if(event.type==='session.output_transcript.delta'){transcriptDelta('assistant',event.delta);return}
 if(event.type==='session.delegation.created'){status('Home Base · checking that for you…',true);return}
 if(event.type==='error'){const message='GPT Live · '+(event.error?.message||'voice session error');if(starting){startupError=Error(message);startupReady?.fail(startupError)}if(event.error?.code==='responses_validation_failed'){void stop(message+'. Tap to retry after the server configuration is corrected.');return}status(message,true)}
}
function cancelled(){return Object.assign(Error('Voice start cancelled.'),{code:'live_cancelled'})}
function waitReady(peer,channel,attempt){return new Promise((resolve,reject)=>{
 const finish=error=>{clearTimeout(timer);peer.removeEventListener('connectionstatechange',check);channel.removeEventListener('open',check);if(startupReady===pending)startupReady=null;error?reject(error):resolve()};
 const check=()=>{if(attempt!==generation)return finish(cancelled());if(startupError)return finish(startupError);if(peer.connectionState==='failed'||peer.connectionState==='closed')return finish(Error('WebRTC connection failed.'));if(sessionStarted&&channel.readyState==='open'&&peer.connectionState==='connected')finish()};
 const pending={check,cancel:()=>finish(cancelled()),fail:finish},timer=setTimeout(()=>finish(Error('GPT Live readiness timed out. Please retry.')),20000);startupReady=pending;
 peer.addEventListener('connectionstatechange',check);channel.addEventListener('open',check);check();
})}
function waitIce(peer){if(peer.iceGatheringState==='complete')return Promise.resolve();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(Error('Voice connection timed out.'))},8000);function check(){if(peer.iceGatheringState==='complete'){cleanup();resolve()}}function cleanup(){clearTimeout(timer);peer.removeEventListener('icegatheringstatechange',check)}peer.addEventListener('icegatheringstatechange',check)})}
async function stop(message='Voice stopped. Tap the microphone to talk again.'){++generation;startupReady?.cancel();starting=false;active=false;sessionStarted=false;handledCalls.clear();if(guestActive){guestActive=false;oldStop?.(message)}flush('user');flush('assistant');try{if(dc?.readyState==='open')dc.send(JSON.stringify({type:'session.close',event_id:'homebase-close-'+Date.now()}))}catch{}try{dc?.close()}catch{}try{pc?.close()}catch{}try{stream?.getTracks().forEach(t=>t.stop())}catch{}try{if(audio){audio.pause();audio.srcObject=null;audio.remove()}}catch{}dc=null;pc=null;stream=null;audio=null;buttonState(false,message);status(message)}
async function start(){
 if(active||starting)return stop();
 if(guestActive)return oldToggle?.();
 // Voice is a core Homebase feature: never require account creation just to talk.
 // Signed-in drivers get GPT Live; guests use the on-device Homebase voice loop.
 const attempt=++generation;starting=true;sessionStarted=false;startupError=null;
 const current=()=>{if(attempt!==generation)throw cancelled()};
 let user=null;
 if(!window.HomeBaseAccounts?.backend){starting=false;status('Home Base account service is still loading. Tap to retry.',true);return}
 try{user=await HomeBaseAccounts.backend.getUser()}catch(error){if(attempt!==generation)return;if(error?.name!=='AuthSessionMissingError'&&!/auth session missing|sign in.*first|invalid session/i.test(error?.message||'')){starting=false;status(window.HomeBaseAgentClient?.describeError?.(error)||'Cannot check your account. Check your connection and retry.',true);return}}
 if(attempt!==generation)return;
 if(!user?.id||user.is_anonymous){
  starting=false;guestActive=true;
  status('Guest voice · no account needed. Listening on this device…',true);
  buttonState(true,'Guest voice · listening');
  try{const result=oldToggle?.();if(result&&typeof result.then==='function')await result;return result}catch(error){guestActive=false;status('Voice could not start. Allow microphone access and tap again.',true);buttonState(false,'Tap the microphone to talk');return}
 }
 if(!window.RTCPeerConnection||!navigator.mediaDevices?.getUserMedia){starting=false;status('Live voice needs WebRTC and microphone access in this browser.',true);return}
 starting=true;buttonState(true,'GPT Live · connecting…');status('Connecting GPT Live…',true);
 try{
  oldStop?.('Switching to GPT Live…');
  const media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  if(attempt!==generation){media.getTracks().forEach(t=>t.stop());return}stream=media;
  pc=new RTCPeerConnection();stream.getTracks().forEach(track=>pc.addTrack(track,stream));
  audio=document.createElement('audio');audio.autoplay=true;audio.playsInline=true;audio.setAttribute('aria-hidden','true');document.body.append(audio);const output=audio;pc.ontrack=e=>{if(attempt!==generation)return;output.srcObject=e.streams[0];output.play().catch(()=>{if(attempt===generation)status('GPT Live audio playback was blocked. Tap the microphone to stop, then reconnect.',true)})};
  const peer=pc;dc=peer.createDataChannel('oai-events');const channel=dc;channel.addEventListener('message',e=>{if(attempt!==generation)return;try{handleEvent(JSON.parse(e.data))}catch{}});channel.addEventListener('close',()=>{if(attempt===generation&&(active||starting))stop('GPT Live connection closed. Tap the microphone to reconnect.')});
  peer.addEventListener('connectionstatechange',()=>{if(attempt===generation&&active&&['failed','closed'].includes(peer.connectionState))stop('GPT Live connection interrupted. Tap to reconnect.')});
  const offer=await peer.createOffer();current();await peer.setLocalDescription(offer);current();await waitIce(peer);current();
  const prefs=readPrefs(),liveContext=window.HomeBaseCopilot?.liveContext?.()||{},answer=await HomeBaseAccounts.backend.evaluateDispatch({operation:'live-session',sdp:pc.localDescription.sdp,locale:prefs.locale,voice:prefs.aiVoice,style:prefs.voiceStyle,history:history(),context:liveContext});
  current();if(!answer?.transport?.sdp)throw Error(answer?.error||'GPT Live session could not start.');
  await peer.setRemoteDescription({type:'answer',sdp:answer.transport.sdp});current();await waitReady(peer,channel,attempt);current();active=true;starting=false;buttonState(true,'GPT Live · listening');status('GPT Live · connected. Speak naturally in any language.',true);
 }catch(error){
  if(attempt!==generation||error?.code==='live_cancelled')return;
  const reason=window.HomeBaseAgentClient?.describeError?.(error)||String(error?.message||'GPT Live could not connect.');
  await stop('GPT Live unavailable · '+reason+' Tap to retry, or use Ask Homebase chat.');
 }
}
function install(){if(!window.HomeBaseCopilot||window.HomeBaseCopilot.__gptLiveInstalled)return false;oldToggle=window.HomeBaseCopilot.toggleConversation?.bind(window.HomeBaseCopilot);oldStop=window.HomeBaseCopilot.stopConversation?.bind(window.HomeBaseCopilot);window.HomeBaseCopilot.toggleConversation=start;window.HomeBaseCopilot.stopConversation=()=>stop();window.HomeBaseCopilot.__gptLiveInstalled=true;window.HomeBaseLiveAssistant=Object.freeze({start,stop,get active(){return active||guestActive},get starting(){return starting}});const notice=document.getElementById('hbVoiceAvailability');if(notice)notice.textContent='Voice works without an account. Guest mode uses on-device speech; signed-in drivers can also use GPT Live when available.';return true}
if(!install()){let tries=0;const timer=setInterval(()=>{if(install()||++tries>80)clearInterval(timer)},100)}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(active||starting))stop('GPT Live paused while Home Base is in the background.')});
})();
