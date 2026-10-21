import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const heat=createRequire(import.meta.url)('../dist/homebase-heat.js');
test('City Heat blends blue through purple into red without changing evidence levels',()=>{
 heat.setPalette('city_heat');
 try{
  const low=heat.colorAt(.18),mid=heat.colorAt(.55),high=heat.colorAt(1);
  assert(low[2]>low[0]&&low[2]>low[1]);assert(mid[0]>mid[1]&&mid[2]>mid[1]);assert(high[0]>high[1]*3);
  assert.equal(heat.composeFields(0,0,0,0,{}).opacity,0);
  assert(heat.composeFields(0,0,1,.5,{}).level<.42);
 }finally{heat.setPalette('classic')}
});
test('neighborhood interpolation is broader but verified signals and school limits are unchanged',()=>{
 const venue={cat:'restaurant',tags:{publicVenue:true}};
 assert.equal(heat.displayFootprintKm(venue,'modeled'),heat.sourceFootprintKm(venue)*1.4);
 for(const evidence of ['event','surge','current','history'])assert.equal(heat.displayFootprintKm(venue,evidence),heat.sourceFootprintKm(venue));
 const school={cat:'k12',tags:{publicVenue:true}};
 assert.equal(heat.displayFootprintKm(school,'modeled'),.25);assert.equal(heat.sourceInfluenceLimitKm(school),.4);
});
test('new default migrates classic once, preserving custom palettes and later selections',()=>{
 const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
 const line=html.split('\n').find(x=>x.startsWith('let heatPaletteIndex='));
 function choose(saved,done){const values=new Map(Object.entries({...saved&&{homeBaseHeatPalette:saved},...done&&{homeBaseCityHeatDefault:'1'}}));const context={heatPaletteNames:heat.paletteNames,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)}};return heat.paletteNames[vm.runInNewContext(line+';heatPaletteIndex',context)]}
 assert.equal(choose(null,false),'city_heat');assert.equal(choose('classic',false),'city_heat');
 assert.equal(choose('custom',false),'custom');assert.equal(choose('purple_blue_white',false),'purple_blue_white');
 assert.equal(choose('classic',true),'classic');
});
