import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/homebase-growth.js',import.meta.url),'utf8');
function harness(){
 let callback,nav=0,user=null,identityError=null,cloudError=null;
 const timers=[];
 const backend={getUser:async()=>{if(identityError)throw identityError;return user;},ensureProfile:async()=>{if(cloudError)throw cloudError;},privacy:async()=>({}),getProgress:async()=>({version:0}),sponsors:async()=>[],onAuthChange:fn=>{callback=fn;}};
 const context={module:{exports:{}},HomeBaseCloud:{connectHomeBase:()=>backend,progressKeys:[],SYNC_KEYS:{}},HomeBaseConfig:{},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},document:{getElementById:id=>id==='workspaceTitle'?{textContent:'Map'}:id==='navProfile'?{click(){nav++;}}:{},querySelector:()=>null,addEventListener(){},createElement:()=>({})},renderProfile(){},renderEarningsPanel(){},renderSupport(){},hbTrack(){},fetch:async()=>({json:async()=>({features:[]})}),setTimeout:fn=>timers.push(fn),setInterval(){},Event:class{}};
 context.window=context;context.addEventListener=()=>{};context.dispatchEvent=()=>{};
 vm.runInNewContext(source,context);context.module.exports.boot();
 return {context,setUser:v=>{user=v;},setIdentityError:v=>{identityError=v;},setCloudError:v=>{cloudError=v;},event:e=>callback(e),nav:()=>nav,async flush(){for(let i=0;i<10;i++)await Promise.resolve();while(timers.length){timers.shift()();for(let i=0;i<10;i++)await Promise.resolve();}}};
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
