import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const shell=readFileSync(new URL('../dist/homebase-copilot.js',import.meta.url),'utf8');
const planner=readFileSync(new URL('../dist/homebase-planner.js',import.meta.url),'utf8');

test('planner mounts hidden drawer command targets before binding their handlers',()=>{
 const ids=new Map();
 const toolbar={style:{},setAttribute(){},innerHTML:''};
 const stage={before(node){for(const match of node.innerHTML.matchAll(/id="([^"]+)"/g))ids.set(match[1],{});}};
 const context=vm.createContext({document:{createElement:()=>toolbar,querySelector:selector=>selector==='.map-stage'?stage:null}});
 const start=planner.indexOf("    const toolbar=document.createElement('div');");
 const end=planner.indexOf('    const status=text=>',start);
 vm.runInContext(planner.slice(start,end),context);
 assert.equal(toolbar.style.display,'none');
 for(const id of ['hidePlannerView','driveViewToggle','demandDetails','showPickupCard','hideMapControls','toggleMapTabs'])assert.ok(ids.has(id),'unmounted command '+id);
});

function commands(){
 const storage=new Map(),clicks=[],classes=new Set();
 const targets=new Map(['navMap','navEarn','navProfile','navAlerts','navSupport','workspaceClose','demandDetails','showPickupCard','installBtn'].map(id=>[id,{click:()=>clicks.push(id),focus(){}}]));
 const context=vm.createContext({
  navVisible:false,referenceNavVisible:true,menuRestoreState:null,modules:{route:false,conditions:false},defaults:{route:false,conditions:false},moduleMeta:[['route'],['conditions']],menuStatus:{textContent:''},
  app:{classList:{toggle(key,value){if(value)classes.add(key);else classes.delete(key);}}},
  document:{getElementById:id=>targets.get(id)||null},navigator:{standalone:false},matchMedia:()=>({matches:false}),requestAnimationFrame:fn=>fn(),
  write:(key,value)=>storage.set(key,value),read:(key,fallback)=>storage.get(key)??fallback,
  syncHomeHud:()=>{},applyModules:()=>{},closeMenu:()=>{},setVoiceStatus:()=>{},
  setAllModules:value=>{for(const key of Object.keys(context.modules))context.modules[key]=value;}
 });
 const start=shell.indexOf(' function setNavVisible('),end=shell.indexOf(" drawer.querySelectorAll('[data-nav]')",start);
 vm.runInContext(shell.slice(start,end),context);
 return {context,storage,clicks,classes,command:id=>context.runMenuCommand({dataset:{control:id}},'control')};
}

test('Driving view starts clean from the default Home and restores the saved view',()=>{
 const f=commands();
 assert.equal(f.command('driveViewToggle'),true);
 assert.equal(f.context.referenceNavVisible,false);
 assert.equal(f.storage.get('homeBaseMenuRestoreState').navVisible,true);
 assert.equal(f.command('driveViewToggle'),true);
 assert.equal(f.context.referenceNavVisible,true);
 assert.ok(f.clicks.includes('navMap'),'driving commands return from a workspace to Map');
});

test('Navigation tabs controls the actual reference bar and persists its preference',()=>{
 const f=commands();
 f.command('toggleMapTabs');assert.equal(f.context.referenceNavVisible,false);
 assert.equal(f.storage.get('homeBaseReferenceNavVisible'),false);
 f.command('toggleMapTabs');assert.equal(f.context.referenceNavVisible,true);
 assert.equal(f.storage.get('homeBaseReferenceNavVisible'),true);
});

test('Demand and pickup commands switch to Map before executing the actual target',()=>{
 for(const id of ['demandDetails','showPickupCard']){
  const f=commands();assert.equal(f.command(id),true);assert.deepEqual(f.clicks,['navMap',id]);
 }
});

test('voice status remains visible inside the open submenu',()=>{
 const classes=new Set();
 const context=vm.createContext({drawer:{classList:{contains:()=>true}},menuStatus:{textContent:''},liveText:{textContent:'',classList:{add:key=>classes.add(key),remove:key=>classes.delete(key)}},voiceNoticeTimer:null,clearTimeout(){},setTimeout(){return 1},showText:false});
 const line=shell.split('\n').find(line=>line.startsWith(' function setVoiceStatus('));
 vm.runInContext(line,context);context.setVoiceStatus('AI voice is unavailable on this device.',true);
 assert.equal(context.menuStatus.textContent,'AI voice is unavailable on this device.');
});
