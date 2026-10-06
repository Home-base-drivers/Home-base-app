(function(){'use strict';
let pc=null,dc=null,stream=null,audio=null,active=false,starting=false,oldStop=null;
let transcript={user:'',assistant:''},flushTimers={user:null,assistant:null};
const status=(text,sticky=false)=>window.HomeBaseShell?.setVoiceStatus?.(text,sticky);
const buttonState=(on,label)=>{const b=document.getElementById('copilotListen');if(b){b.textContent=on?'Live':'Talk';b.setAttribute('aria-pressed',on?'true':'false');b.setAttribute('aria-label',on?'Stop GPT Live conversation':'Start GPT Live conversation')}const s=document.getElementById('copilotStatus');if(s)s.textContent=label||(on?'GPT Live · listening':'Tap Talk for GPT Live')};
function readPrefs(){try{return window.HomeBaseLanguages?.preferences(JSON.parse(localStorage.getItem('homeBaseVoicePrefs')||'{}'),navigator.languages||[navigator.language])||{locale:navigator.language||'en-US',voiceStyle:'all',aiVoice:'marin'}}catch{return{locale:navigator.language||'en-US',voiceStyle:'all',aiVoice:'marin'}}}
function history(){try{const chats=JSON.parse(localStorage.getItem('homeBaseCopilotChats')||'[]'),id=JSON.parse(localStorage.getItem('homeBaseCopilotActiveChat')||'null'),chat=chats.find(x=>x.id===id)||chats[chats.length-1];return(chat?.messages||[]).slice(-16).map(m=>({role:m.role==='assistant'?'assistant':'user',text:String(m.text||'').slice(0,1800)})).filter(m=>m.text)}catch{return[]}}
function flush(role){clearTimeout(flushTimers[role]);flushTimers[role]=null;const text=transcript[role].trim();transcript[role]='';if(text)window.HomeBaseShell?.logChat?.(role,text)}
function transcriptDelta(role,delta){if(!delta)return;transcript[role]+=delta;status((role==='user'?'You · ':'Home Base · ')+transcript[role].trim(),true);clearTimeout(flushTimers[role]);flushTimers[role]=setTimeout(()=>flush(role),850)}
function handleEvent(event){if(event.type==='session.started'){active=true;starting=false;buttonState(true,'GPT Live · listening');status('GPT Live · ready. Ask me anything.',true);return}if(event.type==='session.input_transcript.delta'){transcriptDelta('user',event.delta);return}if(event.type==='session.output_transcript.delta'){transcriptDelta('assistant',event.delta);return}if(event.type==='session.delegation.created'){status('Home Base · checking that for you…',true);return}if(event.type==='error')status('GPT Live · '+(event.error?.message||'voice session error'),true)}
function waitIce(peer){if(peer.iceGatheringState==='complete')return Promise.resolve();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(Error('Voice connection timed out.'))},8000);function check(){if(peer.iceGatheringState==='complete'){cleanup();resolve()}}function cleanup(){clearTimeout(timer);peer.removeEventListener('icegatheringstatechange',check)}peer.addEventListener('icegatheringstatechange',check)})}
async function stop(message='GPT Live stopped. Tap the microphone to talk again.'){starting=false;active=false;flush('user');flush('assistant');try{if(dc?.readyState==='open')dc.send(JSON.stringify({type:'session.close',event_id:'homebase-close-'+Date.now()}))}catch{}try{dc?.close()}catch{}try{pc?.close()}catch{}try{stream?.getTracks().forEach(t=>t.stop())}catch{}try{if(audio){audio.pause();audio.srcObject=null;audio.remove()}}catch{}dc=null;pc=null;stream=null;audio=null;buttonState(false,message);status(message)}
async function start(){
 if(active||starting)return stop();
 if(!window.HomeBaseAccounts?.backend){status('Home Base account service is still loading. Try again in a moment.',true);return}
 if(!window.RTCPeerConnection||!navigator.mediaDevices?.getUserMedia){status('GPT Live needs WebRTC and microphone access in this browser.',true);return}
 starting=true;buttonState(true,'GPT Live · connecting…');status('Connecting GPT Live…',true);
 try{
  const user=await HomeBaseAccounts.backend.getUser();
  if(!starting)return;
  if(!user?.id||user.is_anonymous)throw Object.assign(Error('Sign in to your Home Base account first.'),{name:'AuthSessionMissingError'});
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
  const needsSignIn=error?.name==='AuthSessionMissingError'||/auth session missing|sign in.*first|invalid session/i.test(error?.message||'');
  await stop(needsSignIn?'Sign in to Home Base in Profile, then tap the voice orb again.':'GPT Live could not connect. '+(error?.message||'Please try again.'));
  if(needsSignIn){document.getElementById('navProfile')?.click();document.querySelector('#cloudAuth [name="email"]')?.focus();}
 }
}
function install(){if(!window.HomeBaseCopilot||window.HomeBaseCopilot.__gptLiveInstalled)return false;oldStop=window.HomeBaseCopilot.stopConversation?.bind(window.HomeBaseCopilot);window.HomeBaseCopilot.toggleConversation=start;window.HomeBaseCopilot.stopConversation=()=>stop();window.HomeBaseCopilot.__gptLiveInstalled=true;window.HomeBaseLiveAssistant=Object.freeze({start,stop,get active(){return active},get starting(){return starting}});const notice=document.getElementById('hbVoiceAvailability');if(notice)notice.textContent='GPT Live: full-duplex conversation, interruptions, multilingual speech, general questions and current web answers when the backend is connected.';return true}
if(!install()){let tries=0;const timer=setInterval(()=>{if(install()||++tries>80)clearInterval(timer)},100)}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(active||starting))stop('GPT Live paused while Home Base is in the background.')});
})();
