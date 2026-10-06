import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const engine=readFileSync(new URL('../dist/homebase-heat.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const shell=readFileSync(new URL('../dist/homebase-copilot.js',import.meta.url),'utf8');

function setup(storage=new Map()){
 const context=vm.createContext({localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},renders:[],activeDemandSources:[],selectedForecastTime:0,renderDemandGrid:(...args)=>context.renders.push(args),updatePaletteButton:()=>{}});
 vm.runInContext(engine,context);
 vm.runInContext(html.slice(html.indexOf('const heatPaletteNames='),html.indexOf('const initialHeatVisible=')),context);
 for(const name of ['setHeatPalette','setHeatCustomColors']){
  const line=html.split('\n').find(line=>line.startsWith('function '+name+'('));
  assert.ok(line,'missing runtime handler '+name);vm.runInContext(line,context);
 }
 context.window={HomeBaseHeatControls:{getCustomColors:()=>context.HomeBaseHeat.getCustomColors(),setCustomColors:context.setHeatCustomColors,setPalette:context.setHeatPalette}};
 return context;
}

function attachEditor(context){
 const make=()=>({hidden:true,value:'',textContent:'',attributes:{},style:{setProperty(){}},setAttribute(key,value){this.attributes[key]=value},listeners:{},addEventListener(type,callback){this.listeners[type]=callback},scrollIntoView(){}});
 const inputs=['#6838c4','#1f92ff','#ffffff'].map(value=>{const node=make();node.value=value;const label=make();node.parentElement={querySelector:()=>label};return node});
 const custom=make();custom.dataset={heatPalette:'custom'};
 const preset=make();preset.dataset={heatPalette:'aurora'};
 const editor=make(),preview=make(),status=make(),apply=make();
 const nodes={'#hbHeatLow':inputs[0],'#hbHeatMedium':inputs[1],'#hbHeatHigh':inputs[2],'#hbCustomHeat':editor,'#hbCustomHeatPreview':preview,'#hbCustomHeatStatus':status,'#hbApplyCustomHeat':apply,'[data-heat-palette="custom"]':custom};
 context.drawer={querySelector:key=>nodes[key],querySelectorAll:selector=>selector==='[data-heat-palette]'?[custom,preset]:[]};
 context.syncHeatMenu=()=>{};context.menuNotice=()=>{};
 vm.runInContext(shell.slice(shell.indexOf(' const customHeatInputs='),shell.indexOf(' function syncHeatMenu(){')),context);
 vm.runInContext(shell.slice(shell.indexOf(" drawer.querySelectorAll('[data-heat-palette]')"),shell.indexOf(" const heatVisibility=drawer.querySelector('#hbHeatVisibility');")),context);
 return {inputs,custom,preset,editor,preview,status,apply};
}

test('Custom previews a draft, applies the actual map palette, and restores it on reload',()=>{
 const storage=new Map(),context=setup(storage),ui=attachEditor(context);
 ui.custom.listeners.click();assert.equal(ui.editor.hidden,false);
 const colors=['#123456','#abcdef','#fedcba'];
 ui.inputs.forEach((input,index)=>{input.value=colors[index];input.listeners.input()});
 assert.equal(context.HomeBaseHeat.getPalette(),'classic','editing is a preview until Apply');
 assert.equal(context.renders.length,0);
 assert.ok(ui.preview.style.background.includes(colors.join(',')));
 ui.apply.listeners.click();
 assert.equal(context.HomeBaseHeat.getPalette(),'custom');
 assert.deepEqual(Array.from(context.HomeBaseHeat.getCustomColors()),colors);
 assert.equal(storage.get('homeBaseHeatPalette'),'custom');
 assert.deepEqual(JSON.parse(storage.get('homeBaseHeatCustomColors')),colors);
 assert.equal(context.renders.length,1,'applying redraws the demand map');
 const reloaded=setup(storage);
 assert.equal(reloaded.HomeBaseHeat.getPalette(),'custom');
 assert.deepEqual(Array.from(reloaded.HomeBaseHeat.getCustomColors()),colors);
 ui.preset.listeners.click();
 assert.equal(context.HomeBaseHeat.getPalette(),'aurora');
 assert.deepEqual(JSON.parse(storage.get('homeBaseHeatCustomColors')),colors,'choosing a preset retains personal colors');
});

test('invalid stored custom colors recover safely and malformed updates do not save or redraw',()=>{
 const storage=new Map([['homeBaseHeatCustomColors','{broken'],['homeBaseHeatPalette','custom']]);
 const context=setup(storage),original=Array.from(context.HomeBaseHeat.getCustomColors());
 assert.equal(context.setHeatCustomColors(['red','#ffffff','#000000']),null);
 assert.deepEqual(Array.from(context.HomeBaseHeat.getCustomColors()),original);
 assert.equal(storage.get('homeBaseHeatCustomColors'),'{broken');
 assert.equal(context.renders.length,0);
});

test('every preset offered in the menu renders a valid color across all demand levels',()=>{
 const context=setup();
 const names=[...shell.matchAll(/data-heat-palette="([^"]+)"/g)].map(match=>match[1]);
 for(const name of new Set(names)){
  assert.equal(context.HomeBaseHeat.setPalette(name),name);
  for(const level of [0,.25,.5,.75,1]){
   const color=Array.from(context.HomeBaseHeat.colorAt(level));
   assert.equal(color.length,3);
   assert.ok(color.every(channel=>Number.isInteger(channel)&&channel>=0&&channel<=255));
  }
 }
});
