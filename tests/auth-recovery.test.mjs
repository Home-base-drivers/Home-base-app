import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/homebase-growth.js',import.meta.url),'utf8');
function harness(){
 let callback,nav=0,user=null,identityError=null,cloudError=null;
 let account;
 const timers=[];
 const backend={getUser:async()=>{if(identityError)throw identityError;return user;},ensureProfile:async()=>{if(cloudError)throw cloudError;},privacy:async()=>({}),getProgress:async()=>({version:0}),sponsors:async()=>[],onAuthChange:fn=>{callback=fn;}};
 const context={module:{exports:{}},HomeBaseCloud:{connectHomeBase:()=>backend,progressKeys:[],SYNC_KEYS:{}},HomeBaseConfig:{},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},document:{getElementById:id=>id==='workspaceTitle'?{textContent:'Map'}:id==='navProfile'?{click(){nav++;}}:{},querySelector:()=>null,addEventListener(){},createElement:()=>({})},renderProfile(){},renderEarningsPanel(){},renderSupport(){},hbTrack(){},fetch:async()=>({json:async()=>({features:[]})}),setTimeout:fn=>timers.push(fn),setInterval(){},Event:class{}};
 context.window=context;context.addEventListener=()=>{};context.dispatchEvent=()=>{};
 context.FormData=class{constructor(form){this.values=form.values;}get(key){return this.values?.[key]??null;}};
 const content={prepend:node=>{account=node;},append(){}};
 const getElement=context.document.getElementById;
 context.document.getElementById=id=>id==='workspaceContent'?content:getElement(id);
 context.document.createElement=()=>{
   const nodes=new Map();return {querySelector:selector=>{if(!nodes.has(selector))nodes.set(selector,{value:'',reportValidity:()=>true,addEventListener(name,fn){this[name]=fn;}});return nodes.get(selector);}};
 };
 context.HomeBaseCloud.syncStatus=()=>({state:'signed-out',detail:'Signed out.'});
 vm.runInNewContext(source,context);context.module.exports.boot();
 return {context,backend,account:()=>account,setUser:v=>{user=v;},setIdentityError:v=>{identityError=v;},setCloudError:v=>{cloudError=v;},event:e=>callback(e),nav:()=>nav,async flush(){for(let i=0;i<40;i++)await Promise.resolve();while(timers.length){timers.shift()();for(let i=0;i<40;i++)await Promise.resolve();}}};
}
test('recovery link opens the password reset account screen without manual navigation',async()=>{
 const h=harness();await h.flush();h.setUser({id:'driver',email:'driver@example.test'});h.event('PASSWORD_RECOVERY');await h.flush();assert.equal(h.nav(),1);assert.equal(h.context.HomeBaseCloudState.signedIn,true);
});
test('cloud settings failure cannot hide a successfully authenticated identity',async()=>{
 const h=harness();await h.flush();h.setUser({id:'driver',email:'driver@example.test'});h.setCloudError(new Error('Cloud settings unavailable'));h.event('SIGNED_IN');await h.flush();assert.equal(h.context.HomeBaseCloudState.signedIn,true);
});
test('transient identity network error preserves identity; confirmed missing session clears it',async()=>{
 const h=harness();await h.flush();h.setUser({id:'driver'});await h.context.HomeBaseAccounts.refreshIdentity();h.setIdentityError(new Error('Network unavailable'));await assert.rejects(h.context.HomeBaseAccounts.refreshIdentity());assert.equal(h.context.HomeBaseCloudState.signedIn,true);
 h.setIdentityError(Object.assign(new Error('Auth session missing!'),{name:'AuthSessionMissingError'}));await h.context.HomeBaseAccounts.refreshIdentity();assert.equal(h.context.HomeBaseCloudState.signedIn,false);
});
test('initial session event refreshes identity after startup',async()=>{
 const h=harness();await h.flush();h.setUser({id:'driver'});h.event('INITIAL_SESSION');await h.flush();assert.equal(h.context.HomeBaseCloudState.signedIn,true);
});
test('email sign-in button needs only a valid email, preserves it, and never reports signed in before verification',async()=>{
 const h=harness();await h.flush();let request;
 h.backend.sendSignInLink=async(email,redirect)=>{request={email,redirect};};
 h.context.renderProfile();let account=h.account();
 assert.match(account.innerHTML,/type="button" id="cloudEmailLink"/);
 account.querySelector('[name=email]').value=' driver@example.test ';
 account.querySelector('#cloudEmailLink').click();await h.flush();
 assert.equal(request.email,'driver@example.test');assert.equal(request.redirect,'https://home-base-drivers.github.io/Home-base-app/');
 assert.equal(h.context.HomeBaseCloudState.signedIn,false);
 h.context.renderProfile();account=h.account();assert.match(account.innerHTML,/value="driver@example.test"/);assert.match(account.innerHTML,/a sign-in code is on its way/);
 assert.match(account.innerHTML,/id="cloudCode"/);assert.match(account.innerHTML,/autocomplete="one-time-code"/);assert.doesNotMatch(account.innerHTML,/value="000000"/);
});
test('invalid email blocks a sign-in email request and provider errors do not report email delivery',async()=>{
 const h=harness();await h.flush();let calls=0;
 h.backend.sendSignInLink=async()=>{calls++;throw new Error('Email service unavailable');};
 h.context.renderProfile();let account=h.account();account.querySelector('[name=email]').reportValidity=()=>false;
 account.querySelector('#cloudEmailLink').click();await h.flush();assert.equal(calls,0);
 account.querySelector('[name=email]').reportValidity=()=>true;account.querySelector('[name=email]').value='driver@example.test';
 account.querySelector('#cloudEmailLink').click();await h.flush();assert.equal(calls,1);h.context.renderProfile();assert.match(h.account().innerHTML,/Email service unavailable/);assert.doesNotMatch(h.account().innerHTML,/a sign-in code is on its way/);
});

test('email OTP signs in inside the current app and rejected codes never claim success',async()=>{
 const h=harness();await h.flush();h.backend.sendSignInLink=async()=>{};
 h.context.renderProfile();let account=h.account();account.querySelector('[name=email]').value='driver@example.test';account.querySelector('#cloudEmailLink').click();await h.flush();
 h.backend.verifyEmailCode=async()=>{throw new Error('Token has expired or is invalid');};
 h.context.renderProfile();account=h.account();account.querySelector('#cloudCode').submit({preventDefault(){},target:{values:{code:'000000'}}});await h.flush();
 assert.equal(h.context.HomeBaseCloudState.signedIn,false);h.context.renderProfile();assert.match(h.account().innerHTML,/code is invalid or expired/);
 h.backend.verifyEmailCode=async(email,code)=>{assert.equal(email,'driver@example.test');assert.equal(code,'000000');h.setUser({id:'driver',email});};
 h.account().querySelector('#cloudCode').submit({preventDefault(){},target:{values:{code:'000000'}}});await h.flush();
 assert.equal(h.context.HomeBaseCloudState.signedIn,true);h.context.renderProfile();assert.doesNotMatch(h.account().innerHTML,/id="cloudCode"/);assert.match(h.account().innerHTML,/Signed in on this device/);
});
