import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import policy from '../dist/homebase-route-policy.js';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const body=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
test('selected-hour list, navigation target, pins and route use the same destinations',()=>{
 const now=new Date(),stop={name:'Selected hot spot',lat:39.3,lon:-76.6,cat:'event'},nodes=new Map(),pins=[];
 const ctx={hourlyDestinations:[[],[stop]],forecastStartTime:now,activeDemandSources:[],activeStops:[],routeStopsExpanded:true,
  updateEarnings(){},updateCityPulse(){},renderDemandGrid(){},renderRouteStopsPanel(){},renderDemandCoach(){},marketTime:()=> 'later',marketParts:()=>({hour:15}),demandReason:()=> 'event',show(){},renderDestinationPoints:s=>pins.push(s),
  $:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
 vm.createContext(ctx);vm.runInContext(body('function applyTimeForecast(', '\nfunction hourColor('),ctx);
 ctx.applyTimeForecast(1);assert.equal(pins.at(-1)[0],stop);assert.deepEqual(Array.from(ctx.selectedDestination),[stop.lat,stop.lon]);
 ctx.applyTimeForecast(0);assert.equal(pins.at(-1).length,0);assert.equal(ctx.selectedDestination,null);
});
function refreshFixture(provider){
 const now=new Date(),old={name:'Expired event',cat:'event',lat:39.3,lon:-76.6,eventStart:new Date(now-10*3600000),eventEnd:new Date(now-9*3600000),tags:{providerEvent:true}},area={name:'Historic hot spot',cat:'neighborhood',lat:39.3,lon:-76.6},live={name:'Expired price',cat:'neighborhood',lat:39.3,lon:-76.6,tags:{providerSignal:true,uberSurgeMultiplier:2,providerSampledAt:new Date(now-3600000).toISOString()}},calls=[],button={dataset:{hour:'3'},setAttribute(k,v){this[k]=v;}};
 const ctx={document:{visibilityState:'visible',querySelector:()=>button,querySelectorAll:()=>[button]},currentLocation:[39.3,-76.6],gpsRequestInFlight:false,currentMarketName:'Baltimore',currentEventData:[old],activeDemandSources:[old,area,live],schoolEventRows:[],providerUberPoints:[],providerFlightPoints:[],refreshSchoolEvents(){},loadProviderSignals:async()=>{if(provider===null)throw Error('offline');return provider;},rideRelevantEvent:()=>true,HomeBasePublicData:{eventIdentity:e=>e.name},mergeDemandSources:(a,b)=>[...a,...b],
  buildRoute(sources){const p=policy.candidatesForHour(sources,now,{day:4,hour:15},now);calls.push(policy.selectRanked([...p.events,...p.live,...p.general].map(e=>({...e,routeDemand:8,score:8}))));},applyTimeForecast:index=>calls.push(index),renderDemandCoach(){},renderEvents:events=>calls.push(events),marketTime:()=> 'now',$:()=>({})};
 vm.createContext(ctx);vm.runInContext(body('async function refreshLiveDemandLayer(', '\nif(!demoLocale)'),ctx);return{ctx,calls,old,button};
}
test('a failed feed refresh expires stale destinations locally and keeps the selected hour',async()=>{
 const {ctx,calls,old,button}=refreshFixture(null);await ctx.refreshLiveDemandLayer();
 assert.deepEqual(calls[0].map(e=>e.name),['Historic hot spot']);assert.equal(calls[1],3);assert.ok(calls[2].includes(old),'keep the source record, not an expired destination');assert.equal(button['aria-pressed'],'true');
});
test('a successful feed refresh replaces old event destinations without switching forecast hours',async()=>{
 const event={name:'Current event',cat:'event',lat:39.3,lon:-76.6,eventStart:new Date(Date.now()+30*60000),tags:{providerEvent:true}};
 const {ctx,calls}=refreshFixture({events:[event]});await ctx.refreshLiveDemandLayer();assert.deepEqual(calls[0].map(e=>e.name),['Current event']);assert.equal(calls[1],3);
});
