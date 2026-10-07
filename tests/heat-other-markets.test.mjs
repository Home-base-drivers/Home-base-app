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
