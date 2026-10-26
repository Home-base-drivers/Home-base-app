// Builds dist/regions/counties-<STATE>.json (US Census counties via us-atlas 10m), one small file
// per state, loaded on demand for the driver's workable-area setup. Each file:
// {"state":"MD","counties":[[fips,name,lat,lon,"delta-encoded rings"],...]}
//   node scripts/build-counties.cjs
const fs=require('fs'),path=require('path'),ts=require('topojson-simplify'),tc=require('topojson-client');
const FIPS={"01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE","11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY","72":"PR"};
const topo=JSON.parse(fs.readFileSync(require.resolve('us-atlas/counties-10m.json')));
const t=ts.simplify(ts.presimplify(topo),Number(process.argv[2]||0.0002)),fc=tc.feature(t,t.objects.counties),by={};
for(const f of fc.features){const fips=String(f.id).padStart(5,'0'),st=FIPS[fips.slice(0,2)],g=f.geometry;if(!st||!g)continue;
  const ps=g.type==='Polygon'?[g.coordinates]:g.coordinates,rings=[];let sx=0,sy=0,n=0;
  for(const p of ps){const r=p[0];if(r.length<4)continue;let px=0,py=0;const v=[];for(const [x,y] of r){const X=Math.round(x*1000),Y=Math.round(y*1000);v.push(X-px,Y-py);px=X;py=Y;sx+=x;sy+=y;n++;}rings.push(v.join(','));}
  if(!rings.length)continue;const base=f.properties.name,city=Number(fips.slice(2))>=500&&['MD','VA','MO','NV'].includes(st),label=st==='DC'?'District of Columbia':city?(/ city$/i.test(base)?base.replace(/ city$/i,' City'):base+' City'):base+(st==='LA'?' Parish':st==='AK'||/ (County|Borough|Parish|Municipio)$/.test(base)?'':st==='PR'?' Municipio':' County');
  (by[st]=by[st]||[]).push([fips,label,+(sy/n).toFixed(4),+(sx/n).toFixed(4),rings.join(';')]);}
const dir=path.join(__dirname,'../dist/regions');fs.mkdirSync(dir,{recursive:true});let total=0;
for(const [st,list] of Object.entries(by)){list.sort((a,b)=>a[1].localeCompare(b[1]));const s=JSON.stringify({state:st,source:'US Census Bureau counties via us-atlas 10m (simplified)',counties:list});fs.writeFileSync(path.join(dir,'counties-'+st+'.json'),s);total+=s.length;}
console.log('states',Object.keys(by).length,'bytes',total);
