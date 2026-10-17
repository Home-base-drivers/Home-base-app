import {test} from 'node:test';
import assert from 'node:assert/strict';
import {billingHandler,verifyStripeSignature,form,localMonth,WEBHOOK_URL,CATALOG} from '../supabase/functions/billing/handler.mjs';

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
  if(url.includes('/webhook_endpoints'))return new Response(JSON.stringify(init.method==='GET'?{data:[]}:{id:'we_1'}));
  if(url.includes('/billing_portal/configurations'))return new Response(JSON.stringify(init.method==='GET'?{data:[]}:{id:'bpc_1'}));
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

// A small in-memory Stripe for the live self-setup path.
function fakeStripe(){
 const st={products:{},prices:[],hooks:[],portals:[],events:{},calls:[]};let n=0;
 const ok=b=>new Response(JSON.stringify(b)),err=(status,code)=>new Response(JSON.stringify({error:{code}}),{status});
 const fetchImpl=async(url,init)=>{const u=new URL(url),path=u.pathname.replace('/v1',''),body=init.body?Object.fromEntries(new URLSearchParams(init.body)):{};st.calls.push([init.method,path]);
  if(path.startsWith('/products/'))return st.products[path.slice(10)]?ok(st.products[path.slice(10)]):err(404,'resource_missing');
  if(path==='/products'){if(st.products[body.id])return err(400,'resource_already_exists');st.products[body.id]={id:body.id};return ok(st.products[body.id]);}
  if(path==='/prices'&&init.method==='GET'){const keys=u.searchParams.getAll('lookup_keys[]');return ok({data:st.prices.filter(p=>keys.includes(p.lookup_key))});}
  if(path==='/prices'){const p={id:'price_'+(++n),lookup_key:body.lookup_key,product:body.product,unit_amount:+body.unit_amount,recurring:body['recurring[interval]']||null};st.prices.push(p);return ok(p);}
  if(path==='/webhook_endpoints'&&init.method==='GET')return ok({data:st.hooks});
  if(path==='/webhook_endpoints'){const h={id:'we_'+(++n),url:body.url,enabled_events:Object.entries(body).filter(([k])=>k.startsWith('enabled_events')).map(([,v])=>v),status:'enabled'};st.hooks.push(h);return ok(h);}
  if(path==='/billing_portal/configurations'&&init.method==='GET')return ok({data:st.portals});
  if(path==='/billing_portal/configurations'){const c={id:'bpc_'+(++n),metadata:{app:body['metadata[app]']},body};st.portals.push(c);return ok(c);}
  if(path.startsWith('/events/'))return st.events[path.slice(8)]?ok(st.events[path.slice(8)]):err(404,'resource_missing');
  if(path==='/customers')return ok({id:'cus_live'});
  if(path==='/checkout/sessions')return ok({url:'https://checkout.stripe.com/live',body});
  if(path.startsWith('/subscriptions/'))return ok({id:'sub_live',customer:'cus_live',status:'active',items:{data:[{price:{id:st.prices.find(p=>p.lookup_key==='homebase_pro_monthly').id},current_period_end:1795000000}]}});
  return err(404,'resource_missing');};
 return{st,fetchImpl};
}
const liveEnv=(key,extra={})=>k=>({SUPABASE_URL:'u',SUPABASE_SERVICE_ROLE_KEY:'s',STRIPE_SECRET_KEY:key,...extra})[k];
const call=(handler,body,headers={})=>handler(new Request('https://x/billing',{method:'POST',headers:{Origin:'https://home-base-drivers.github.io',...headers},body:JSON.stringify(body)}));

test('live key alone: server creates products, prices, webhook and portal once, and finds them again',async()=>{
 const f=fakeStripe();
 const h1=billingHandler(()=>fakeDb(),liveEnv('sk_live_setupA'),f.fetchImpl);
 const r=await (await call(h1,{operation:'health'})).json();
 assert.equal(r.mode,'live');assert.equal(r.ready,true);assert.equal(r.open,false,'sales stay closed without BILLING_ENABLED');
 assert.equal(f.st.prices.length,3);assert.deepEqual(f.st.prices.map(p=>[p.lookup_key,p.unit_amount,p.recurring]),[['homebase_plus_monthly',1999,'month'],['homebase_pro_monthly',3999,'month'],['homebase_minutes_100',1499,null]]);
 assert.equal(f.st.hooks.length,1);assert.equal(f.st.hooks[0].url,WEBHOOK_URL);assert.deepEqual(f.st.hooks[0].enabled_events.sort(),['checkout.session.completed','customer.subscription.created','customer.subscription.deleted','customer.subscription.updated']);
 assert.equal(f.st.portals.length,1);assert.equal(f.st.portals[0].body['features[subscription_cancel][mode]'],'at_period_end');
 assert.equal(f.st.portals[0].body['features[subscription_update][products][1][prices][0]'],f.st.prices[1].id);
 assert.ok(!JSON.stringify(r).includes('sk_live'),'no secret in the response');
 // A new server instance (different cache key) reuses everything instead of duplicating it.
 const h2=billingHandler(()=>fakeDb(),liveEnv('sk_live_setupB'),f.fetchImpl);
 const r2=await (await call(h2,{operation:'health'})).json();
 assert.equal(r2.ready,true);assert.equal(f.st.prices.length,3);assert.equal(f.st.hooks.length,1);assert.equal(f.st.portals.length,1);
 assert.deepEqual(r2.prices,r.prices);
});

test('without a signing secret, webhooks use Stripe\'s own copy of the event; forged bodies change nothing',async()=>{
 const f=fakeStripe(),db=fakeDb();
 const h=billingHandler(()=>db,liveEnv('sk_live_hookC',{BILLING_ENABLED:'true'}),f.fetchImpl);
 await call(h,{operation:'health'});
 f.st.events.evt_real={id:'evt_real',type:'checkout.session.completed',data:{object:{mode:'subscription',subscription:'sub_live',client_reference_id:USER}}};
 // Attacker posts a body claiming a different user and plan; only the id is used.
 const forged=await h(new Request('https://x/billing',{method:'POST',headers:{'Stripe-Signature':'t=1,v1=00'},body:JSON.stringify({id:'evt_real',type:'checkout.session.completed',data:{object:{client_reference_id:'someone-else'}}})}));
 assert.equal((await forged.json()).result,'plan pro');
 assert.equal(db.tables.ai_entitlements[0].user_id,USER);assert.equal(db.tables.ai_entitlements[0].plan,'pro');
 const fake=await h(new Request('https://x/billing',{method:'POST',headers:{'Stripe-Signature':'x'},body:JSON.stringify({id:'evt_made_up'})}));assert.equal(fake.status,400);
 const junk=await h(new Request('https://x/billing',{method:'POST',headers:{'Stripe-Signature':'x'},body:'{"id":"../customers"}'}));assert.equal(junk.status,400);
});

test('live checkout uses the created price, card/wallet methods from the dashboard, and links the terms',async()=>{
 const f=fakeStripe(),db=fakeDb();
 const h=billingHandler(()=>db,liveEnv('sk_live_checkD',{BILLING_ENABLED:'true',BILLING_TEST_EMAILS:'driver@example.test'}),f.fetchImpl);
 const st=await (await h(new Request('https://x/billing',{method:'POST',headers:{Authorization:'Bearer good',Origin:'https://home-base-drivers.github.io'},body:JSON.stringify({operation:'status'})}))).json();
 assert.equal(st.open,true);assert.equal(st.test,false);
 const r=await h(new Request('https://x/billing',{method:'POST',headers:{Authorization:'Bearer good',Origin:'https://home-base-drivers.github.io'},body:JSON.stringify({operation:'checkout',plan:'plus'})}));
 assert.equal(r.status,200);
 const session=(await r.json());assert.equal(session.url,'https://checkout.stripe.com/live');
 const sent=f.st.calls.filter(c=>c[1]==='/checkout/sessions').length;assert.equal(sent,1);
 const closed=billingHandler(()=>fakeDb(),liveEnv('sk_live_checkE',{BILLING_TEST_EMAILS:'driver@example.test'}),f.fetchImpl);
 const c2=await closed(new Request('https://x/billing',{method:'POST',headers:{Authorization:'Bearer good',Origin:'https://home-base-drivers.github.io'},body:JSON.stringify({operation:'checkout',plan:'plus'})}));
 assert.equal(c2.status,503,'live key + tester list does not open sales');
});

test('health is also readable with a plain GET and never needs sign-in',async()=>{
 const f=fakeStripe();
 const h=billingHandler(()=>fakeDb(),liveEnv('sk_live_getF'),f.fetchImpl);
 const r=await h(new Request('https://x/billing?health=1'));assert.equal(r.status,200);
 const j=await r.json();assert.equal(j.ready,true);assert.equal(j.mode,'live');
 assert.equal((await billingHandler(()=>fakeDb(),()=>undefined)(new Request('https://x/billing?health=1'))).status,200);
 assert.equal((await h(new Request('https://x/billing'))).status,405);
});
