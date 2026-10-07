import test from 'node:test';
import assert from 'node:assert/strict';
import heat from '../dist/homebase-heat.js';
test('point-only markets render without Baltimore neighborhood polygons, with every palette',()=>{
 const previous=global.window;global.window={devicePixelRatio:1};
 try{
  const L={Layer:{extend:definition=>class {constructor(){Object.assign(this,definition);this.initialize()}}},DomUtil:{setPosition(){}}};
  const layer=heat.createLayer(L),output={setTransform(){},clearRect(){}};
  layer._map={getSize:()=>({x:390,y:700}),containerPointToLayerPoint:()=>({x:0,y:0}),getZoom:()=>13};
  layer._canvas={style:{},getContext:()=>output};
  let received=[];layer._drawSources=(_output,_map,sources)=>{received=sources};
  for(const [lat,lon] of [[25.7617,-80.1918],[40.7128,-74.006],[34.0522,-118.2437]]){
   layer._sources=[{name:'Local public venue',lat,lon,cat:'transit',tags:{publicVenue:true}}];
   for(const palette of heat.paletteNames){heat.setPalette(palette);received=[];layer._draw();assert.equal(received.length,1);assert.equal(received[0].lat,lat)}
  }
  layer._sources=[];received=[];layer._draw();assert.equal(received.length,0);
 }finally{global.window=previous;heat.setPalette('classic')}
});
test('local point heat stays present at every zoom and uses finer samples in neighborhoods',()=>{
 const previous=global.window;global.window={devicePixelRatio:1};
 try{
  const L={Layer:{extend:definition=>class {constructor(){Object.assign(this,definition);this.initialize()}}},DomUtil:{setPosition(){}}};
  const layer=heat.createLayer(L),output={setTransform(){},clearRect(){}},samples=[];let zoom=8;
  layer._map={getSize:()=>({x:390,y:700}),containerPointToLayerPoint:()=>({x:0,y:0}),getZoom:()=>zoom};
  layer._canvas={style:{},getContext:()=>output};
  layer._sources=[{name:'Real transit stop',lat:41.01,lon:-74.01,cat:'transit',tags:{publicVenue:true}}];
  layer._drawSources=(_output,_map,sources,_size,sample)=>{assert.equal(sources.length,1);assert.equal(sources[0].lat,41.01);samples.push(sample);};
  for(const level of [8,10,13,16]){zoom=level;layer._draw();}
  assert.equal(samples.length,4);assert.ok(samples.every(sample=>sample>=1&&sample<=3));
  assert.ok(samples[0]>samples[1]&&samples[1]>samples[2]);assert.equal(samples[2],samples[3]);
 }finally{global.window=previous;}
});
