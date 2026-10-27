// Home Base plans and payments (Stripe Checkout on the web, no app-store cut).
// The phone only asks the server for a checkout or portal link; the plan
// changes after Stripe confirms payment to the server.
(function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 // Every plan has finite Home Base AI (Claude) message limits: we pay per message.
 // Limits come from the server (ai_plan_limits); these are the shipped defaults.
 const PLANS=[
  {id:'free',name:'Free',price:'$0',features:['Home Base AI (Claude) answers by text or voice: 10 messages a day, 150 a month','Answers spoken in your phone\'s voice','2 screenshot readings a day by AI, unlimited on the phone','Offline answers, heat map, 12-hour route, events, safety alerts']},
  {id:'plus',name:'Plus',price:'$19.99/mo',features:['Everything in Free','50 Home Base AI messages a day, 800 a month','10 screenshot readings a day, more web lookups','Answers spoken in your phone\'s voice']},
  {id:'pro',name:'Pro',price:'$39.99/mo',features:['Everything in Plus','120 messages a day, 1,200 a month; 30 screenshots a day','GPT voices and 260 GPT Live dispatcher minutes a month','For drivers who talk to dispatch all shift']}
 ];

 let status=null,busy=false,message='';
 const backend=()=>window.HomeBaseAccounts?.backend;
 async function signedIn(){try{const u=await backend()?.getUser?.();return !!(u?.id&&!u.is_anonymous)}catch{return false}}
 async function loadStatus(){if(!backend()?.billing||!await signedIn())return status=null;try{status=await backend().billing({operation:'status'});}catch{status={open:false,error:true};}return status;}
 async function go(operation,plan){
  if(busy)return;busy=true;message='Opening secure checkout…';render();
  try{const r=await backend().billing({operation,plan});if(r?.url){location.href=r.url;return;}message='Could not open checkout. Try again.';}
  catch(e){message=e?.message||'Payments are temporarily unavailable.';}
  busy=false;render();
 }
 function render(){
  const root=document.getElementById('workspaceContent');if(!root)return;let box=root.querySelector('#hbPlans');
  if(!box){if(!root.querySelector('#profileSave')&&!root.querySelector('.profile-banner'))return;box=document.createElement('section');box.id='hbPlans';box.className='workspace-section hb-plans';root.append(box);}
  const st=window.HomeBaseInternalAI?.planStatus?.()||{},current=['plus','pro'].includes(st.plan)?st.plan:'free',open=!!status?.open,signed=status!==null;
  const min=Math.floor((Number(st.remaining_seconds)||0)/60);
  box.innerHTML='<h3>HOME BASE PLANS</h3>'+
   (current!=='free'?'<p class="earnings-data-note"><b>Your plan: '+(current==='pro'?'Pro':'Plus')+'</b> · '+(Number.isFinite(st.messages_left_today)?st.messages_left_today+' Home Base AI messages left today':'')+(current==='pro'&&st.gpt_voice===true?' · '+min+' GPT Live minutes left this month':'')+(status?.subscription?.renews?' · renews '+esc(new Date(status.subscription.renews).toLocaleDateString()):'')+'</p>':'<p class="earnings-data-note">You are on <b>Free</b>'+(Number.isFinite(st.messages_left_today)?' · '+st.messages_left_today+' Home Base AI messages left today':'')+'. Offline answers are always free.</p>')+
   '<div class="hb-plan-grid">'+PLANS.map(p=>'<article class="hb-plan'+(p.id===current?' current':'')+'"><div class="hb-plan-head"><b>'+p.name+'</b><span>'+p.price+'</span></div><ul>'+p.features.map(f=>'<li>'+esc(f)+'</li>').join('')+'</ul>'+
    (p.id==='free'?'':p.id===current?'<em>Current plan</em>':current!=='free'?'<button type="button" data-portal>Switch in Manage subscription</button>':'<button type="button" class="primary-action" data-buy="'+p.id+'"'+(open?'':' disabled')+'>'+(open?'Get '+p.name:'Opens soon')+'</button>')+'</article>').join('')+'</div>'+
   (current!=='free'?'<div class="hb-plan-actions">'+(current==='pro'&&st.gpt_voice===true?'<button type="button" data-buy="minutes"'+(open?'':' disabled')+'>Add 100 GPT Live minutes · $14.99</button>':'')+'<button type="button" data-portal>Manage subscription</button></div>':'')+
   (status?.test?'<p class="earnings-data-note"><b>Test mode:</b> Stripe test checkout for approved testers. Use card 4242 4242 4242 4242. No real charge.</p>':'')+
   (!signed?'<p class="earnings-data-note">Sign in above to subscribe. Payments are handled by Stripe; Home Base never sees your card.</p>':!open?'<p class="earnings-data-note">Plus and Pro open soon. Everything on Free works today.</p>':'<p class="earnings-data-note">Secure payment by Stripe (card, Apple Pay, Google Pay). Cancel anytime in Manage subscription.</p>')+
   '<p class="earnings-data-note"><a href="legal.html#refunds" target="_blank" rel="noopener">Terms, refunds and privacy</a></p>'+
   (message?'<p class="earnings-data-note" role="status">'+esc(message)+'</p>':'');
  box.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>go('checkout',b.dataset.buy));
  box.querySelectorAll('[data-portal]').forEach(b=>b.onclick=()=>go('portal'));
 }
 async function refresh(){await loadStatus();await window.HomeBaseInternalAI?.refreshEntitlement?.();render();}
 // Returning from Stripe: confirm, then poll briefly while the webhook lands.
 function handleReturn(){
  const q=new URLSearchParams(location.search),r=q.get('billing');if(!r)return;
  q.delete('billing');history.replaceState(null,'',location.pathname+(q.toString()?'?'+q:'')+location.hash);
  message=r==='success'?'Payment received. Your plan updates in a few seconds.':r==='cancel'?'Checkout cancelled. Nothing was charged.':'';
  let n=0;const tick=async()=>{await refresh();if(r==='success'&&++n<6&&!['plus','pro'].includes(window.HomeBaseInternalAI?.serverPlan?.()))setTimeout(tick,3000);else if(r==='success'&&['plus','pro'].includes(window.HomeBaseInternalAI?.serverPlan?.()))message='Welcome to Home Base '+(window.HomeBaseInternalAI.serverPlan()==='pro'?'Pro':'Plus')+'.',render();};
  setTimeout(tick,1500);setTimeout(()=>document.getElementById('navProfile')?.click(),300);
 }
 function hook(){if(typeof renderProfile!=='function')return false;const base=renderProfile;renderProfile=function(...a){base(...a);try{render();refresh();}catch{}};return true;}
 function open(){document.getElementById('hbChatClose')?.click();document.getElementById('navProfile')?.click();setTimeout(()=>document.getElementById('hbPlans')?.scrollIntoView({behavior:'smooth',block:'start'}),400);}
 window.HomeBasePlans={open,refresh,render,PLANS};
 if(!hook())window.addEventListener('DOMContentLoaded',()=>{hook();handleReturn();},{once:true});else handleReturn();
 document.addEventListener('homebase:plan-changed',()=>render());
})();
