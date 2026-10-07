import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
function extract(name){return html.match(new RegExp('function '+name+'\\([^]*?\\n\\}'))[0]}
test('events require dates and exclude low-signal calendar listings',()=>{
 const ctx={};vm.createContext(ctx);vm.runInContext(extract('rideRelevantEvent'),ctx);
 const base={eventStart:new Date(Date.now()+3600000).toISOString(),lat:39,lon:-76};
 for(const name of ['concert','football','convention','festival'])assert.equal(ctx.rideRelevantEvent({...base,name}),true);
 for(const name of ['Exhibition in gallery','virtual conference','club meeting','campus tour','unknown activity'])assert.equal(ctx.rideRelevantEvent({...base,name}),false);
 assert.equal(ctx.rideRelevantEvent({...base,name:'concert',eventStart:'invalid'}),false);
});
test('navigation requires a destination and uses current position supplied by Maps',()=>{
 let opened,notice;
 const ctx={selectedDestination:null,currentLocation:[39,-76],locationMode:'current',show:x=>notice=x,window:{location:{assign:x=>opened=x}}};
 vm.createContext(ctx);vm.runInContext(extract('openHomeNavigation'),ctx);
 ctx.openHomeNavigation();assert.equal(opened,undefined);assert.equal(notice[1],'Choose a destination');
 ctx.selectedDestination=[40,-75];ctx.openHomeNavigation();assert.match(opened,/destination=40,-75/);assert.match(opened,/dir_action=navigate/);assert(!opened.includes('&origin='));

});
test('all inline scripts parse',()=>{for(const [,body] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(body)});
