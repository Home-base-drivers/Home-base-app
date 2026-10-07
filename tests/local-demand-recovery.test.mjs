import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import policy from '../dist/homebase-route-policy.js';
import planner from '../dist/homebase-planner.js';
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
function extract(name){const match=html.match(new RegExp('(?:async )?function '+name+'\\('));assert.ok(match,name);const start=match.index,body=html.indexOf('{',start);let depth=0;for(let i=body;i<html.length;i++){if(html[i]==='{')depth++;else if(html[i]==='}'&&!--depth)return html.slice(start,i+1);}throw Error(name);}
function routeFixture(){
 const nodes=new Map(),calls={markers:[],heat:[],hours:null};
 const $=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:false});return nodes.get(id);};
 const layer={addTo(){return this;},clearLayers(){}};
 const context={Date,Number,Math,Set,HomeBaseRoutePolicy:policy,HomeBasePlanner:planner,HomeBaseHeat:{createLayer:()=>layer},
  hourlyDestinations:[],activeStops:[],routeLayers:[],routeStrokeLayers:[],heatAreaLayer:null,heatLayer:null,demandAreaSourceRef:null,routeRequestSerial:0,demandAreas:[],providerFlightPoints:[],currentApps:[{base:30}],selectedDestination:null,
  liveMap:{removeLayer(){},once(){},fitBounds(){},setView(){}},L:{layerGroup:()=>layer,latLngBounds:()=>({pad(){return this}})},
  isGreaterBaltimoreLocation:()=>false,distanceKm:(a,b)=>planner.distance?planner.distance(a,b):Math.hypot(a[0]-b[0],a[1]-b[1])*111,
  fallbackVenues:()=>[],fallbackDemandSources:()=>[],restaurantDistrictCandidates:()=>[],readProfile:()=>({radius:25}),readCostPrefs:()=>({reserveRate:.2}),
  marketParts:when=>({day:when.getDay(),hour:when.getHours()}),demandWeight:source=>source.cat==='event'?20:6,categoryColor:()=> '#ff9900',
  mergeDemandSources:(a,b)=>[...a,...b],bindDemandSources(){},loadBaltimoreDemandAreas:async()=>[],createAreaCoverageSources:()=>[],
  renderDestinationPoints:options=>calls.markers.push(options),renderDemandGrid:sources=>calls.heat.push(sources),renderDemandCoach(){},
  renderTimeButtons:(stops,options,start,selected)=>calls.hours={stops,options,start,selected},renderRouteStopsPanel:stops=>calls.stops=stops,
  applyTimeForecast(){},show(){},marketTime:when=>when.toISOString(),setTimeout(){},$,publicSignalsRefreshedAt:null,selectedForecastTime:new Date(),forecastStartTime:new Date(),routeStopsExpanded:false};
 vm.createContext(context);vm.runInContext(extract('buildRoute'),context);return{context,calls,nodes};
}
test('an empty current hour does not suppress a later verified event in the 12-hour route',()=>{
 const {context,calls}=routeFixture(),event={name:'Scheduled game',cat:'event',lat:41.001,lon:-74,eventStart:new Date(Date.now()+4*3600000),tags:{liveEvent:true}};
 context.buildRoute([event],41,-74,'Local',[event]);
 assert.ok(context.activeStops.length>0,'later event must be planned');
 assert.equal(context.hourlyDestinations.length,12);
 assert.equal(context.hourlyDestinations[0].length,0);
 assert.ok(context.hourlyDestinations.slice(1).some(options=>options[0]?.name===event.name));
 assert.ok(calls.heat.at(-1).some(source=>source.name===event.name));
});
test('a real local area remains a destination and heat source without Baltimore polygons',()=>{
 const {context,calls}=routeFixture(),area={name:'Public local town',cat:'neighborhood',lat:41.01,lon:-74.01,tags:{publicVenue:true,place:'town'}};
 context.buildRoute([area],41,-74,'Local',[area]);
 assert.equal(context.activeStops.length,12);assert.equal(context.hourlyDestinations.length,12);
 assert.equal(calls.markers[0][0].name,area.name);assert.ok(calls.heat.at(-1).includes(area));
});
test('scheduled events get real map pins even when they are not current-hour pickups',()=>{
 const pins=[];const L={divIcon:x=>x,marker:point=>{const marker={point,addTo(){pins.push(this);return this},bindPopup(){return this},on(){return this}};return marker}};
 const context={eventMapLayers:[],L,liveMap:{removeLayer(){}},eventColor:()=> '#ff9900',eventIconSvg:()=> '<svg/>',safeText:String,eventPopupContent:()=> 'Scheduled event',traceDestinationRoute(){},marketTime:()=> '8 PM',$:()=>({}),show(){}};
 vm.createContext(context);vm.runInContext(extract('renderEventMarkers'),context);
 context.renderEventMarkers([{name:'Scheduled game',cat:'event',lat:40.8296,lon:-73.9262,eventStart:new Date(Date.now()+3600000)}]);
 assert.equal(pins.length,1);assert.deepEqual(Array.from(pins[0].point),[40.8296,-73.9262]);
});
test('venue recovery includes building footprints and preserves nearby saved places during an outage',async()=>{
 const queries=[],storage=new Map();let online=true;
 const context={Map,Set,Date,Number,Math,category:tags=>tags.railway?'transit':'neighborhood',distanceKm:(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])*111,
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  overpassMarketQuery:async query=>{queries.push(query);return online?{elements:[{type:'way',tags:{name:'Real station',railway:'station'},center:{lat:41.01,lon:-74.01}}]}:{elements:[]}}};
 vm.createContext(context);vm.runInContext('const localVenueRequests=new Map();'+extract('loadVenues'),context);
 const first=await context.loadVenues(41,-74);assert.equal(first[0].cat,'transit');assert.equal(first[0].lat,41.01);
 assert.ok(queries.every(q=>q.includes('nwr(')),'include ways and relations, not nodes alone');
 assert.ok(queries.every(q=>!q.includes('65000')&&!q.includes('fast_food')),'keep rides query local and avoid delivery expansion');
 online=false;const recovered=await context.loadVenues(41.001,-74.001);assert.equal(recovered[0].name,'Real station');assert.equal(recovered[0].tags.cachedPublicVenue,true);
 assert.equal((await context.loadVenues(25.76,-80.19)).length,0,'never transplant another market');
});
