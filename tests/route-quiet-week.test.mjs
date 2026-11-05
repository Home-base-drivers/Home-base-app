// Nov 5, 2026: "There have been little to no events for a week, and the map has too many stops.
// Random points." With no events the route filled all 12 hours from old surge screenshots, hopping
// between screenshot points about a kilometre apart. These tests use the real stored history.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const policy=require('../dist/homebase-route-policy.js'),planner=require('../dist/homebase-planner.js'),publicData=require('../dist/homebase-public-data.js'),market=require('../dist/baltimore-market.js'),history=require('../dist/homebase-demand-history.js');
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
function extract(name){const m=html.match(new RegExp('(?:async )?function '+name+'\\('));assert.ok(m,name);const s=m.index,b=html.indexOf('{',s);let d=0;for(let i=b;i<html.length;i++){if(html[i]==='{')d++;else if(html[i]==='}'&&!--d)return html.slice(s,i+1);}throw Error(name);}
function quietDay(iso){
 const now=new Date(iso),RealDate=Date;class FixedDate extends RealDate{constructor(...a){if(a.length)super(...a);else super(now)}static now(){return +now}}
 const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:false});return nodes.get(id)},layer={addTo(){return this},clearLayers(){}},shown=[];
 const ctx={Date:FixedDate,Intl,globalThis:{HomeBaseDemandHistory:history},window:{HomeBaseMarket:market},HomeBaseMarket:market,HomeBasePublicData:publicData,HomeBaseRoutePolicy:policy,HomeBasePlanner:planner,HomeBaseHeat:{createLayer:()=>layer},
  hourlyDestinations:[],activeStops:[],routeLayers:[],routeStrokeLayers:[],heatAreaLayer:null,heatLayer:null,demandAreaSourceRef:null,routeRequestSerial:0,demandAreas:[],providerFlightPoints:[],currentApps:[{base:23}],selectedDestination:null,
  liveMap:{removeLayer(){},once(){},fitBounds(){},setView(){}},L:{layerGroup:()=>layer,latLngBounds:()=>({pad(){return this}})},
  distanceKm:(a,b)=>{const r=Math.PI/180,x=(b[1]-a[1])*r*Math.cos((a[0]+b[0])*r/2),y=(b[0]-a[0])*r;return Math.sqrt(x*x+y*y)*6371},
  readProfile:()=>({radius:25}),readCostPrefs:()=>({reserveRate:.2}),marketTimeZone:'America/New_York',demandWeight:s=>s.cat==='event'?20:7,categoryColor:()=>'#f90',
  eventToken:v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(),bindDemandSources(){},loadBaltimoreDemandAreas:async()=>[],createAreaCoverageSources:()=>[],
  renderDestinationPoints(){},renderDemandGrid(){},renderDemandCoach(){},renderTimeButtons(){},renderRouteStopsPanel(){},applyTimeForecast(){},show:x=>shown.push(x),marketTime:w=>w.toISOString(),clockLabel:x=>x,setTimeout(){},$,
  publicSignalsRefreshedAt:null,selectedForecastTime:now,forecastStartTime:now,routeStopsExpanded:false,schoolBellTimes:[],employerSites:[],frameMapOn(){}};
 vm.createContext(ctx);
 vm.runInContext(['marketParts','isGreaterBaltimoreLocation','fallbackVenues','fallbackDemandSources','restaurantDistrictCandidates','mergeDemandSources','applyBellTimes','applySiteStatus','driverRouteLabel','buildRoute'].map(extract).join('\n'),ctx);
 ctx.buildRoute([],39.2904,-76.6122,'Baltimore',[]);
 return {plan:vm.runInContext('shiftPlan',ctx),ctx,shown};
}
for(const iso of ['2026-11-05T09:00:00-05:00','2026-11-05T17:00:00-05:00','2026-11-08T12:00:00-05:00']){
 test('a week with no events gives a few stops backed by repeated surges, not twelve random points ('+iso+')',()=>{
  const {plan,ctx,shown}=quietDay(iso),stops=plan.filter(p=>p.stop),places=stops.filter(p=>!p.stay);
  assert.equal(plan.length,12);
  assert.ok(places.length<=4,'distinct stops on a quiet day: '+places.map(p=>p.stop.name).join(', '));
  for(const p of stops){
   assert.equal(p.stop.routeEvidence?.kind,'history',p.stop.name);
   assert.ok(p.stop.routeEvidence.days>=3,p.stop.name+' needs 3+ past surge days');
   assert.match(ctx.driverRouteLabel(p.stop),/Surged here on \d+ past days around this time/);
  }
  for(const p of stops.filter(p=>p.stay))assert.equal(p.legMiles,0);
  assert.match(shown.at(-1)[2],new RegExp('^'+places.length+' stops?, each backed by an event, a schedule or repeated surges'));
 });
}
test('weak surge history stays on the heat map and is not a route stop',()=>{
 const when=new Date('2026-11-05T15:00:00-05:00'),area={name:'Somewhere',cat:'neighborhood',lat:39.3,lon:-76.6};
 assert.equal(policy.generalEvidence(area,{day:4,hour:15},when,{history:()=>({distinctDates:2,confidence:.5})}),null,'two days is not a pattern');
 assert.equal(policy.generalEvidence(area,{day:4,hour:15},when,{history:()=>({distinctDates:9,confidence:.05})}),null,'many faint days is not a pattern');
 assert.equal(policy.generalEvidence(area,{day:4,hour:15},when,{history:()=>({distinctDates:4,confidence:.3})})?.kind,'history');
 assert.equal(policy.generalEvidence({...area,tags:{recurringPattern:true,patternDays:2,patternConfidence:.4}},{day:4,hour:15},when),null);
 assert.match(html,/if\(r\.share>0&&HomeBaseRoutePolicy\.strongHistory\(r\)\)out\.push/);
});
test('the route stays in its surge area unless a clearly stronger pattern or an event leads',()=>{
 const h=(name,lat,score)=>({name,lat,lon:-76.6,routeBasis:'general_area',routeEvidence:{kind:'history',days:5},planningScore:score});
 const last=h('Here',39.3,20);
 assert.equal(policy.stayOption([h('Elsewhere',39.4,24),h('Here again',39.301,20)],last)?.name,'Here again');
 assert.equal(policy.stayOption([h('Elsewhere',39.4,40),h('Here again',39.301,20)],last),null,'a much stronger area is worth the drive');
 assert.equal(policy.stayOption([{name:'Show',lat:39.4,lon:-76.6,routeBasis:'verified_event'},h('Here again',39.301,20)],last),null,'events move the route');
 assert.equal(policy.stayOption([{...h('Bell',39.4,30),routeEvidence:{kind:'school'}},h('Here again',39.301,20)],last),null,'published schedules move the route');
});
test('one pin per place: an hour spent staying extends the earlier pin instead of stacking another',()=>{
 const markers=extract('renderShiftMarkers');
 assert.match(markers,/if\(!p\.stop\|\|p\.stay\)return;/);assert.match(markers,/' \+'\+\(run-1\)\+'h'/);
 assert.match(extract('shiftPlanTotals'),/stops:legs\.filter\(p=>!p\.stay\)\.length/);
});
