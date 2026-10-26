import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function load(){
  const store=new Map();
  const ctx={console,localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))},
    fetch:async p=>{const f=new URL('../dist/'+p,import.meta.url);return{ok:fs.existsSync(f),json:async()=>JSON.parse(fs.readFileSync(f,'utf8'))}}};
  ctx.globalThis=ctx;vm.createContext(ctx);
  for(const f of ['homebase-regions.js','homebase-service-areas.js','homebase-work-area.js'])vm.runInContext(fs.readFileSync(new URL('../dist/'+f,import.meta.url),'utf8'),ctx);
  return ctx;
}
const P={baltimore:[39.2904,-76.6122],annapolis:[38.9784,-76.4922],belAir:[39.5359,-76.3483],elkton:[39.6068,-75.8333],dc:[38.9072,-77.0369],silverSpring:[38.9907,-77.0261],arlington:[38.8816,-77.0910],york:[39.9626,-76.7277],wilmington:[39.7391,-75.5398],lexingtonPark:[38.2668,-76.4535]};

test('Baltimore preferred areas come from the Uber screenshot counties',async()=>{
  const c=load(),W=c.HomeBaseWorkArea,m=c.HomeBaseServiceAreas.byId('baltimore');
  const {counties,preset}=await W.candidates(m);
  assert.ok(counties.length>15);
  assert.deepEqual([...preset].sort(),['24003','24005','24009','24013','24017','24021','24025','24027','24037','24043','24510']);
  assert.ok(counties.some(x=>x.fips==='11001'),'DC is offered for intercity markets');
});

test('without Intercity the driver stays inside their areas',async()=>{
  const c=load(),W=c.HomeBaseWorkArea,m=c.HomeBaseServiceAreas.byId('baltimore');
  const {preset}=await W.candidates(m);await W.loadState('DC',c.fetch);await W.loadState('PA',c.fetch);await W.loadState('DE',c.fetch);
  const area=W.save({market:'baltimore',counties:preset,intercity:false});
  for(const k of ['baltimore','annapolis','belAir','lexingtonPark'])assert.equal(W.workable(m,P[k],area),true,k);
  for(const k of ['elkton','dc','silverSpring','arlington','york','wilmington'])assert.equal(W.workable(m,P[k],area),false,k);
});

test('Intercity adds Washington DC and Northern Virginia, never PA or DE',async()=>{
  const c=load(),W=c.HomeBaseWorkArea,m=c.HomeBaseServiceAreas.byId('baltimore');
  const {preset}=await W.candidates(m);await W.loadState('PA',c.fetch);await W.loadState('DE',c.fetch);
  const area={market:'baltimore',counties:preset,intercity:true};
  for(const k of ['dc','silverSpring','arlington','baltimore'])assert.equal(W.workable(m,P[k],area),true,k);
  for(const k of ['york','wilmington'])assert.equal(W.workable(m,P[k],area),false,k);
});

test('no saved area for this market falls back to the market rule',()=>{
  const c=load(),W=c.HomeBaseWorkArea,m=c.HomeBaseServiceAreas.byId('baltimore');
  assert.equal(W.workable(m,P.dc,null),null);
  assert.equal(W.workable(m,P.dc,{market:'miami',counties:['12086'],intercity:false}),null);
});

test('screenshot area names match counties, keeping Baltimore City and County apart',async()=>{
  const c=load(),W=c.HomeBaseWorkArea,m=c.HomeBaseServiceAreas.byId('baltimore');
  const {counties}=await W.candidates(m);
  const text='Baltimore\nBel Air - Harford County\nHoward\nAnne Arundel\nCalvert\nCharles\nSt. Mary\'s\nWashington\nFrederick\nCarroll';
  const got=W.matchAreaText(text,counties).sort();
  for(const f of ['24510','24005','24025','24027','24003','24009','24017','24037','24043','24021','24013'])assert.ok(got.includes(f),f);
  assert.ok(!got.includes('11001')&&!got.includes('24031')&&!got.includes('24033'),'no DC, Montgomery or Prince George\'s');
  assert.deepEqual([...W.matchAreaText('Baltimore County',counties)],['24005']);
});
