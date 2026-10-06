(function(){'use strict';
let pc=null,dc=null,stream=null,audio=null,active=false,starting=false,guestActive=false,oldStop=null,oldToggle=null;
let transcript={user:'',assistant:''},flushTimers={user:null,assistant:null};
const status=(text,sticky=false)=>window.HomeBaseShell?.setVoiceStatus?.(text,sticky);
const buttonState=(on,label)=>{const b=document.getElementById('copilotListen');if(b){b.textContent=on?'Live':'Talk';b.setAttribute('aria-pressed',on?'true':'false');b.setAttribute('aria-label',on?'Stop GPT Live conversation':'Start GPT Live conversation')}const s=document.getElementById('copilotStatus');if(s)s.textContent=label||(on?'GPT Live · listening':'Tap Talk for GPT Live')};
function readPrefs(){try{return window.HomeBaseLanguages?.preferences(JSON.parse(localStorage.getItem('homeBaseVoicePrefs')||'{}'),navigator.languages||[navigator.language])||{locale:navigator.language||'en-US',voiceStyle:'all',aiVoice:'marin'}}catch{return{locale:navigator.language||'en-US',voiceStyle:'all',aiVoice:'marin'}}}
function history(){try{const chats=JSON.parse(localStorage.getItem('homeBaseCopilotChats')||'[]'),id=JSON.parse(localStorage.getItem('homeBaseCopilotActiveChat')||'null'),chat=chats.find(x=>x.id===id)||chats[chats.length-1];return(chat?.messages||[]).slice(-16).map(m=>({role:m.role==='assistant'?'assistant':'user',text:String(m.text||'').slice(0,1800)})).filter(m=>m.text)}catch{return[]}}
function flush(role){clearTimeout(flushTimers[role]);flushTimers[role]=null;const text=transcript[role].trim();transcript[role]='';if(text)window.HomeBaseShell?.logChat?.(role,text)}
function transcriptDelta(role,delta){if(!delta)return;transcript[role]+=delta;status((role==='user'?'You · ':'Home Base · ')+transcript[role].trim(),true);clearTimeout(flushTimers[role]);flushTimers[role]=setTimeout(()=>flush(role),850)}
function handleEvent(event){if(event.type==='session.started'){active=true;starting=false;buttonState(true,'GPT Live · listening');status('GPT Live · ready. Ask me anything.',true);return}if(event.type==='session.input_transcript.delta'){transcriptDelta('user',event.delta);return}if(event.type==='session.output_transcript.delta'){transcriptDelta('assistant',event.delta);return}if(event.type==='session.delegation.created'){status('Home Base · checking that for you…',true);return}if(event.type==='error')status('GPT Live · '+(event.error?.message||'voice session error'),true)}
function waitIce(peer){if(peer.iceGatheringState==='complete')return Promise.resolve();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(Error('Voice connection timed out.'))},8000);function check(){if(peer.iceGatheringState==='complete'){cleanup();resolve()}}function cleanup(){clearTimeout(timer);peer.removeEventListener('icegatheringstatechange',check)}peer.addEventListener('icegatheringstatechange',check)})}
async function stop(message='Voice stopped. Tap the microphone to talk again.'){if(guestActive){guestActive=false;oldStop?.(message);return}starting=false;active=false;flush('user');flush('assistant');try{if(dc?.readyState==='open')dc.send(JSON.stringify({type:'session.close',event_id:'homebase-close-'+Date.now()}))}catch{}try{dc?.close()}catch{}try{pc?.close()}catch{}try{stream?.getTracks().forEach(t=>t.stop())}catch{}try{if(audio){audio.pause();audio.srcObject=null;audio.remove()}}catch{}dc=null;pc=null;stream=null;audio=null;buttonState(false,message);status(message)}
async function start(){
 if(active||starting||guestActive)return stop();
 // Voice is a core Homebase feature: never require account creation just to talk.
 // Signed-in drivers get GPT Live; guests use the on-device Homebase voice loop.
 let user=null;
 if(window.HomeBaseAccounts?.backend){try{user=await HomeBaseAccounts.backend.getUser()}catch{}}
 if(!user?.id||user.is_anonymous){
  guestActive=true;
  status('Guest voice · no account needed. Listening on this device…',true);
  buttonState(true,'Guest voice · listening');
  try{const result=oldToggle?.();if(result&&typeof result.then==='function')await result;return result}catch(error){guestActive=false;status('Voice could not start. Allow microphone access and tap again.',true);buttonState(false,'Tap the microphone to talk');return}
 }
 if(!window.RTCPeerConnection||!navigator.mediaDevices?.getUserMedia){status('Live voice needs WebRTC and microphone access in this browser.',true);return}
 starting=true;buttonState(true,'GPT Live · connecting…');status('Connecting GPT Live…',true);
 try{
  oldStop?.('Switching to GPT Live…');
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  pc=new RTCPeerConnection();stream.getTracks().forEach(track=>pc.addTrack(track,stream));
  audio=document.createElement('audio');audio.autoplay=true;audio.playsInline=true;audio.setAttribute('aria-hidden','true');document.body.append(audio);pc.ontrack=e=>{audio.srcObject=e.streams[0];audio.play().catch(()=>{})};
  dc=pc.createDataChannel('oai-events');dc.addEventListener('message',e=>{try{handleEvent(JSON.parse(e.data))}catch{}});dc.addEventListener('close',()=>{if(active||starting)stop('GPT Live connection closed. Tap the microphone to reconnect.')});
  const offer=await pc.createOffer();await pc.setLocalDescription(offer);await waitIce(pc);
  const prefs=readPrefs(),answer=await HomeBaseAccounts.backend.evaluateDispatch({operation:'live-session',sdp:pc.localDescription.sdp,locale:prefs.locale,voice:prefs.aiVoice,style:prefs.voiceStyle,history:history()});
  if(!answer?.transport?.sdp)throw Error(answer?.error||'GPT Live session could not start.');
  await pc.setRemoteDescription({type:'answer',sdp:answer.transport.sdp});active=true;starting=false;buttonState(true,'GPT Live · listening');status('GPT Live · connected. Speak naturally in any language.',true);
 }catch(error){
  await stop('GPT Live could not connect. Switching back to device voice…');
  guestActive=true;
  status('Guest voice · no account needed. Listening on this device…',true);
  try{const result=oldToggle?.();if(result&&typeof result.then==='function')await result;return result}catch{guestActive=false;status('Voice could not start. Allow microphone access and tap again.',true)}
 }
}
function install(){if(!window.HomeBaseCopilot||window.HomeBaseCopilot.__gptLiveInstalled)return false;oldToggle=window.HomeBaseCopilot.toggleConversation?.bind(window.HomeBaseCopilot);oldStop=window.HomeBaseCopilot.stopConversation?.bind(window.HomeBaseCopilot);window.HomeBaseCopilot.toggleConversation=start;window.HomeBaseCopilot.stopConversation=()=>stop();window.HomeBaseCopilot.__gptLiveInstalled=true;window.HomeBaseLiveAssistant=Object.freeze({start,stop,get active(){return active||guestActive},get starting(){return starting}});const notice=document.getElementById('hbVoiceAvailability');if(notice)notice.textContent='Voice works without an account. Guest mode uses on-device speech; signed-in drivers can also use GPT Live when available.';return true}
if(!install()){let tries=0;const timer=setInterval(()=>{if(install()||++tries>80)clearInterval(timer)},100)}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(active||starting))stop('GPT Live paused while Home Base is in the background.')});
})();
