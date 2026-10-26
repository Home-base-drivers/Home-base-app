// Builds dist/homebase-service-areas.js from config/rideshare-markets.json.
//   node scripts/build-service-areas.mjs
// The market list (Uber, Lyft and other rideshare apps by city) decides, for each driver,
// which places can count: inside the market's working radius and its pickup states (US) or
// country (elsewhere). A test fails if the built file drifts from the config.
import { readFile, writeFile } from 'node:fs/promises';
const ROOT = new URL('../', import.meta.url);
export async function build() {
  const config = JSON.parse(await readFile(new URL('config/rideshare-markets.json', ROOT), 'utf8'));
  const areas = JSON.parse(await readFile(new URL('config/market-areas.json', ROOT), 'utf8')).markets;
  const areaRows = Object.fromEntries(Object.entries(areas).map(([id, a]) => [id, { counties: a.counties || [], neighbors: a.intercityNeighbors || [] }]));
  const rows = config.markets.map(m => [m.id, m.name, m.country, m.region || '', +m.center[0].toFixed(4), +m.center[1].toFixed(4), m.radiusMi, (m.pickupStates || []).join(' '), Object.keys(m.platforms || {}).filter(k => m.platforms[k]).join(' '), (m.aliases || []).join('|')]);
  const js = `/* Rideshare service areas. Generated from config/rideshare-markets.json by
   scripts/build-service-areas.mjs; do not edit by hand.
   Row: [id, name, country, state/region, lat, lon, working radius (mi), pickup states (US), apps, aliases]. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.HomeBaseServiceAreas=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  const ROWS=${JSON.stringify(rows)};
  // Known workable areas (county FIPS) and intercity neighbors, from config/market-areas.json.
  const AREAS=${JSON.stringify(areaRows)};
  const MILES=new Set(['US','GB','LR','MM','PR','GU','VI','AS','MP']);
  const MARKETS=ROWS.map(([id,name,country,region,lat,lon,radiusMi,states,apps,aliases])=>({id,name,country,region,center:[lat,lon],radiusMi,radiusKm:radiusMi*1.609344,pickupStates:states?states.split(' '):[],platforms:apps?apps.split(' '):[],aliases:aliases?aliases.split('|'):[],units:MILES.has(country)?'mi':'km'}));
  const BY_ID=new Map(MARKETS.map(m=>[m.id,m]));
  const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  function km(a,b){const r=Math.PI/180,x=(b[1]-a[1])*r*Math.cos((a[0]+b[0])*r/2),y=(b[0]-a[0])*r;return Math.sqrt(x*x+y*y)*6371;}
  // A selected market name ("Baltimore", "Washington, DC", "Baltimore, MD") or id.
  function byName(value){const v=norm(value);if(!v)return null;if(BY_ID.has(v.replace(/ /g,'-')))return BY_ID.get(v.replace(/ /g,'-'));
    return MARKETS.find(m=>m.aliases.some(a=>norm(a)===v))||MARKETS.find(m=>norm(m.name)===v)||MARKETS.find(m=>norm(m.name+' '+m.region)===v||norm(m.name+' '+m.country)===v)||MARKETS.find(m=>v.startsWith(norm(m.name)+' '))||null;}
  function nearest(lat,lon){let best=null,d=Infinity;for(const m of MARKETS){const k=km([lat,lon],m.center);if(k<d){d=k;best=m;}}return best&&d<=best.radiusKm*1.5?best:null;}
  /* The driver's market: their selection when set, else the nearest market to their location. */
  function driverMarket(selection,lat,lon){return byName(selection)||(Number.isFinite(lat)&&Number.isFinite(lon)?nearest(lat,lon):null);}
  const regions=()=>root&&root.HomeBaseRegions||(typeof require==='function'?(()=>{try{return require('./homebase-regions.js')}catch{return null}})():null);
  /* Can a driver in this market take trips at this point? Inside the working radius and, in the
     US, inside one of the market's pickup states; elsewhere, inside the market's country. When
     the region of a point can't be resolved offline, the radius alone decides. */
  function workable(market,point){
    if(!market||!point||!Number.isFinite(point[0])||!Number.isFinite(point[1]))return true;
    if(km(market.center,point)>market.radiusKm)return false;
    const R=regions();if(!R)return true;
    if(market.country==='US'&&market.pickupStates.length){const st=R.stateAt(point[0],point[1]);return !st||market.pickupStates.includes(st);}
    const c=R.countryAt(point[0],point[1]);return !c||c===market.country;
  }
  function label(market){return market?market.name+(market.region?', '+market.region:market.country&&market.country!=='US'?', '+market.country:''):'';}
  return{MARKETS,AREAS,byId:id=>BY_ID.get(id)||null,byName,nearest,driverMarket,workable,label};
});
`;
  return js;
}
if (import.meta.url === `file://${process.argv[1]}`) { await writeFile(new URL('dist/homebase-service-areas.js', ROOT), await build()); console.log('written'); }
