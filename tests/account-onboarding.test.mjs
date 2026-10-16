import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {mergeProgress,mergeValue,deviceHasDriverData,progressKeys,progressSnapshot,createHomeBaseBackend} from '../src/backend-client.mjs';
const source=readFileSync(new URL('../dist/homebase-growth.js',import.meta.url),'utf8');

function storage(initial={}){const map=new Map(Object.entries(initial).map(([k,v])=>[k,JSON.stringify(v)]));
 return {map,getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),json:k=>map.has(k)?JSON.parse(map.get(k)):null};}

function harness({device={},cloud={version:0,state:{}},cloudRows=[],cloudTrips=[]}={}){
 let callback,user=null,account;const timers=[],calls={saveProgress:[],saveEarnings:[],saveDispatchTrips:[],updatePassword:[]};
 const local=storage(device);
 const backend={getUser:async()=>user,ensureProfile:async()=>{},privacy:async()=>({}),getProgress:async()=>cloud,sponsors:async()=>[],onAuthChange:fn=>{callback=fn;},
  listEarnings:async()=>cloudRows,listDispatchTrips:async()=>cloudTrips,getDispatchState:async()=>null,listDispatchRecommendations:async()=>[],
  saveProgress:async(state,v)=>{calls.saveProgress.push({state,v});cloud={version:v+1,state};return{version:v+1};},
  saveEarnings:async rows=>{calls.saveEarnings.push(rows);cloudRows=[...cloudRows,...rows];return{saved:rows.length};},
  saveDispatchTrips:async rows=>{calls.saveDispatchTrips.push(rows);cloudTrips=[...cloudTrips,...rows];return{added:rows.length};},
  updatePassword:async pw=>{calls.updatePassword.push(pw);},verifyEmailCode:async(email)=>{user={id:'driver',email};},sendSignInLink:async()=>{}};
 const context={module:{exports:{}},HomeBaseCloud:{connectHomeBase:()=>backend,progressKeys,SYNC_KEYS:{},progressSnapshot,mergeProgress,deviceHasDriverData,syncStatus:()=>({state:'signed-in',detail:''})},
  HomeBasePlanner:{summarize:rows=>({count:rows.length})},HomeBaseConfig:{},localStorage:local,
  document:{getElementById:id=>id==='workspaceTitle'?{textContent:'Profile'}:{},querySelector:()=>null,addEventListener(){},createElement:()=>({})},
  renderProfile(){},renderEarningsPanel(){},renderSupport(){},applyProductPrefs(){},updateEarnings(){},earningsProfile:null,hbTrack(){},fetch:async()=>({json:async()=>({features:[]})}),setTimeout:fn=>timers.push(fn),setInterval(){},Event:class{},confirm:()=>true};
 context.window=context;context.addEventListener=()=>{};context.dispatchEvent=()=>{};
 context.FormData=class{constructor(form){this.values=form.values;}get(key){return this.values?.[key]??null;}};
 const content={prepend:node=>{account=node;},append(){}};const getElement=context.document.getElementById;
 context.document.getElementById=id=>id==='workspaceContent'?content:getElement(id);
 context.document.createElement=()=>{const nodes=new Map();return{querySelector:selector=>{if(!nodes.has(selector))nodes.set(selector,{value:'',reportValidity:()=>true,addEventListener(name,fn){this[name]=fn;}});return nodes.get(selector);}};};
 vm.runInNewContext(source,context);context.module.exports.boot();
 return {context,backend,calls,local,account:()=>{context.renderProfile();return account;},setUser:v=>{user=v;},event:e=>callback(e),
  async flush(){for(let i=0;i<60;i++)await Promise.resolve();while(timers.length){timers.shift()();for(let i=0;i<60;i++)await Promise.resolve();}}};
}

test('merge keeps every filled-in value from the account and the device',()=>{
 const merged=mergeProgress({homeBaseDriverProfile:{name:'Chris',market:'Baltimore',apps:['Uber']},homeBaseShifts:[{id:1}]},
  {homeBaseDriverProfile:{name:'',market:'Paramus',apps:['Empower']},homeBaseShifts:[{id:2},{id:1}],homeBaseMapUi:{}});
 assert.deepEqual(merged.homeBaseDriverProfile,{name:'Chris',market:'Paramus',apps:['Uber','Empower']});
 assert.deepEqual(merged.homeBaseShifts,[{id:1},{id:2}]);
 assert.equal(mergeValue('cloud',null),'cloud');assert.equal(mergeValue(null,'device'),'device');
 assert.equal(deviceHasDriverData(storage({homeBaseMapUi:{}})),false);
 assert.equal(deviceHasDriverData(storage({homeBaseDriverProfile:{name:'C'}})),true);
});

test('new drivers can create an account with the email code; existing-only sign-in stays possible',async()=>{
 let options;const api=createHomeBaseBackend({auth:{signInWithOtp:async args=>{options=args.options;return{data:{},error:null};}}});
 await api.sendSignInLink('new@example.test','https://x/',{createAccount:true});assert.equal(options.shouldCreateUser,true);
 await api.sendSignInLink('old@example.test','https://x/');assert.equal(options.shouldCreateUser,false);
});

test('signing in on an empty phone brings the account data down automatically',async()=>{
 const h=harness({cloud:{version:3,state:{homeBaseDriverProfile:{name:'Chris'}}},cloudRows:[{id:'e1',earnings:100}],cloudTrips:[{record_id:'t1',source:'csv'}]});
 await h.flush();h.setUser({id:'driver',email:'driver@example.test'});h.event('SIGNED_IN');await h.flush();
 assert.deepEqual(h.local.json('homeBaseDriverProfile'),{name:'Chris'});
 assert.equal(h.local.json('homeBaseLedger').length,1);assert.equal(h.local.json('homeBaseTripRows').length,1);
 assert.equal(h.local.getItem('homeBaseCloudOwner'),'driver');assert.equal(h.local.getItem('homeBaseAutoCloud'),'true');
 assert.equal(h.calls.saveEarnings.length,0,'nothing from an empty phone is uploaded');
});

test('a phone with driver data is combined with the account automatically — nothing is replaced',async()=>{
 const h=harness({device:{homeBaseDriverProfile:{market:'Paramus',vehicle:'RDX'},homeBaseLedger:[{id:'d1',earnings:50,source:'csv'}]},
  cloud:{version:2,state:{homeBaseDriverProfile:{name:'Chris'}}},cloudRows:[{id:'e1',earnings:100}]});
 await h.flush();h.setUser({id:'driver',email:'driver@example.test'});h.event('SIGNED_IN');await h.flush();
 assert.doesNotMatch(h.account().innerHTML,/cloudLinkCard|Not mine/);
 assert.deepEqual(h.local.json('homeBaseDriverProfile'),{name:'Chris',market:'Paramus',vehicle:'RDX'});
 assert.equal(h.calls.saveProgress[0].v,2);assert.equal(h.calls.saveEarnings[0][0].id,'d1');
 assert.deepEqual(h.local.json('homeBaseLedger').map(r=>r.id).sort(),['d1','e1']);
 assert.equal(h.local.getItem('homeBaseCloudOwner'),'driver');
});

test('every later save combines with newer cloud changes instead of overwriting them',async()=>{
 const h=harness({device:{homeBaseDriverProfile:{vehicle:'RDX'}},cloud:{version:1,state:{homeBaseDriverProfile:{name:'Chris'}}}});
 await h.flush();h.setUser({id:'driver',email:'driver@example.test'});h.event('SIGNED_IN');await h.flush();
 // Another device adds a field; this phone then changes something else and saves.
 const before=h.calls.saveProgress.length;
 h.backend.getProgress=async()=>({version:9,state:{homeBaseDriverProfile:{name:'Chris',goal:120}}});
 h.local.setItem('homeBaseDriverProfile',JSON.stringify({name:'Chris',vehicle:'RDX',platform:'Uber'}));
 h.account().querySelector('#cloudSave').click();await h.flush();
 const saved=h.calls.saveProgress.at(-1);assert.ok(h.calls.saveProgress.length>before);assert.equal(saved.v,9);
 assert.deepEqual(saved.state.homeBaseDriverProfile,{name:'Chris',goal:120,vehicle:'RDX',platform:'Uber'});
 assert.deepEqual(h.local.json('homeBaseDriverProfile'),{name:'Chris',goal:120,vehicle:'RDX',platform:'Uber'});
});

test('a save that races another device retries with a fresh combine',async()=>{
 const h=harness({cloud:{version:1,state:{}}});await h.flush();h.setUser({id:'driver',email:'driver@example.test'});h.event('SIGNED_IN');await h.flush();
 let first=true;const original=h.backend.saveProgress;
 h.backend.saveProgress=async(state,v)=>{if(first){first=false;throw Object.assign(new Error('changed'),{name:'CloudConflictError'});}return original(state,v);};
 h.backend.getProgress=async()=>({version:5,state:{homeBaseShifts:[{id:'other-device'}]}});
 h.local.setItem('homeBaseShifts',JSON.stringify([{id:'this-phone'}]));
 h.account().querySelector('#cloudSave').click();await h.flush();
 assert.deepEqual(h.calls.saveProgress.at(-1).state.homeBaseShifts.map(s=>s.id).sort(),['other-device','this-phone']);
});

test('password forms submit for real into a hidden frame so iPhone Passwords can save them',async()=>{
 const h=harness();await h.flush();const html=h.account().innerHTML;
 assert.match(html,/<iframe name="hbCredentialSink"/);assert.match(html,/id="cloudAuth" method="post" action="about:blank" target="hbCredentialSink"/);
});

test('after a code sign-in the driver can save a password the iPhone can remember',async()=>{
 const h=harness();await h.flush();h.context.renderProfile();
 let account=h.account();account.querySelector('[name=email]').value='driver@example.test';account.querySelector('#cloudEmailLink').click();await h.flush();
 account=h.account();account.querySelector('#cloudCode').submit({preventDefault(){},target:{values:{code:'123456'}}});await h.flush();
 account=h.account();assert.match(account.innerHTML,/autocomplete="username" value="driver@example.test">/);assert.match(account.innerHTML,/id="cloudSetPassword" class="growth-password" method="post" action="about:blank" target="hbCredentialSink"/);assert.match(account.innerHTML,/autocomplete="new-password"/);
 account.querySelector('#cloudSetPassword').submit({preventDefault(){},target:{values:{password:'a-long-password'}}});await h.flush();
 assert.deepEqual(h.calls.updatePassword,['a-long-password']);assert.doesNotMatch(h.account().innerHTML,/cloudSetPassword/);
});

test('signed-out screen leads with the email code and keeps password sign-in available',async()=>{
 const h=harness();await h.flush();const html=h.account().innerHTML;
 assert.ok(html.indexOf('cloudEmailLink')<html.indexOf('cloudPasswordBox'));assert.match(html,/The same code creates your account/);assert.match(html,/Sign in with a password instead/);
});
