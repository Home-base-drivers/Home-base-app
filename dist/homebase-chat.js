// Home Base AI chat: a ChatGPT-style typed conversation inside the Copilot panel.
// Typed messages always go to Home Base AI (the driver chose to type to it); errors are
// shown plainly instead of being replaced with a canned on-phone answer.
(function(){
 'use strict';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

 // Small, safe Markdown renderer: escape first, then add a fixed set of tags.
 function inline(text){
  let out=esc(text);
  const codes=[];out=out.replace(/`([^`\n]+)`/g,(_,c)=>{codes.push(c);return'\u0000'+(codes.length-1)+'\u0000'});
  out=out.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,(_,label,url)=>'<a href="'+url+'" target="_blank" rel="noopener noreferrer">'+label+'</a>');
  out=out.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?])/g,(_,lead,url)=>lead+'<a href="'+url+'" target="_blank" rel="noopener noreferrer">'+url+'</a>');
  out=out.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g,'$1<em>$2</em>');
  return out.replace(/\u0000(\d+)\u0000/g,(_,i)=>'<code>'+codes[Number(i)]+'</code>');
 }
 function format(markdown){
  const lines=String(markdown??'').replace(/\r\n?/g,'\n').split('\n'),html=[];let list=null,para=[],i=0;
  const flushPara=()=>{if(para.length){html.push('<p>'+para.map(inline).join('<br>')+'</p>');para=[]}};
  const closeList=()=>{if(list){html.push('</'+list+'>');list=null}};
  while(i<lines.length){
   const line=lines[i];
   if(/^```/.test(line)){flushPara();closeList();const code=[];i++;while(i<lines.length&&!/^```/.test(lines[i]))code.push(lines[i++]);i++;html.push('<pre><code>'+esc(code.join('\n'))+'</code></pre>');continue}
   if(/^\s*\|.*\|\s*$/.test(line)&&/^\s*\|?\s*:?-{2,}/.test(lines[i+1]||'')){
    flushPara();closeList();const cells=row=>row.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
    const head=cells(line);i+=2;const body=[];while(i<lines.length&&/^\s*\|.*\|\s*$/.test(lines[i]))body.push(cells(lines[i++]));
    html.push('<div class="hb-md-table"><table><thead><tr>'+head.map(c=>'<th>'+inline(c)+'</th>').join('')+'</tr></thead><tbody>'+body.map(r=>'<tr>'+r.map(c=>'<td>'+inline(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>');continue;
   }
   const heading=line.match(/^(#{1,4})\s+(.*)$/);
   if(heading){flushPara();closeList();html.push('<h4>'+inline(heading[2])+'</h4>');i++;continue}
   const bullet=line.match(/^\s*[-*•]\s+(.*)$/),number=line.match(/^\s*\d+[.)]\s+(.*)$/);
   if(bullet||number){flushPara();const type=bullet?'ul':'ol';if(list!==type){closeList();html.push('<'+type+'>');list=type}html.push('<li>'+inline((bullet||number)[1])+'</li>');i++;continue}
   if(!line.trim()){flushPara();closeList();i++;continue}
   closeList();para.push(line);i++;
  }
  flushPara();closeList();return html.join('');
 }

 // Downscale a photo so screenshots stay readable but requests stay small.
 function shrinkImage(file,max=1600){
  return new Promise((resolve,reject)=>{
   if(!file||!/^image\//.test(file.type))return reject(Error('Choose a photo or screenshot.'));
   const url=URL.createObjectURL(file),img=new Image();
   img.onload=()=>{try{const scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);resolve(canvas.toDataURL('image/jpeg',.85))}catch(error){URL.revokeObjectURL(url);reject(error)}};
   img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('That photo could not be opened.'))};img.src=url;
  });
 }

 const SUGGESTIONS=['Brief me for today','$14 for 9 miles, 20 minutes — worth it?','How was my week?','Should I keep driving?'];
 let pending=false,attachment=null,lastFailed=null;

 function install(){
  const panel=document.getElementById('hbChatPanel');if(!panel||panel.querySelector('#hbChatComposer'))return!!panel;
  panel.classList.add('hb-chat-ai');
  const title=panel.querySelector('.hb-chat-head b');if(title)title.textContent='Home Base AI';
  const close=panel.querySelector('#hbChatClose');if(close)close.setAttribute('aria-label','Close Home Base AI chat');
  const form=document.createElement('form');form.id='hbChatComposer';form.className='hb-chat-composer';form.setAttribute('autocomplete','off');
  form.innerHTML='<div class="hb-chat-engine" role="group" aria-label="Which Home Base AI answers"><button type="button" data-engine="plus">Home Base AI</button><button type="button" data-engine="builtin">Offline</button></div><div class="hb-plan-line" id="hbPlanLine" hidden><span id="hbPlanText"></span><select id="hbVoiceMode" aria-label="How voice works"><option value="hybrid">Voice: phone + GPT (saves minutes)</option><option value="live">Voice: GPT Live</option></select></div><div class="hb-chat-notice" id="hbChatNotice" role="status" aria-live="polite" hidden></div><div class="hb-chat-attachment" id="hbChatAttachment" hidden><img alt="Attached photo"><button type="button" aria-label="Remove photo">×</button></div><div class="hb-chat-row"><label class="hb-chat-attach" aria-label="Attach a photo or screenshot"><input type="file" accept="image/*" id="hbChatFile" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.5 12.6 21a5.5 5.5 0 0 1-7.8-7.8l9-9a3.7 3.7 0 0 1 5.2 5.2l-9 9a1.8 1.8 0 0 1-2.6-2.6l8.3-8.3"/></svg></label><textarea id="hbChatInput" rows="1" placeholder="Message Home Base AI" aria-label="Message Home Base AI" enterkeyhint="send"></textarea><button type="submit" id="hbChatSend" aria-label="Send"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button></div>';
  panel.append(form);
  const input=form.querySelector('#hbChatInput'),send=form.querySelector('#hbChatSend'),file=form.querySelector('#hbChatFile'),chip=form.querySelector('#hbChatAttachment'),notice=form.querySelector('#hbChatNotice');
  const grow=()=>{input.style.height='auto';input.style.height=Math.min(input.scrollHeight,160)+'px';send.disabled=pending||(!input.value.trim()&&!attachment)};
  input.addEventListener('input',grow);
  input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&matchMedia('(hover:hover)').matches){event.preventDefault();form.requestSubmit()}});
  file.addEventListener('change',async()=>{const picked=file.files?.[0];file.value='';if(!picked)return;try{attachment=await shrinkImage(picked);chip.querySelector('img').src=attachment;chip.hidden=false;showNotice('')}catch(error){showNotice(error.message||'That photo could not be attached.')}grow()});
  chip.querySelector('button').addEventListener('click',()=>{attachment=null;chip.hidden=true;grow()});
  form.addEventListener('submit',event=>{event.preventDefault();submit(input.value)});
  const engines=form.querySelectorAll('[data-engine]'),internal=()=>window.HomeBaseInternalAI;
  const showEngine=()=>{const plan=internal()?.plan?.()||'builtin';engines.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.engine===plan)));input.placeholder=plan==='plus'?'Message Home Base AI':'Message Home Base AI (offline answers)';};
  const planLine=form.querySelector('#hbPlanLine'),planText=form.querySelector('#hbPlanText'),voiceSel=form.querySelector('#hbVoiceMode');
  const readVoice=()=>{try{return JSON.parse(localStorage.getItem('homeBaseVoicePrefs')||'{}')}catch{return{}}};
  voiceSel.value=readVoice().voiceMode==='live'?'live':'hybrid';
  voiceSel.addEventListener('change',()=>{const v=readVoice();v.voiceMode=voiceSel.value;localStorage.setItem('homeBaseVoicePrefs',JSON.stringify(v));showNotice(voiceSel.value==='live'?'Talk opens GPT Live right away. It pauses after 20 seconds of quiet to save minutes.':'Talk runs on your phone for free; GPT answers by text and reads it aloud. Say "let\'s talk" to open GPT Live.')});
  const showPlan=()=>{const st=internal()?.planStatus?.();const known=st&&['free','plus','pro'].includes(st.plan);planLine.hidden=!known;if(known){const min=Math.floor((Number(st.remaining_seconds)||0)/60),left=Number(st.messages_left_today);planText.textContent=({free:'Free',plus:'Plus',pro:'Pro'})[st.plan]+(Number.isFinite(left)?' · '+left+' AI messages left today':'')+(st.plan==='pro'?' · '+min+' GPT Live min':'');voiceSel.hidden=st.plan!=='pro';}};
  document.addEventListener('homebase:plan-changed',()=>{showEngine();showPlan();});
  engines.forEach(b=>b.addEventListener('click',()=>{
   const want=b.dataset.engine,server=internal()?.serverPlan?.();
   if(want==='plus'&&server==='signed-out'){showNotice('Sign in to talk with Home Base AI. Open Profile to sign in.');return;}
   internal()?.setPlan?.(want,{chosen:true});showEngine();showPlan();
   showNotice(want==='plus'?'Home Base AI talks it through with you, remembers what you tell it and learns how you drive.':'Offline answers come from this phone only: earnings, goal pace, trip offers, weather, screenshots, costs, best hours and where to go.')}));
  showEngine();showPlan();internal()?.refreshEntitlement?.();
  // Built-in AI: free, on the phone. A photo is read into trips for review.
  async function builtinReply(text,photo){
   const ai=internal();if(!ai)throw Error('Built-in AI is still loading. Try again in a moment.');
   if(photo){showNotice('Reading the screenshot on this phone…');const raw=await ai.readImage(photo,p=>showNotice('Reading the screenshot… '+p+'%'));showNotice('');const saved=await ai.review(ai.parseScreenshotText(raw));return saved?ai.summaryOf([saved]):'Nothing saved from that screenshot.';}
   const r=ai.ask(text);return r.handled?r.answer:r.answer+(ai.plan()==='builtin'?'\n\nSwitch to **Home Base AI** above for open conversation.':'');
  }
  function showNotice(text,retry=false){const signIn=/sign in/i.test(text||''),plans=/Home Base Plus|minutes are used/i.test(text||'');notice.hidden=!text;notice.innerHTML=text?esc(text)+(plans?' <button type="button" data-chat-plans>See plans</button>':signIn?' <button type="button" data-chat-signin>Sign in</button>':retry?' <button type="button" data-chat-retry>Retry</button>':''):'';notice.querySelector('[data-chat-plans]')?.addEventListener('click',()=>window.HomeBasePlans?.open?.());notice.querySelector('[data-chat-signin]')?.addEventListener('click',()=>{document.getElementById('hbChatClose')?.click();document.getElementById('navProfile')?.click()});notice.querySelector('[data-chat-retry]')?.addEventListener('click',()=>{if(lastFailed)submit(lastFailed.text,lastFailed.photo,true)})}
  async function submit(raw,photo=attachment,isRetry=false){
   const text=String(raw||'').trim();if(pending||(!text&&!photo))return;
   const agent=window.HomeBaseAgentClient,usePlus=window.HomeBaseInternalAI?.plan?.()==='plus';if(usePlus&&!agent){showNotice('Home Base AI is still loading. Try again in a moment.');return}
   if(usePlus&&!await agent.signedIn()){showNotice('Sign in to talk with Home Base AI, or switch to Offline. Open Profile to sign in.');return}
   pending=true;showNotice('');
   if(!isRetry)window.HomeBaseShell?.logChat?.('user',text||'(photo)',photo?{photo:true}:undefined);
   input.value='';attachment=null;chip.hidden=true;grow();render();
   try{
    let answer='';
    if(!usePlus){answer=await builtinReply(text,photo);}
    else{
     try{window.HomeBaseInternalAI?.noteUsage?.(text);const prefs=(()=>{try{return JSON.parse(localStorage.getItem('homeBaseVoicePrefs')||'{}')}catch{return{}}})();
      const result=await agent.ask(text,{locale:prefs.locale||navigator.language||'en-US'},{channel:'chat',attachments:photo?[{dataUrl:photo}]:[]});
      answer=typeof result?.answer==='string'?result.answer.trim():'';}
     catch(error){
      // Plus is unavailable: answer with the built-in AI when it can, and say why.
      if(['plan_required','daily_messages_used_up','monthly_messages_used_up','daily_images_used_up','free_pool_used_up','email_unconfirmed'].includes(error?.code)){window.HomeBaseInternalAI?.refreshEntitlement?.();answer=await builtinReply(text,photo)+'\n\n_'+agent.describeError(error)+'_';}
      else{if(error?.code==='sign_in')throw error;
      // Home Base AI unreachable: answer from the phone when possible and say why.
      const r=photo?null:window.HomeBaseInternalAI?.ask?.(text);if(!r?.handled)throw error;
      answer=r.answer+'\n\n_Answered offline: '+agent.describeError(error)+'_';}}
    }
    if(!answer)throw Error('Home Base AI returned no answer.');
    lastFailed=null;pending=false;window.HomeBaseShell?.logChat?.('assistant',answer);internal()?.refreshEntitlement?.().then(showPlan).catch(()=>{});
   }catch(error){
    pending=false;lastFailed={text,photo};showNotice(agent?.describeError?agent.describeError(error):String(error?.message||error),true);
   }
   render();grow();
  }
  window.HomeBaseChat.submit=submit;
  window.HomeBaseChat.focus=()=>setTimeout(()=>input.focus(),60);
  grow();return true;
 }
 function render(){window.HomeBaseShell?.renderChat?.()}
 window.HomeBaseChat={format,inline,shrinkImage,suggestions:SUGGESTIONS,get pending(){return pending},install};
 if(!install()){let tries=0;const timer=setInterval(()=>{if(install()||++tries>100)clearInterval(timer)},100)}
})();
