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

function commands(initial={}){
 const storage=new Map(),clicks=[],classes=new Set(),menuEvents=[];
 const indicators={toggle:{setAttribute(key,value){this[key]=value;}},state:{textContent:''},hint:{textContent:''}};
 const targets=new Map(['navMap','navEarn','navProfile','navAlerts','navSupport','workspaceClose','demandDetails','showPickupCard','installBtn'].map(id=>[id,{click:()=>clicks.push(id),focus(){}}]));
 const context=vm.createContext({
  drivingViewActive:false,drivingRestoreState:null,navVisible:false,referenceNavVisible:true,menuRestoreState:null,modules:{route:false,conditions:false},defaults:{route:false,conditions:false},moduleMeta:[['route'],['conditions']],menuStatus:{textContent:''},
  app:{classList:{toggle(key,value){if(value)classes.add(key);else classes.delete(key);}}},
  drawer:{querySelector:selector=>({'#hbDrivingViewToggle':indicators.toggle,'#hbDrivingViewState':indicators.state,'#hbDrivingViewHint':indicators.hint}[selector]||null)},
  document:{getElementById:id=>targets.get(id)||null},navigator:{standalone:false},matchMedia:()=>({matches:false}),queueMicrotask:fn=>fn(),
  write:(key,value)=>storage.set(key,value),read:(key,fallback)=>storage.get(key)??fallback,
  syncHomeHud:()=>{},applyModules:()=>{},closeMenu:()=>menuEvents.push('close'),setVoiceStatus:()=>{},
  setAllModules:value=>{for(const key of Object.keys(context.modules))context.modules[key]=value;},...initial
 });
 const start=shell.indexOf(' function syncDrivingPreferences('),end=shell.indexOf(" drawer.querySelectorAll('[data-nav]')",start);
 vm.runInContext(shell.slice(start,end),context);
 return {context,storage,clicks,classes,menuEvents,indicators,command:(id,keepMenuOpen=false)=>context.runMenuCommand({dataset:{control:id,keepMenuOpen:String(keepMenuOpen)}},'control')};
}

test('Driving view starts clean from the default Home and restores the saved view',()=>{
 const f=commands();
 assert.equal(f.command('driveViewToggle'),true);
 assert.equal(f.context.referenceNavVisible,false);
 assert.equal(f.storage.get('homeBaseDrivingRestoreState').navVisible,true);
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


test('Driving Preferences shows ON and OFF without closing its submenu',()=>{
 const f=commands();
 f.command('driveViewToggle',true);
 assert.equal(f.indicators.state.textContent,'ON');
 assert.equal(f.indicators.toggle['aria-pressed'],'true');
 assert.equal(f.storage.get('homeBaseDrivingViewActive'),true);
 assert.deepEqual(f.menuEvents,[]);
 f.command('driveViewToggle',true);
 assert.equal(f.indicators.state.textContent,'OFF');
 assert.equal(f.indicators.toggle['aria-pressed'],'false');
 assert.equal(f.storage.get('homeBaseDrivingViewActive'),false);
 assert.deepEqual(f.menuEvents,[]);
});

test('Changing panels in driving view does not reverse the next toggle or lose the original layout',()=>{
 const f=commands({modules:{route:true,conditions:false}});
 f.command('driveViewToggle',true);
 f.context.modules.conditions=true;
 f.command('driveViewToggle',true);
 assert.equal(f.context.drivingViewActive,false);
 assert.equal(f.context.modules.route,true);
 assert.equal(f.context.modules.conditions,false);
 assert.equal(f.context.referenceNavVisible,true);
});

test('Saved driving preferences restore after reopening the app',()=>{
 const first=commands({modules:{route:true,conditions:false}});
 first.command('driveViewToggle',true);
 const reopened=commands({drivingViewActive:first.storage.get('homeBaseDrivingViewActive'),drivingRestoreState:first.storage.get('homeBaseDrivingRestoreState'),modules:{route:false,conditions:false},referenceNavVisible:false});
 reopened.context.syncDrivingPreferences();
 assert.equal(reopened.indicators.state.textContent,'ON');
 reopened.command('driveViewToggle',true);
 assert.equal(reopened.context.modules.route,true);
 assert.equal(reopened.context.referenceNavVisible,true);
});

test('Restore controls exits driving view and preserves the independently saved layout',()=>{
 const f=commands({modules:{route:true,conditions:false}});
 f.command('driveViewToggle',true);
 f.context.menuRestoreState={modules:{route:false,conditions:true},navVisible:false};
 f.command('showMapControls');
 assert.equal(f.context.drivingViewActive,false);
 assert.equal(f.context.modules.route,true);
 assert.equal(f.context.modules.conditions,false);
 assert.equal(f.context.referenceNavVisible,true);
});

function panels(){
 class Node{
  constructor(name){this.name=name;this.children=[];this.parentNode=null;this.dataset={};this.hidden=false;this.attributes={};this.listeners={};this.finders={};}
  detach(){if(this.parentNode)this.parentNode.children.splice(this.parentNode.children.indexOf(this),1);this.parentNode=null;}
  append(node){node.detach();node.parentNode=this;this.children.push(node);}
  before(node){node.detach();const parent=this.parentNode;node.parentNode=parent;parent.children.splice(parent.children.indexOf(this),0,node);}
  replaceWith(node){node.detach();const parent=this.parentNode;parent.children.splice(parent.children.indexOf(this),1,node);node.parentNode=parent;this.parentNode=null;}
  replaceChildren(){for(const child of this.children)child.parentNode=null;this.children=[];}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(key,value){this.listeners[key]=value;}
  querySelector(key){return this.finders[key];}
  set innerHTML(value){const heading=new Node('heading'),body=new Node('body');heading.finders.i=new Node('indicator');this.finders={'.hb-panel-heading':heading,'.hb-panel-body':body};this.append(heading);this.append(body);}
 }
 const parents=['header','main','stage','footer'].map(name=>new Node(name)),selectors=['.conditions','#compareSourceRow','.platforms','#forecastNote','#timeRow','#routePlan','#legend','#bottomSheet'];
 const sources=new Map(selectors.map((selector,index)=>{const node=new Node(selector);parents[index===0?0:index<5?1:index<7?2:3].append(node);return[selector,node];}));
 const original=parents.map(parent=>[...parent.children]);
 const stack=new Node('stack'),select=new Node('select');
 const browser={querySelector:selector=>selector==='#hbPanelStack'?stack:select,querySelectorAll:()=>stack.children};
 const context=vm.createContext({document:{querySelector:selector=>sources.get(selector),createElement:name=>new Node(name),createComment:()=>new Node('anchor')},panelsBrowser:browser,moduleMeta:[['conditions','Conditions'],['platforms','Platforms'],['forecast','Hours'],['route','Events'],['legend','Key'],['briefing','Briefing']],esc:value=>value});
 const start=shell.indexOf(' let panelSources=[];'),end=shell.indexOf(" panelsBrowser.querySelector('#hbPanelSelect').addEventListener",start);
 vm.runInContext(shell.slice(start,end),context);
 return {context,stack,parents,original,sources};
}

test('Full view moves live panels once and restores their original nodes and positions on close',()=>{
 const f=panels(),eventNode=f.sources.get('#routePlan'),handler=()=>{};
 eventNode.addEventListener('click',handler);
 f.context.mountHomePanels();assert.equal(f.stack.children.length,6);
 f.context.mountHomePanels();assert.equal(f.stack.children.length,6);
 assert.equal(eventNode.parentNode.name,'body');
 f.context.restoreHomePanels();
 assert.equal(f.stack.children.length,0);
 for(let i=0;i<f.parents.length;i++)assert.deepEqual(f.parents[i].children,f.original[i]);
 assert.equal(eventNode.listeners.click,handler);
 f.context.mountHomePanels();f.context.restoreHomePanels();
 for(let i=0;i<f.parents.length;i++)assert.deepEqual(f.parents[i].children,f.original[i]);
});

test('Full view minimizes panels independently and selector reveals the requested panel',()=>{
 const f=panels();f.context.mountHomePanels();
 const [conditions,platforms]=f.stack.children;
 f.context.setPanelExpanded(conditions,false);
 assert.equal(conditions.querySelector('.hb-panel-body').hidden,true);
 assert.equal(platforms.querySelector('.hb-panel-body').hidden,false);
 assert.equal(conditions.querySelector('.hb-panel-heading').attributes['aria-expanded'],'false');
 f.context.filterHomePanels('conditions');
 assert.equal(conditions.hidden,false);
 assert.equal(conditions.querySelector('.hb-panel-body').hidden,false);
 assert.equal(platforms.hidden,true);
 f.context.filterHomePanels('all');
 assert.ok(f.stack.children.every(card=>!card.hidden));
});
