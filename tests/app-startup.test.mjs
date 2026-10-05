import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('function refreshLocationFast('));
const planner=readFileSync(new URL('../dist/homebase-planner.js',import.meta.url),'utf8');
function startApp(){
  const nodes=new Map(),timers=[],positions=[],views=[],listeners={};
  const classes=()=>{const values=new Set();return{add:(...xs)=>xs.forEach(x=>values.add(x)),remove:(...xs)=>xs.forEach(x=>values.delete(x)),contains:x=>values.has(x),toggle:(x,on)=>{on=on??!values.has(x);on?values.add(x):values.delete(x);return on;}};};
  const node=id=>{if(nodes.has(id))return nodes.get(id);const n={id,hidden:false,dataset:{},style:{},classList:classes(),textContent:'',innerHTML:'',addEventListener(){},setAttribute(){},removeAttribute(){},querySelector:()=>node(id+'-child'),querySelectorAll:()=>[],append(){},prepend(){},insertAdjacentHTML(){},scrollIntoView(){},remove(){}};nodes.set(id,n);return n;};
  for(const m of html.matchAll(/\bid="([^"]+)"/g))node(m[1]);
  const slots=[0,1,2].map(i=>{const n=node('slot'+i);n.dataset.slot=String(i);return n;});
  const query=s=>s==='main'?node('mainContent'):s==='.skip-link'?null:s.startsWith('#')?nodes.get(s.slice(1))||null:node(s);
  const queryAll=s=>s==='[data-slot]'?slots:s==='[data-online-slot]'?slots:s==='.nav-btn'?['navMap','navEarn','navAlerts','navProfile','navSupport'].map(node):[];
  node('app').querySelector=query;node('app').querySelectorAll=queryAll;
  const document={querySelector:query,querySelectorAll:queryAll,getElementById:id=>nodes.get(id)||null,createElement:tag=>node('created-'+tag),body:node('body'),head:node('head'),visibilityState:'visible',addEventListener(){}};
  const layer=()=>{const x=new Proxy({style:{},options:{}},{get:(o,k)=>k in o?o[k]:(...args)=>{if(k==='setView')views.push(args[0]);return x;}});return x;};
  const L={map:layer,tileLayer:layer,layerGroup:layer,circleMarker:layer,circle:layer,polyline:layer,marker:layer,divIcon:layer,CircleMarker:class{}};
  const localStorage={getItem:()=>null,setItem(){},removeItem(){}};
  const context={document,L,HomeBaseHeat:{paletteNames:['classic'],setPalette:()=>{},createLayer:layer},HomeBaseMarket:{isBaltimorePoint:()=>true},HomeBasePlanner:{rankCandidates:()=>[]},localStorage,navigator:{userAgent:'iPhone',geolocation:{getCurrentPosition:(ok,fail,options)=>positions.push({ok,fail,options})}},location:{search:''},matchMedia:()=>({matches:false}),URLSearchParams,URL,AbortController,Intl,Date,console,setTimeout:(cb,ms)=>{timers.push({cb,ms});return timers.length;},clearTimeout(){},setInterval(){},fetch:async()=>{throw Error('Offline fixture');},crypto:{}};
  context.window=context;context.addEventListener=(name,cb)=>{listeners[name]=cb;};context.scrollTo=()=>{};
  vm.createContext(context);vm.runInContext(script,context);
  return{context,nodes,timers,positions,views,localStorage};
}
test('fresh-device startup reaches automatic GPS and initializes the controls',()=>{
  const app=startApp();
  assert.match(html,/<main id="mainContent">/);
  assert.equal(app.nodes.get('mainContent').id,'mainContent');
  const timer=app.timers.find(t=>t.ms===150);assert.ok(timer,'GPS startup must be scheduled');timer.cb();
  assert.equal(app.positions.length,1);
  assert.ok(app.nodes.get('refreshBtn').classList.contains('refreshing'));
});
test('map-only controls hide and restore after full application startup',()=>{
  const app=startApp();
  const hide=planner.match(/^    function setControlsHidden\(hidden\).*$/m)?.[0];assert.ok(hide);
  vm.runInContext('let controlsHidden=false;const restore=document.createElement("button"),newPanels=document.getElementById("panelsBtn");function saveView(){}\n'+hide+'\nsetControlsHidden(true);',app.context);
  assert.ok(app.nodes.get('app').classList.contains('ui-hidden'));
  assert.ok(app.nodes.get('body').classList.contains('hb-map-only'));
  assert.equal(app.nodes.get('workspaceView').hidden,true);
  assert.equal(vm.runInContext('restore.hidden',app.context),false);
  vm.runInContext('setControlsHidden(false)',app.context);
  assert.ok(!app.nodes.get('app').classList.contains('ui-hidden'));
  assert.ok(!app.nodes.get('body').classList.contains('hb-map-only'));
  assert.equal(vm.runInContext('restore.hidden',app.context),true);
});
test('valid GPS centers the map even when saving the device location fails',()=>{
  const app=startApp();
  vm.runInContext('buildRoute=()=>{};loadWeather=()=>{};loadHighways=()=>{};detectMarket=async()=>({name:"Baltimore",countryCode:"US"});loadVenues=async()=>[];loadTodayEvents=async()=>[];',app.context);
  app.localStorage.setItem=()=>{throw Error('Device storage unavailable');};
  app.timers.find(t=>t.ms===150).cb();
  app.positions[0].ok({coords:{latitude:39.29,longitude:-76.61,accuracy:20}});
  assert.deepEqual(Array.from(app.views.at(-1)),[39.29,-76.61]);
  assert.ok(!app.nodes.get('refreshBtn').classList.contains('refreshing'));
});
test('a denied GPS request ends the pending state and can be retried',()=>{
  const app=startApp();app.timers.find(t=>t.ms===150).cb();app.positions[0].fail({code:1});
  assert.ok(!app.nodes.get('refreshBtn').classList.contains('refreshing'));
  vm.runInContext('refreshLocationFast()',app.context);assert.equal(app.positions.length,2);
});
