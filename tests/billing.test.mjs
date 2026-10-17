import {test} from 'node:test';
import assert from 'node:assert/strict';
import {billingHandler,verifyStripeSignature,form,localMonth} from '../supabase/functions/billing/handler.mjs';

const USER='30fc8904-041b-4b90-991d-fdccaed05b25';
function fakeDb(){
 const tables={billing_customers:[],billing_events:[],ai_entitlements:[],ai_plan_limits:[{plan:'plus',included_voice_seconds:7200,monthly_price_usd:19.99}]},rpcs=[];
 const q=(name)=>{let rows=()=>tables[name],filters=[];const api={
  select(){return api;},eq(k,v){filters.push([k,v]);return api;},
  maybeSingle:async()=>({data:rows().find(r=>filters.every(([k,v])=>r[k]===v))||null,error:null}),
  then(res){return Promise.resolve({data:rows().filter(r=>filters.every(([k,v])=>r[k]===v)),error:null}).then(res);},
  insert:async row=>{if(tables[name].some(r=>r.id===row.id))return{error:{code:'23505'}};tables[name].push({...row});return{error:null};},
  upsert:async(row,{onConflict})=>{const i=tables[name].findIndex(r=>r[onConflict]===row[onConflict]);if(i>=0)tables[name][i]={...tables[name][i],...row};else tables[name].push({...row});return{error:null};},
  update(row){return{eq:async(k,v)=>{tables[name].filter(r=>r[k]===v).forEach(r=>Object.assign(r,row));return{error:null};}};},
  delete(){return{eq:async(k,v)=>{tables[name]=tables[name].filter(r=>r[k]!==v);return{error:null};}};}
 };return api;};
 const db={tables,rpcs,from:q,auth:{getUser:async t=>t==='good'?{data:{user:{id:USER,email:'driver@example.test'}},error:null}:{data:null,error:{message:'bad'}}},
  rpc:async(name,args)=>{rpcs.push([name,args]);if(name==='set_ai_plan'){const i=tables.ai_entitlements.findIndex(r=>r.user_id===args.p_user);const row={user_id:args.p_user,plan:args.p_plan,current_period_end:args.p_period_end,extra_voice_seconds:args.p_extra_voice_seconds??(tables.ai_entitlements[i]?.extra_voice_seconds||0),extra_month:args.p_extra_month??tables.ai_entitlements[i]?.extra_month??null};if(i>=0)tables.ai_entitlements[i]=row;else tables.ai_entitlements.push(row);}return{data:{},error:null};}};
 return db;
}
function setup({open=true,extra={}}={}){
 const db=fakeDb(),calls=[];
 const env=k=>({SUPABASE_URL:'u',SUPABASE_SERVICE_ROLE_KEY:'s',STRIPE_SECRET_KEY:'sk_test',STRIPE_WEBHOOK_SECRET:'whsec_test',STRIPE_PRICE_PLUS:'price_plus',STRIPE_PRICE_PRO:'price_pro',STRIPE_PRICE_MINUTES:'price_min',BILLING_ENABLED:open?'true':'false',...extra})[k];
 const fetchImpl=async(url,init)=>{calls.push({url,body:init.body&&Object.fromEntries(new URLSearchParams(init.body))});
  if(url.endsWith('/customers'))return new Response(JSON.stringify({id:'cus_1'}));
  if(url.endsWith('/checkout/sessions'))return new Response(JSON.stringify({url:'https://checkout.stripe.com/c/1'}));
  if(url.endsWith('/billing_portal/sessions'))return new Response(JSON.stringify({url:'https://billing.stripe.com/p/1'}));
  if(url.includes('/subscriptions/'))return new Response(JSON.stringify({id:'sub_1',customer:'cus_1',status:'active',items:{data:[{price:{id:'price_plus'},current_period_end:1795000000}]}}));
  return new Response('{}',{status:404});};
 const handler=billingHandler(()=>db,env,fetchImpl);
 const app=body=>handler(new Request('https://x/billing',{method:'POST',headers:{Authorization:'Bearer good',Origin:'https://home-base-drivers.github.io'},body:JSON.stringify(body)}));
 const hook=async(event,{secret='whsec_test',t=Math.floor(Date.now()/1000)}={})=>{const body=JSON.stringify(event);const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(t+'.'+body)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  return handler(new Request('https://x/billing',{method:'POST',headers:{'Stripe-Signature':'t='+t+',v1='+sig},body}));};
 return{db,calls,app,hook};
}

test('checkout creates a Stripe customer once and a subscription session tied to the signed-in driver',async()=>{
 const s=setup();const r=await s.app({operation:'checkout',plan:'plus'});assert.equal(r.status,200);assert.equal((await r.json()).url,'https://checkout.stripe.com/c/1');
 const session=s.calls.find(c=>c.url.endsWith('/checkout/sessions')).body;
 assert.equal(session.mode,'subscription');assert.equal(session['line_items[0][price]'],'price_plus');assert.equal(session.client_reference_id,USER);assert.equal(session['subscription_data[metadata][user_id]'],USER);
 assert.equal(s.db.tables.billing_customers[0].stripe_customer_id,'cus_1');
 await s.app({operation:'checkout',plan:'pro'});assert.equal(s.calls.filter(c=>c.url.endsWith('/customers')).length,1,'customer reused');
});

test('sales stay closed until BILLING_ENABLED, and sign-in is required',async()=>{
 const s=setup({open:false});const r=await s.app({operation:'checkout',plan:'plus'});assert.equal(r.status,503);assert.equal((await r.json()).code,'billing_closed');
 assert.equal((await (await s.app({operation:'status'})).json()).open,false);
 const anon=await billingHandler(()=>fakeDb(),()=>undefined)(new Request('https://x',{method:'POST',body:'{}'}));assert.equal(anon.status,401);
});

test('only a correctly signed Stripe webhook changes a plan, once per event',async()=>{
 const s=setup();
 const bad=await s.hook({id:'evt_x',type:'customer.subscription.updated',data:{object:{}}},{secret:'wrong'});assert.equal(bad.status,400);
 const old=await s.hook({id:'evt_y',type:'x',data:{object:{}}},{t:Math.floor(Date.now()/1000)-3600});assert.equal(old.status,400,'replayed old signature refused');
 await s.app({operation:'checkout',plan:'plus'});
 const ev={id:'evt_1',type:'checkout.session.completed',data:{object:{mode:'subscription',subscription:'sub_1',client_reference_id:USER}}};
 const r=await s.hook(ev);assert.equal((await r.json()).result,'plan plus');
 const ent=s.db.tables.ai_entitlements[0];assert.equal(ent.plan,'plus');assert.equal(ent.current_period_end,new Date((1795000000+3*86400)*1000).toISOString());
 assert.equal((await (await s.hook(ev)).json()).duplicate,true);assert.equal(s.db.rpcs.length,1);
 // Cancellation returns the driver to free.
 await s.hook({id:'evt_2',type:'customer.subscription.deleted',data:{object:{id:'sub_1',customer:'cus_1',status:'canceled',items:{data:[{price:{id:'price_plus'}}]}}}});
 assert.equal(s.db.tables.ai_entitlements[0].plan,'free');assert.equal(s.db.tables.billing_customers[0].plan,'free');
});

test('extra minutes add 100 minutes to this month and keep the plan',async()=>{
 const s=setup();s.db.tables.billing_customers.push({user_id:USER,stripe_customer_id:'cus_1',plan:'plus',subscription_status:'active'});
 s.db.tables.ai_entitlements.push({user_id:USER,plan:'plus',current_period_end:'2026-12-01T00:00:00Z',extra_voice_seconds:6000,extra_month:localMonth()});
 const c=await s.app({operation:'checkout',plan:'minutes'});assert.equal(c.status,200);assert.equal(s.calls.at(-1).body.mode,'payment');
 await s.hook({id:'evt_3',type:'checkout.session.completed',data:{object:{mode:'payment',payment_status:'paid',client_reference_id:USER,metadata:{kind:'minutes',user_id:USER}}}});
 const e=s.db.tables.ai_entitlements[0];assert.equal(e.extra_voice_seconds,12000);assert.equal(e.plan,'plus');assert.equal(e.current_period_end,'2026-12-01T00:00:00Z');
 assert.equal((await s.app({operation:'checkout',plan:'plus'})).status,409,'no double subscription');
});

test('form encoding and signature helpers',async()=>{
 assert.equal(form({a:{0:{b:1}},c:'x',d:null}).toString(),'a%5B0%5D%5Bb%5D=1&c=x');
 assert.equal(await verifyStripeSignature('{}','t=1,v1=00','s',1),false);
});

test('test-mode checkout opens only for listed testers, never with a live key',async()=>{
 const tester=setup({open:false,extra:{STRIPE_SECRET_KEY:'sk_test_abc',BILLING_TEST_EMAILS:' Other@x.test , DRIVER@example.test'}});
 const st=await (await tester.app({operation:'status'})).json();assert.equal(st.open,true);assert.equal(st.test,true);
 assert.equal((await tester.app({operation:'checkout',plan:'plus'})).status,200);
 const stranger=setup({open:false,extra:{STRIPE_SECRET_KEY:'sk_test_abc',BILLING_TEST_EMAILS:'other@x.test'}});
 assert.equal((await stranger.app({operation:'checkout',plan:'plus'})).status,503);
 const live=setup({open:false,extra:{STRIPE_SECRET_KEY:'sk_live_abc',BILLING_TEST_EMAILS:'driver@example.test'}});
 assert.equal((await live.app({operation:'checkout',plan:'plus'})).status,503,'live key never opens through the tester list');
 assert.equal((await (await live.app({operation:'status'})).json()).test,false);
});

test('owner Pro is never sold over or changed by Stripe events',async()=>{
 const s=setup();s.db.tables.ai_entitlements.push({user_id:USER,plan:'pro',source:'owner',current_period_end:null,extra_voice_seconds:0,extra_month:null});
 const r=await s.app({operation:'checkout',plan:'plus'});assert.equal(r.status,409);assert.equal((await r.json()).code,'owner_plan');
 s.db.tables.billing_customers.push({user_id:USER,stripe_customer_id:'cus_1',plan:'free'});
 const del=await s.hook({id:'evt_o',type:'customer.subscription.deleted',data:{object:{id:'sub_1',customer:'cus_1',status:'canceled',items:{data:[{price:{id:'price_plus'}}]}}}});
 assert.equal((await del.json()).result,'owner plan kept');
 const pack=await s.hook({id:'evt_p',type:'checkout.session.completed',data:{object:{mode:'payment',payment_status:'paid',client_reference_id:USER,metadata:{kind:'minutes'}}}});
 assert.equal((await pack.json()).result,'owner plan kept');
 assert.equal(s.db.rpcs.length,0);assert.equal(s.db.tables.ai_entitlements[0].plan,'pro');assert.equal(s.db.tables.ai_entitlements[0].source,'owner');
});
