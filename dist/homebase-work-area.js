/* Workable area: the counties a driver actually works inside their rideshare market, plus
   the Intercity preference.

   Uber and Lyft do not publish their preferred-area boundaries, so each driver confirms them
   in onboarding (or Profile): tick counties, or read the Uber Driver "Preferred areas"
   screenshot. Without Intercity, events, heat and route stops stay inside the chosen
   counties. With Intercity on, neighbouring markets the driver can take trips into also count
   (e.g. Baltimore <-> Washington DC and Northern Virginia).

   County shapes come from dist/regions/counties-<STATE>.json (US Census), loaded on demand. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.HomeBaseWorkArea=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  const KEY='homeBaseWorkArea',loaded=new Map(),pending=new Map();
  const areas=()=>root.HomeBaseServiceAreas,regions=()=>root.HomeBaseRegions;
  function decode(entry){const [fips,name,lat,lon,text]=entry,rings=text.split(';').map(r=>{const v=r.split(',').map(Number),out=[];let x=0,y=0;for(let k=0;k<v.length;k+=2){x+=v[k];y+=v[k+1];out.push([x/1000,y/1000]);}return out;});
    let x0=180,y0=90,x1=-180,y1=-90;for(const r of rings)for(const [x,y] of r){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}return{fips,name,center:[lat,lon],rings,box:[x0,y0,x1,y1]};}
  function addState(data){if(data&&data.state&&Array.isArray(data.counties))loaded.set(data.state,data.counties.map(decode));return loaded.get(data?.state)||[];}
  async function loadState(state,fetchImpl=root.fetch){
    if(loaded.has(state))return loaded.get(state);if(pending.has(state))return pending.get(state);
    const task=(async()=>{try{const r=await fetchImpl('regions/counties-'+state+'.json');if(!r.ok)throw Error('county file '+state);return addState(await r.json());}catch(e){pending.delete(state);throw e;}})();
    pending.set(state,task);return task;}
  function inRing(lon,lat,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>lat)!==(b[1]>lat)&&lon<(b[0]-a[0])*(lat-a[1])/((b[1]-a[1])||1e-12)+a[0])inside=!inside;}return inside;}
  // County FIPS at a point, or null if that state's counties are not loaded (or offshore).
  function countyAt(lat,lon){const st=regions()?.stateAt(lat,lon);const list=st&&loaded.get(st);if(!list)return null;
    for(const c of list){const b=c.box;if(lon<b[0]||lon>b[2]||lat<b[1]||lat>b[3])continue;for(const r of c.rings)if(inRing(lon,lat,r))return c.fips;}
    let best=null,bd=.05*.05;// coastal points: nearest ring vertex within ~5 km
    for(const c of list)for(const r of c.rings)for(const [x,y] of r){const d=(x-lon)**2+(y-lat)**2;if(d<bd){bd=d;best=c.fips;}}
    return best;}
  function km(a,b){const r=Math.PI/180,x=(b[1]-a[1])*r*Math.cos((a[0]+b[0])*r/2),y=(b[0]-a[0])*r;return Math.sqrt(x*x+y*y)*6371;}
  // States whose counties matter for a market: its pickup states plus intercity neighbours'.
  function statesFor(market){const A=areas(),out=new Set(market?.pickupStates||[]);if(market?.region&&market.country==='US')out.add(market.region);for(const id of A?.AREAS?.[market?.id]?.neighbors||[]){const n=A.byId(id);for(const s of n?.pickupStates||[])out.add(s);}return [...out];}
  /* Counties offered for a market: those in its states with a centre inside 1.6x the working
     radius (always including the market's known areas). `preset` are the market's known areas (or the home-state counties in radius). */
  async function candidates(market,fetchImpl){if(!market||market.country!=='US')return{counties:[],preset:[]};
    const lists=await Promise.all(statesFor(market).map(s=>loadState(s,fetchImpl).catch(()=>[])));
    const known=areas()?.AREAS?.[market.id]?.counties;
    const counties=lists.flat().filter(c=>known?.includes(c.fips)||km(market.center,c.center)<=market.radiusKm*1.6).map(c=>({fips:c.fips,name:c.name,state:regionOf(c.fips),km:Math.round(km(market.center,c.center))})).sort((a,b)=>a.km-b.km);
    const preset=known&&known.length?known.filter(f=>counties.some(c=>c.fips===f)):counties.filter(c=>c.state===market.region&&c.km<=market.radiusKm).map(c=>c.fips);
    return{counties,preset};}
  const STATE_BY_FIPS={"01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE","11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY","72":"PR"};
  function regionOf(fips){return STATE_BY_FIPS[String(fips).slice(0,2)]||'';}
  // Saved choice: {market, counties:[fips], intercity, source, savedAt}.
  function read(){try{const v=JSON.parse(root.localStorage?.getItem(KEY)||'null');return v&&Array.isArray(v.counties)?v:null;}catch{return null;}}
  function save(value){const v={market:value.market,counties:[...new Set(value.counties||[])],intercity:!!value.intercity,source:value.source||'manual',savedAt:new Date().toISOString()};try{root.localStorage?.setItem(KEY,JSON.stringify(v));}catch{}return v;}
  /* Is this point workable? true/false when the driver's counties decide it, or null when they
     can't yet (no saved area for this market, or county shapes not loaded) so the caller falls
     back to the market rule. Intercity widens to the neighbouring markets' areas. */
  function workable(market,point,area=read()){
    if(!market||!area||area.market!==market.id||!area.counties.length||!point)return null;
    const fips=countyAt(point[0],point[1]);
    if(fips&&area.counties.includes(fips))return true;
    if(area.intercity){const A=areas();if(A?.workable(market,point))return true;for(const id of A?.AREAS?.[market.id]?.neighbors||[]){const n=A.byId(id);if(n&&A.workable(n,point))return true;}return fips?false:null;}
    if(!fips){const st=regions()?.stateAt(point[0],point[1]);return st&&loaded.has(st)?false:null;}
    return false;}
  /* Read area names from the text of an Uber "Preferred areas" screenshot (lines such as
     "Bel Air - Harford County") and match them to candidate counties. */
  function matchAreaText(text,counties){const lines=String(text||'').toLowerCase().split(/[\n,;]+/).map(s=>s.trim()).filter(Boolean),out=new Set();
    for(const c of counties){const base=c.name.toLowerCase().replace(/ (county|city|parish|municipio)$/,'').replace(/[^a-z' ]/g,' ').replace(/\s+/g,' ').trim(),isCity=/ city$/i.test(c.name);
      for(const line of lines){const l=line.replace(/[^a-z' ]/g,' ').replace(/\s+/g,' ');if(!new RegExp('(^|[^a-z])'+base.replace(/'/g,"'?").replace(/ /g,' ?')+'([^a-z]|$)').test(l))continue;
        if(isCity&&/\bcounty\b/.test(l)&&!/\bcity\b/.test(l))continue;if(!isCity&&/\bcity\b/.test(l)&&!/\bcounty\b/.test(l)&&counties.some(o=>o!==c&&o.name.toLowerCase().startsWith(base)&&/ city$/i.test(o.name)))continue;out.add(c.fips);}}
    return [...out];}
  return{KEY,loadState,addState,countyAt,candidates,read,save,workable,matchAreaText,statesFor,regionOf};
});
