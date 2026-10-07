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
test('the release cache includes the exact script and stylesheet URLs loaded by the page',()=>{
 const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'),sw=fs.readFileSync(new URL('../dist/sw.js',import.meta.url),'utf8');
 const assets=vm.runInNewContext(sw.match(/const ASSETS=(\[[^;]+\]);/)[1]);
 for(const [,asset] of html.matchAll(/(?:src|href)="([^" ]+\.(?:js|css)\?v=\d+)"/g))assert.ok(assets.includes(asset),'Stale offline runtime: '+asset);
 const generation=sw.match(/home-base-v(\d+)/)[1];assert.ok(html.includes('sw.js?v='+generation));
 const guard=html.match(/sessionStorage\.getItem\('([^']+)'\)/)[1];assert.ok(html.includes("sessionStorage.setItem('"+guard+"','1')"),'Reload guard must be marked after first update');
});
