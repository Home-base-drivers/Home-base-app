const validTime=value=>typeof value==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value));
export function normalizeCampusEvents(payload,now=Date.now()){
  const rows=[];
  for(const wrapper of payload?.events||[]){const e=wrapper.event;if(!e||e.private||e.rejected||e.experience==='virtual'||e.status==='cancelled'||e.publish_status!=='published')continue;
    const lat=Number(e.geo?.latitude),lon=Number(e.geo?.longitude);if(e.geo?.latitude==null||e.geo?.longitude==null||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<38||lat>40||lon< -78||lon> -75)continue;
    for(const instance of e.event_instances||[]){const i=instance.event_instance;if(!i||i.all_day||!validTime(i.start)||!validTime(i.end)||Date.parse(i.end)<=Date.parse(i.start)||Date.parse(i.end)<now||Date.parse(i.start)>now+36*3600000)continue;
      rows.push({id:'towson:'+String(i.id),name:String(e.title||'Campus event').slice(0,180),venue:String(e.location_name||'Towson University').slice(0,160),lat,lon,eventStart:new Date(i.start).toISOString(),eventEnd:new Date(i.end).toISOString(),url:typeof e.localist_url==='string'&&e.localist_url.startsWith('https://events.towson.edu/')?e.localist_url:null,source:'Towson University public calendar',attendance:null,eventType:'campus'});}
  }return [...new Map(rows.map(r=>[r.id,r])).values()];
}
export function normalizeWeather(payload){return(payload?.properties?.periods||[]).filter(p=>validTime(p.startTime)&&validTime(p.endTime)).map(p=>({start:p.startTime,end:p.endTime,rainProbability:p.probabilityOfPrecipitation?.value==null?null:Math.max(0,Math.min(100,Number(p.probabilityOfPrecipitation.value))),source:'National Weather Service forecast'}));}
export async function publicRecords(market,now=Date.now(),request=fetch){
  if(!/baltimore/i.test(market.name))return{status:'not_supported',events:[],weather:[]};
  const get=async url=>{const r=await request(url,{signal:AbortSignal.timeout(12000),headers:{Accept:'application/json','User-Agent':'HomeBase public event context (github.com/Home-base-drivers/Home-base-app)'}});if(!r.ok)throw Error('Public source unavailable');return r.json();};
  const [campus,weather]=await Promise.allSettled([
    get('https://events.towson.edu/api/2/events?days=2&pp=100').then(p=>({events:normalizeCampusEvents(p,now),truncated:Number(p.page?.total)>100})),
    get('https://api.weather.gov/points/39.2904,-76.6122').then(p=>{const url=p.properties?.forecastHourly;if(typeof url!=='string'||!url.startsWith('https://api.weather.gov/'))throw Error('Invalid forecast URL');return get(url);}).then(normalizeWeather)
  ]);
  return{status:campus.status==='fulfilled'||weather.status==='fulfilled'?'active':'unavailable',fetchedAt:new Date(now).toISOString(),calendarStatus:campus.status==='fulfilled'?'active':'unavailable',weatherStatus:weather.status==='fulfilled'?'active':'unavailable',calendarTruncated:campus.status==='fulfilled'?campus.value.truncated:false,events:campus.status==='fulfilled'?campus.value.events:[],weather:weather.status==='fulfilled'?weather.value:[]};
}
