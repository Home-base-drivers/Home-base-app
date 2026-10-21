import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=name=>fs.readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
test('Layers opens settings without toggling demand visibility',()=>{
 const html=read('index.html'),shell=read('homebase-copilot.js');
 const line=html.split('\n').find(line=>line.startsWith("$('#layerBtn').addEventListener"));
 let handler,event;
 vm.runInNewContext(line,{$:()=>({addEventListener:(_,fn)=>handler=fn}),document:{dispatchEvent:e=>event=e},CustomEvent:class{constructor(type){this.type=type}}});
 handler();assert.equal(event.type,'homebase:open-layers');
 assert.match(shell,/addEventListener\('homebase:open-layers',\(\)=>\{openMenu\(\);showMenuView\('heat'\)/);
 assert.doesNotMatch(shell,/Street \/ Satellite/);
});
test('display opacity strengthens colors while preserving clear edges and ordering',()=>{
 const source=read('homebase-heat.js');
 const fn=source.match(/function displayOpacity\(value\) \{[\s\S]*?\n  \}/)[0];
 const context={clamp:(x,a,b)=>Math.max(a,Math.min(b,x))};vm.createContext(context);vm.runInContext(fn,context);
 const opacity=context.displayOpacity;
 assert.equal(opacity(0),0);assert.equal(opacity(-1),0);assert.equal(opacity(1),1);
 assert(opacity(.34)>.49);assert(opacity(.8)<.94);
 let previous=0;for(let i=1;i<=100;i++){const value=i/100,result=opacity(value);assert(result>=value&&result>=previous&&result<=1);previous=result;}
 assert.match(source,/255 \* displayOpacity\(composed.opacity\) \* zoomFactor/);
});
