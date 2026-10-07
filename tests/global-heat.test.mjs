import test from 'node:test';
import assert from 'node:assert/strict';
import globalHeat from '../dist/homebase-global-heat.js';
test('world exploration caches places, clears empty regions and restores home heat',async()=>{
 let point=[48.85,2.35],home=false,level=12,calls=0,message;
 const explorer=globalHeat.create({load:async()=>{calls++;return [{lat:point[0],lon:point[1]}]},center:()=>point,zoom:()=>level,nearHome:()=>home,render(){},status:s=>message=s});
 await explorer.refresh();assert.equal(calls,1);assert.equal(explorer.getSources()[0].lat,48.85);
 await explorer.refresh();assert.equal(calls,1);assert.match(message,/not live ride requests/);
 level=3;await explorer.refresh();assert.deepEqual(explorer.getSources(),[]);assert.match(message,/Zoom in/);
 home=true;await explorer.refresh();assert.equal(explorer.getSources(),null);
});
test('late responses cannot overwrite the newly viewed region',async()=>{
 const pending=[];let point=[10,20];
 const explorer=globalHeat.create({load:()=>new Promise(resolve=>pending.push(resolve)),center:()=>point,zoom:()=>12,nearHome:()=>false,render(){},status(){}});
 const first=explorer.refresh();point=[30,40];const second=explorer.refresh();
 pending[1]([{lat:30,lon:40}]);await second;pending[0]([{lat:10,lon:20}]);await first;
 assert.equal(explorer.getSources()[0].lat,30);
});
