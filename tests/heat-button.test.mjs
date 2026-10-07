import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('home heat icon reflects both visible and hidden states',()=>{
 const shell=fs.readFileSync(new URL('../dist/homebase-copilot.js',import.meta.url),'utf8');
 const fn=shell.slice(shell.indexOf(' function syncHomeHeatButton(){'),shell.indexOf(' syncHomeHeatButton();'));
 let hidden=false;const attrs={},label={},button={classList:{toggle:(key,value)=>attrs[key]=value},setAttribute:(key,value)=>attrs[key]=value,querySelector:()=>label};
 const ctx={homeControls:{querySelector:()=>button},app:{classList:{contains:()=>hidden}}};vm.createContext(ctx);vm.runInContext(fn,ctx);
 ctx.syncHomeHeatButton();assert.equal(attrs['aria-pressed'],'true');assert.equal(label.textContent,'Heat · ON');
 hidden=true;ctx.syncHomeHeatButton();assert.equal(attrs['aria-pressed'],'false');assert.equal(label.textContent,'Heat · OFF');
});
test('every mandatory offline asset is included in the install list',()=>{
 const sw=fs.readFileSync(new URL('../dist/sw.js',import.meta.url),'utf8');
 const assets=vm.runInNewContext(sw.match(/const ASSETS=(\[[^;]+\]);/)[1]);
 const required=vm.runInNewContext(sw.match(/for\(const path of (\[[^\]]+\])/)[1]);
 for(const path of required)assert(assets.includes(path),'Missing precache entry: '+path);
});
