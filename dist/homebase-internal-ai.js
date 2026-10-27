// Home Base built-in AI: the free assistant. It runs on the phone, costs nothing
// per use and works without ChatGPT. It answers from the driver's own records and
// the app's live data, reads Uber/Empower/Lyft screenshots into trip rows, and
// says plainly when a question needs Home Base AI Plus instead of guessing.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.HomeBaseInternalAI=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const TZ='America/New_York';
 const MONTHS=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
 const DAYS=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
 const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
 const r2=n=>Math.round(n*100)/100;
 const money=n=>(n<0?'-':'')+'$'+Math.abs(n).toFixed(2);
 const plural=(n,w)=>n+' '+w+(n===1?'':'s');

 // ---------- dates ----------
 function dayKey(date,tz=TZ){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(date));
  const g=t=>p.find(x=>x.type===t).value;return g('year')+'-'+g('month')+'-'+g('day');
 }
 function shiftDay(key,days){const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
 function weekday(key){return new Date(key+'T12:00:00Z').getUTCDay();}
 function prettyDay(key){const d=new Date(key+'T12:00:00Z');return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});}
 // Local wall-clock time in the market's time zone -> ISO instant.
 function zonedIso(key,hh,mm,tz=TZ){
  let guess=Date.UTC(+key.slice(0,4),+key.slice(5,7)-1,+key.slice(8,10),hh,mm);
  for(let i=0;i<2;i++){
   const p=new Intl.DateTimeFormat('en-US',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(guess));
   const g=t=>+p.find(x=>x.type===t).value;
   const shown=Date.UTC(g('year'),g('month')-1,g('day'),g('hour')%24,g('minute'));
   guess+=Date.UTC(+key.slice(0,4),+key.slice(5,7)-1,+key.slice(8,10),hh,mm)-shown;
  }
  return new Date(guess).toISOString();
 }
 // Which days a question is about. Returns {from,to,label} or null.
 function periodFrom(text,now=new Date(),tz=TZ){
  const t=text.toLowerCase(),today=dayKey(now,tz);
  const iso=t.match(/\b(20\d\d)-(\d\d)-(\d\d)\b/);if(iso){const k=iso[0];return{from:k,to:k,label:prettyDay(k)};}
  const md=t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/)||null;
  const slash=t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if(md||slash){const m=md?MONTHS.indexOf(md[1])+1:+slash[1],d=md?+md[2]:+slash[2];if(m>=1&&m<=12&&d>=1&&d<=31){let y=+today.slice(0,4);let k=y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');if(k>today)k=(y-1)+k.slice(4);return{from:k,to:k,label:prettyDay(k)};}}
  if(/\byesterday\b|\bayer\b/.test(t)){const k=shiftDay(today,-1);return{from:k,to:k,label:'yesterday'};}
  if(/\blast week\b|semana pasada/.test(t)){const start=shiftDay(today,-((weekday(today)+6)%7)-7);return{from:start,to:shiftDay(start,6),label:'last week'};}
  if(/\b(this )?week\b|\bweekly\b|\bsemana\b/.test(t)){const start=shiftDay(today,-((weekday(today)+6)%7));return{from:start,to:today,label:'this week'};}
  if(/\blast month\b/.test(t)){const d=new Date(today.slice(0,7)+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);const from=d.toISOString().slice(0,10);return{from,to:shiftDay(today.slice(0,7)+'-01',-1),label:'last month'};}
  if(/\b(this )?month\b|\bmes\b/.test(t))return{from:today.slice(0,7)+'-01',to:today,label:'this month'};
  if(/\b(all time|ever|total|overall|so far)\b/.test(t)&&!/\btoday\b/.test(t))return{from:'0000-01-01',to:today,label:'all recorded history'};
  const wd=DAYS.findIndex(d=>new RegExp('\\b'+d+'\\b').test(t));
  if(wd>=0){let back=(weekday(today)-wd+7)%7;if(/\blast\b/.test(t)&&back===0)back=7;const k=shiftDay(today,-back);return{from:k,to:k,label:prettyDay(k)};}
  if(/\btoday\b|\btonight\b|\bhoy\b|\bso far\b/.test(t))return{from:today,to:today,label:'today'};
  return null;
 }

 // ---------- the driver's numbers ----------
 function recordDayOf(r,tz=TZ){if(r.timePrecision&&r.startedAt&&Number.isFinite(Date.parse(r.startedAt)))return dayKey(r.startedAt,tz);return /^\d{4}-\d{2}-\d{2}$/.test(r.date||'')?r.date:null;}
 function summarize(records,{from,to},tz=TZ){
  const out={gross:0,payout:0,trips:0,tripsKnown:true,onlineHours:0,onlineGross:0,activeHours:0,miles:0,rows:0,days:new Set(),platforms:{}};
  for(const r of records||[]){
   const day=recordDayOf(r,tz);if(!day||day<from||day>to||!Number.isFinite(r.earnings))continue;
   out.rows++;out.days.add(day);
   if(r.payType==='payout'){out.payout+=r.earnings;continue;}
   const p=out.platforms[r.platform]||(out.platforms[r.platform]={gross:0,trips:0,onlineHours:0,onlineGross:0,activeHours:0,activeGross:0,miles:0});
   out.gross+=r.earnings;p.gross+=r.earnings;
   if(Number.isFinite(r.trips)){out.trips+=r.trips;p.trips+=r.trips;}else out.tripsKnown=false;
   if(r.hoursType==='online'&&r.hours>0){out.onlineHours+=r.hours;out.onlineGross+=r.earnings;p.onlineHours+=r.hours;p.onlineGross+=r.earnings;}
   if(r.hoursType==='active'&&r.hours>0){out.activeHours+=r.hours;p.activeHours+=r.hours;p.activeGross+=r.earnings;}
   if(Number.isFinite(r.miles)){out.miles+=r.miles;p.miles+=r.miles;}
  }
  return out;
 }
 // Unpaid minutes per trip (driving to pickups, waiting) learned from days that
 // have both Uber online time and the trip list's rider time.
 function overheadMinutes(records,tripRows,tz=TZ){
  const rider={};for(const t of tripRows||[]){if(!t?.request_time||!(num(t.trip_time)>0))continue;const k=t.platform+'|'+dayKey(t.request_time,tz);(rider[k]||(rider[k]={min:0,n:0})).min+=num(t.trip_time);rider[k].n++;}
  let idle=0,n=0;
  for(const r of records||[]){if(r.hoursType!=='online'||!(r.hours>0)||!(r.trips>0))continue;const k=r.platform+'|'+recordDayOf(r,tz),x=rider[k];if(!x||x.n<Math.max(3,r.trips*.8))continue;const gap=r.hours*60-x.min;if(gap>0){idle+=gap;n+=r.trips;}}
  return n>=10?idle/n:null;
 }
 function goalRate(ctx){const g=ctx.goalPace||{},goal=num(g.goal),hours=num(g.gh)||3;return goal>0?{goal,hours,rate:goal/hours}:null;}

 // ---------- screenshot reading ----------
 const TIME_RE=/\b(1[0-2]|0?[1-9])[:.]?([0-5]\d)\s*([AaPp])\.?\s*[Mm]\b\.?/;
 // OCR often reads the colon as "1", "l" or "i" ("9112 AM" for 9:12 AM).
 const TIME_COLON_MISREAD=/\b([1-9])[1lIi|]([0-5]\d)\s*([AaPp])\.?\s*[Mm]\b\.?/;
 const TIME={test:l=>TIME_RE.test(l)||TIME_COLON_MISREAD.test(l),match:l=>l.match(TIME_RE)||l.match(TIME_COLON_MISREAD),strip:l=>l.replace(TIME_RE,' ').replace(TIME_COLON_MISREAD,' ')};
 const MONEY=/(-?)\$\s?(\d{1,4}(?:,\d{3})*\.\d{2})/g;
 const MILES=/(\d{1,3}(?:[.,]\d{1,2})?)\s*(mi|miles|km)\b/i;
 function durationMinutes(line){
  let m=line.match(/(\d{1,2})\s*h(?:r|rs|our|ours)?\s*(\d{1,2})\s*m(?:in)?/i);if(m)return +m[1]*60+ +m[2];
  m=line.match(/(\d{1,3})\s*min(?:s|utes)?\.?\s*(?:(\d{1,2})\s*s(?:ec|ecs|econds)?)?/i);if(m)return +m[1]+(m[2]?+m[2]/60:0);
  const plain=TIME.strip(line);m=plain.match(/\b(\d{1,2}):([0-5]\d)\b/);if(m&&!/\$/.test(plain.slice(Math.max(0,m.index-1),m.index+1)))return +m[1]+ +m[2]/60;
  return null;
 }
 function detectPlatform(text,fallback='Uber'){if(/empower/i.test(text))return'Empower';if(/\blyft\b/i.test(text))return'Lyft';if(/\buber|uberx|comfort|uber\s?black|uber\s?xl/i.test(text))return'Uber';return fallback;}
 function detectDate(text,now=new Date(),tz=TZ){
  const m=text.match(/\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i)||text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+20\d\d\b/i);
  if(!m)return null;const today=dayKey(now,tz),y=+today.slice(0,4);let k=y+'-'+String(MONTHS.indexOf(m[1].toLowerCase().slice(0,3))+1).padStart(2,'0')+'-'+String(+m[2]).padStart(2,'0');if(k>today)k=(y-1)+k.slice(4);return k;
 }
 // Turn OCR text into trips. A row starts at a ride-type label ("UberX $7.73")
 // or at a clock time; pay, duration and distance in that row belong to it.
 // Nothing is guessed: a value the screenshot does not show stays empty and the
 // row is flagged for the driver to fill in or leave blank.
 const PRODUCT=/\b(uber ?x ?l?|uberx|uberxl|comfort|uber ?black|black suv|uber ?green|uber ?pet|share|connect|reserve|courier|uber ?eats|lyft|standard|priority|wait & save|xl|empower)\b/i;
 const EXTRA=/\b(tip|tips|promotion|promotions|bonus|quest|boost|incentive|adjustment)\b/i;
 function parseScreenshotText(text,{date=null,platform=null,now=new Date(),tz=TZ}={}){
  const lines=String(text||'').replace(/\r/g,'').split('\n').map(l=>l.replace(/[|•·]/g,' ').replace(/\s+/g,' ').trim()).filter(Boolean);
  const plat=platform||detectPlatform(text),day=date||detectDate(text,now,tz);
  const pre=[],blocks=[];let cur=null;
  for(const line of lines){
   const hasTime=TIME.test(line),hasProduct=PRODUCT.test(line)&&!/earnings|total|week|today/i.test(line);
   if(hasProduct&&!(cur&&!cur.time&&!cur.lines.length))cur={time:null,lines:[]},blocks.push(cur);
   else if(hasTime&&(!cur||cur.time))cur={time:null,lines:[]},blocks.push(cur);
   if(!cur){pre.push(line);continue;}
   cur.lines.push(line);if(hasTime&&!cur.time)cur.time=TIME.match(line);
  }
  // Rows without a time: before the first trip they are header; after, details.
  const timed=[];for(const b of blocks){if(b.time)timed.push(b);else if(timed.length)timed.at(-1).lines.push(...b.lines);else pre.push(...b.lines);}
  const moneyIn=l=>[...l.matchAll(MONEY)].map(m=>(m[1]?-1:1)*Number(m[2].replace(/,/g,'')));
  let dayTotal=null;
  pre.forEach((l,i)=>{const m=moneyIn(l);if(!m.length||dayTotal!==null||EXTRA.test(l))return;const near=[pre[i-1],l,pre[i+1]].filter(Boolean).join(' ');if(/(total|earnings|today|this day|gross)/i.test(near)||/^\$?\s?[\d,]+\.\d\d$/.test(l.replace(/\s/g,'')))dayTotal=Math.max(...m);});
  const extras=pre.filter(l=>EXTRA.test(l)&&moneyIn(l).length).map(l=>({label:l.replace(MONEY,'').trim().slice(0,40)||'Extra',amount:moneyIn(l)[0]}));
  const trips=timed.map(b=>{
   let hh=+b.time[1]%12;if(/p/i.test(b.time[3]))hh+=12;
   const t={hh,mm:+b.time[2],time:(hh%12||12)+':'+b.time[2]+' '+(hh>=12?'PM':'AM'),fare:null,minutes:null,miles:null,canceled:false};
   for(const line of b.lines){
    const rest=TIME.strip(line);if(/cancel/i.test(line))t.canceled=true;
    const m=moneyIn(rest);
    if(m.length&&EXTRA.test(line)&&!PRODUCT.test(line))extras.push({label:line.replace(MONEY,'').trim().slice(0,40)||'Extra',amount:m[0],time:t.time});
    else if(m.length&&t.fare===null)t.fare=m[0];
    const mi=rest.match(MILES);if(mi&&t.miles===null){let v=Number(mi[1].replace(',','.'));if(/km/i.test(mi[2]))v=v*0.621371;t.miles=r2(v);}
    const d=durationMinutes(rest);if(d!==null&&t.minutes===null&&d>0&&d<240)t.minutes=r2(d);
   }
   return t;
  });
  const seen={};
  const rows=trips.map(t=>{
   const hhmm=String(t.hh).padStart(2,'0')+String(t.mm).padStart(2,'0');seen[hhmm]=(seen[hhmm]||0)+1;
   const flags=[];if(t.fare===null)flags.push('pay not found');if(t.minutes===null)flags.push('time with rider not found');if(t.miles===null)flags.push('miles not found');if(t.canceled)flags.push('canceled');
   // A misread digit shows up as an impossible speed; ask the driver to check it.
   if(t.minutes>0&&t.miles>0){const mph=t.miles/(t.minutes/60);if(mph>75||(mph<2&&t.miles>1))flags.push('check minutes or miles');}
   return{key:hhmm+(seen[hhmm]>1?'-'+seen[hhmm]:''),time:t.time,hh:t.hh,mm:t.mm,fare:t.fare,minutes:t.minutes,miles:t.miles,canceled:t.canceled,flags,include:!t.canceled||t.fare>0};
  });
  const sum=rows.filter(r=>r.include&&r.fare>0).reduce((s,r)=>s+r.fare,0)+extras.reduce((s,e)=>s+(e.amount>0?e.amount:0),0);
  return{platform:plat,date:day,trips:rows,extras,dayTotal,tripSum:r2(sum),difference:dayTotal===null?null:r2(dayTotal-sum)};
 }
 // Several screenshots of one day (the list scrolls) become one review. A
 // screenshot without a visible date takes the date of the one before it.
 function combineParsed(list){
  const groups=[];let lastDate=null;
  for(const p of list){
   const date=p.date||lastDate;lastDate=date;
   let g=groups.find(x=>x.platform===p.platform&&x.date===date);
   if(!g){g={...p,date,trips:[],extras:[]};groups.push(g);}
   if(g.dayTotal===null&&p.dayTotal!==null)g.dayTotal=p.dayTotal;
   for(const t of p.trips){const same=g.trips.find(x=>x.hh===t.hh&&x.mm===t.mm&&x.fare===t.fare);if(!same)g.trips.push({...t});}
   for(const e of p.extras)if(!g.extras.some(x=>x.amount===e.amount&&x.label===e.label))g.extras.push(e);
  }
  for(const g of groups){g.trips.sort((a,b)=>a.hh*60+a.mm-(b.hh*60+b.mm));const seen={};for(const t of g.trips){const k=String(t.hh).padStart(2,'0')+String(t.mm).padStart(2,'0');seen[k]=(seen[k]||0)+1;t.key=k+(seen[k]>1?'-'+seen[k]:'');}
   const sum=g.trips.filter(r=>r.include&&r.fare>0).reduce((s,r)=>s+r.fare,0)+g.extras.reduce((s,e)=>s+(e.amount>0?e.amount:0),0);g.tripSum=r2(sum);g.difference=g.dayTotal===null?null:r2(g.dayTotal-sum);}
  return groups;
 }
 // Parsed screenshot -> the app's trip rows and earnings ledger rows. Stable IDs
 // mean reading the same screenshot twice updates rows instead of duplicating.
 function toRecords(parsed,{ledger=[],tz=TZ,source='Built-in screenshot reader'}={}){
  if(!parsed?.date)throw Error('Choose the date these trips happened.');
  const p=parsed.platform||'Uber',slug=p.toLowerCase().replace(/[^a-z0-9]+/g,''),ymd=parsed.date.replace(/-/g,'');
  // A whole-day summary already in the ledger for this app and date means the
  // trips are detail only; adding them to earnings would count the day twice.
  const daySummary=(ledger||[]).some(r=>r.platform===p&&!r.timePrecision&&recordDayOf(r,tz)===parsed.date&&(r.trips>1||r.hoursType==='online'));
  const tripRows=[],ledgerRows=[];
  for(const t of parsed.trips){
   if(!t.include)continue;const id='screenshot-'+slug+'-'+ymd+'-'+t.key,at=zonedIso(parsed.date,t.hh,t.mm,tz);
   if(t.canceled){if(t.fare>0&&!daySummary)ledgerRows.push({id,platform:p,date:parsed.date,startedAt:at,timePrecision:true,earnings:t.fare,payType:'gross',hours:null,hoursType:'unknown',miles:null,trips:0,filename:source+': cancellation fee',source:'csv'});continue;}
   if(!(t.fare>=0))continue;
   tripRows.push({record_id:id,platform:p,source:'screenshot',status:'completed',market:'Baltimore',request_time:at,fare:t.fare,trip_time:t.minutes,trip_distance:t.miles,completeness:t.flags.length?'partial':'complete',confidence:t.flags.length?.6:.85,time_basis:'time shown in the app list',source_note:source});
   if(!daySummary)ledgerRows.push({id,platform:p,date:parsed.date,startedAt:at,timePrecision:true,earnings:t.fare,payType:'gross',hours:t.minutes===null?null:r2(t.minutes/60*10000)/10000,hoursType:t.minutes===null?'unknown':'active',miles:t.miles,trips:1,filename:source,source:'csv'});
  }
  return{tripRows,ledgerRows,daySummary};
 }
 function mergeById(list,rows,key){const m=new Map((list||[]).map(r=>[String(r?.[key]),r]));for(const r of rows)m.set(String(r[key]),{...(m.get(String(r[key]))||{}),...r});return[...m.values()];}
 function tripsCsv(rows,tz=TZ){
  const head=['date','time','platform','pay','minutes_with_rider','miles','pay_per_mile','pay_per_hour','record_id','source'];
  const q=v=>{const s=v===null||v===undefined?'':String(v);return/[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
  const body=(rows||[]).filter(r=>r?.request_time).sort((a,b)=>a.request_time.localeCompare(b.request_time)).map(r=>{const d=new Date(r.request_time),fare=num(r.fare),min=num(r.trip_time),mi=num(r.trip_distance);
   return[dayKey(d,tz),d.toLocaleTimeString('en-US',{timeZone:tz,hour:'numeric',minute:'2-digit'}),r.platform,fare,min,mi,fare!==null&&mi>0?r2(fare/mi):'',fare!==null&&min>0?r2(fare/min*60):'',r.record_id,r.source].map(q).join(',');});
  return[head.join(','),...body].join('\n')+'\n';
 }

 // ---------- answering questions ----------
 const INTENTS=[
  ['help',/\b(what can you do|help|commands|how do i use|que puedes)\b/i],
  ['briefing',/\b(brief(ing)? me|briefing|daily brief|start (my )?(shift|day)|good morning|plan (my|the) (day|shift|night)|what'?s the plan|game plan|plan for today)\b/i],
  ['week',/\b(how was my week|how'?s my week|weekly|week(ly)? (report|summary|recap)|recap|this week vs|compared to last week)\b/i],
  ['stop',/\b(call it|keep driving|stay out|head home|go home|quit for|stop (driving|for (the )?(day|night))|worth staying|done for (the )?(day|night))\b/i],
  ['offer',/\$\s?\d+(?:\.\d+)?.*\b\d+(?:\.\d+)?\s*(mi|mile|miles|millas)\b|\b\d+(?:\.\d+)?\s*(mi|mile|miles|millas)\b.*\$\s?\d+/i],
  ['weather',/\b(weather|forecast|rain(?:ing|y)?|snow(?:ing)?|storms?|thunder\w*|temperature|temp|degrees|cold|hot(?!\s?spots?)|umbrella|icy|fog(?:gy)?|windy|clima|lluvia|llover)\b/i],
  ['csv',/\b(export|download|csv|spreadsheet)\b/i],
  ['screenshot',/\b(screenshot|screen shot|photo|picture|captura)\b/i],
  ['compare',/\b(empower|lyft)\b.*\b(vs|versus|or|compare|better)\b|\b(uber|lyft)\b.*\b(vs|versus)\b|\bwhich app\b/i],
  ['goal',/\b(goal|on pace|pace|on track|meta|how am i doing|how'?s my day)\b/i],
  ['costs',/\b(gas|fuel|cost|costs|expense|expenses|keep|net|profit|gasolina)\b/i],
  ['best',/\b(best|worst|most profitable)\b.*\b(hour|hours|time|times|day|days|trip|trips)\b/i],
  ['where',/\b(where|busiest|hot ?spot|heat|surge|demand|reposition|go next|head|d[oó]nde)\b/i],
  ['events',/\b(event|events|game|concert|stadium|arena|airport|bwi|flights?)\b/i],
  ['earnings',/\b(earn|earned|earnings|made|make|money|income|gross|trips?|rides?|miles|hours|ganancias|gan[eé])\b/i]
 ];
 function intentOf(text){for(const [name,re] of INTENTS)if(re.test(text))return name;return null;}
 function lineFor(sum,label){
  if(!sum.rows)return'No earnings recorded for '+label+'. Add trips from screenshots or a CSV in Earnings.';
  const parts=[money(sum.gross)+' gross '+(label==='today'?'today':'for '+label)];
  if(sum.trips>0)parts.push(plural(sum.trips,'trip')+(sum.tripsKnown?'':' or more'));
  if(sum.onlineHours>0)parts.push(r2(sum.onlineHours)+' online hours, '+money(sum.onlineGross/sum.onlineHours)+' per online hour');
  if(sum.miles>0)parts.push(r2(sum.miles)+' miles with riders');
  let s=parts.join(' · ')+'.';
  const plats=Object.entries(sum.platforms).filter(([,p])=>p.gross>0);
  if(plats.length>1)s+=' '+plats.sort((a,b)=>b[1].gross-a[1].gross).map(([n,p])=>n+' '+money(p.gross)+(p.trips?' ('+plural(p.trips,'trip')+')':'')).join(', ')+'.';
  if(sum.payout)s+=' Payouts in this period: '+money(sum.payout)+' (kept separate from gross).';
  return s;
 }
// Weather from the app's own feeds (Open-Meteo now + hourly, NWS alerts).
 const WMO={0:'clear',1:'mostly clear',2:'partly cloudy',3:'overcast',45:'fog',48:'freezing fog',51:'light drizzle',53:'drizzle',55:'heavy drizzle',56:'freezing drizzle',57:'freezing drizzle',61:'light rain',63:'rain',65:'heavy rain',66:'freezing rain',67:'freezing rain',71:'light snow',73:'snow',75:'heavy snow',77:'snow grains',80:'rain showers',81:'rain showers',82:'heavy showers',85:'snow showers',86:'heavy snow showers',95:'thunderstorms',96:'thunderstorms with hail',99:'thunderstorms with hail'};
 function weatherLines(w,now,tz,full){
  const lines=[],t=+new Date(now);if(!w||(!w.available&&!(w.hourly||[]).length&&!(w.alerts||[]).length))return full?['Weather is still loading on this phone. The temperature shows on the Home screen once it arrives; GPS or the selected market sets the location.']:[];
  const hr=h=>new Date(h).toLocaleTimeString('en-US',{timeZone:tz,hour:'numeric'});
  if(w.available&&w.temp!=null)lines.push((full?'**Now:** ':'')+String(w.temp).replace(/°?$/,'°')+(w.unit?String(w.unit).replace('°',''):'')+(WMO[Number(w.code)]?', '+WMO[Number(w.code)]:'')+'.');
  const next=(w.hourly||[]).filter(r=>r.time>=t-1800000&&r.time<=t+12*3600000);
  if(next.length){const max=next.reduce((b,r)=>r.probability>b.probability?r:b,next[0]),wet=next.find(r=>r.probability>=50),snow=next.some(r=>r.snowfallCm>0);
   const temps=next.map(r=>r.temperatureF).filter(Number.isFinite);
   const c=/C/.test(String(w.unit||'')),deg=f=>Math.round(c?(f-32)*5/9:f);
   if(full&&temps.length)lines.push('**Next 12 hours:** '+deg(Math.min(...temps))+'–'+deg(Math.max(...temps))+(c?'°C':'°F')+'.');
   lines.push(wet?(snow?'Snow':'Rain')+' likely from about '+hr(wet.time)+' (up to '+Math.round(max.probability)+'%). Rain usually lifts ride requests near bars, transit and events; leave extra following distance.':'Rain chance stays low, '+Math.round(max.probability||0)+'% at most, so weather should not change demand much.');}
  const alerts=(w.alerts||[]).filter(a=>Date.parse(a.ends)>t);
  if(alerts.length)lines.push('**NWS:** '+alerts.slice(0,2).map(a=>a.event+(Date.parse(a.onset)<=t?' until '+hr(a.ends):' from '+hr(a.onset))).join('; ')+'.'+(alerts.some(a=>a.safety)?' Follow official guidance.':''));
  if(full&&!lines.length)lines.push('Weather is still loading on this phone. Try again in a moment.');
  return lines;
 }
 function answer(text,ctx={}){
  const raw=String(text||'').trim(),now=ctx.now?new Date(ctx.now):new Date(),tz=ctx.tz||TZ,records=ctx.records||[],tripRows=ctx.tripRows||[];
  const intent=intentOf(raw);
  const result=(answerText,extra={})=>({handled:true,intent,answer:answerText,source:'built-in',...extra});
  if(!raw)return{handled:false,intent:null,answer:''};
  const today=dayKey(now,tz),hourNow=+new Date(now).toLocaleString('en-US',{timeZone:tz,hour:'numeric',hourCycle:'h23'});
  const fmtHour=h=>new Date(Date.UTC(2026,0,1,h)).toLocaleTimeString('en-US',{hour:'numeric',timeZone:'UTC'});
  // Average pay per trip by start hour on this weekday (falls back to all days).
  const hourProfile=(weekdayOnly)=>{const by={};for(const t of tripRows){if(!t?.request_time||!(num(t.fare)>=0))continue;const d=new Date(t.request_time),k=dayKey(d,tz);if(weekdayOnly&&weekday(k)!==weekday(today))continue;const h=+d.toLocaleString('en-US',{timeZone:tz,hour:'numeric',hourCycle:'h23'});(by[h]||(by[h]={pay:0,n:0})).pay+=num(t.fare);by[h].n++;}return Object.entries(by).filter(([,b])=>b.n>=2).map(([h,b])=>({h:+h,avg:b.pay/b.n,n:b.n}));};
  const liveZones=()=>(ctx.live?.zones||[]).filter(z=>Number.isFinite(z.score)).sort((a,b)=>b.score-a.score).slice(0,3).map(z=>z.name);
  const soonEvents=(hours=12)=>(ctx.live?.events||[]).filter(e=>{const t=Date.parse(e.start);return Number.isFinite(t)&&t>=+now-3*3600000&&t<=+now+hours*3600000;}).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
  const clock=iso=>new Date(iso).toLocaleTimeString('en-US',{timeZone:tz,hour:'numeric',minute:'2-digit'});
  if(intent==='briefing'){
   const g=goalRate(ctx),s=summarize(records,{from:today,to:today},tz),lines=[];
   lines.push('**Today ('+prettyDay(today)+')**'+(s.rows?': '+money(s.gross)+' so far'+(s.trips?', '+plural(s.trips,'trip'):'')+'.':': no trips recorded yet.'));
   if(g)lines.push('**Goal:** '+money(g.goal)+' every '+g.hours+' hours, so aim for '+money(g.rate)+' per working hour.');
   const prof=hourProfile(true).length?hourProfile(true):hourProfile(false),ahead=prof.filter(x=>x.h>=hourNow).sort((a,b)=>b.avg-a.avg).slice(0,3);
   if(ahead.length)lines.push('**Your best hours still ahead** ('+(hourProfile(true).length?DAYS[weekday(today)][0].toUpperCase()+DAYS[weekday(today)].slice(1)+'s':'all days')+'): '+ahead.map(x=>fmtHour(x.h)+' ('+money(x.avg)+'/trip)').join(', ')+'.');
   const wx=weatherLines(ctx.weather,now,tz,false);if(wx.length)lines.push('**Weather:** '+wx.join(' '));
   const z=liveZones();if(z.length)lines.push('**Busiest areas right now:** '+z.join(', ')+'.');
   const ev=soonEvents();if(ev.length)lines.push('**Events next 12 hours:** '+ev.slice(0,4).map(e=>e.name+' '+clock(e.start)).join('; ')+'.');
   const over=overheadMinutes(records,tripRows,tz);if(over&&g)lines.push('**Offer rule for today:** with about '+Math.round(over)+' unpaid minutes per trip, a trip needs roughly '+money(g.rate*(over+12)/60)+' for a 12-minute ride to hold your pace.');
   lines.push('Ask me "$X for Y miles, Z minutes" for any offer, or attach Uber screenshots to log trips.');
   return result(lines.join('\n'));
  }
  if(intent==='week'){
   const start=shiftDay(today,-((weekday(today)+6)%7)),days=(Date.parse(today)-Date.parse(start))/86400000;
   const cur=summarize(records,{from:start,to:today},tz),prev=summarize(records,{from:shiftDay(start,-7),to:shiftDay(start,-7+days)},tz);
   if(!cur.rows)return result('No earnings recorded this week yet. Add trips from screenshots in Earnings.');
   const lines=['**This week so far ('+prettyDay(start)+' – '+prettyDay(today)+')**',lineFor(cur,'this week')];
   if(prev.rows){const d=cur.gross-prev.gross;lines.push('Same days last week: '+money(prev.gross)+' → '+(d>=0?'up ':'down ')+money(Math.abs(d))+'.');}
   const byDay={};for(const r of records){const k=recordDayOf(r,tz);if(!k||k<start||k>today||r.payType!=='gross'||!Number.isFinite(r.earnings))continue;byDay[k]=(byDay[k]||0)+r.earnings;}
   const best=Object.entries(byDay).sort((a,b)=>b[1]-a[1])[0];if(best)lines.push('Best day: '+prettyDay(best[0])+' with '+money(best[1])+'.');
   const g=goalRate(ctx);if(g&&cur.onlineHours>0){const rate=cur.onlineGross/cur.onlineHours;lines.push('Pace: '+money(rate)+' per online hour vs your '+money(g.rate)+' goal'+(rate>=g.rate?' ✓':'')+'.');}
   const c=ctx.carInputs||{};if(num(c.price)>0&&num(c.mpg)>0&&cur.miles>0)lines.push('Gas on rider miles: about '+money(cur.miles*num(c.price)/num(c.mpg))+' ('+Math.round(cur.miles*num(c.price)/num(c.mpg)/cur.gross*100)+'% of gross).');
   return result(lines.join('\n'));
  }
  if(intent==='stop'){
   const g=goalRate(ctx),s=summarize(records,{from:today,to:today},tz),lines=[];
   const prof=hourProfile(true).length?hourProfile(true):hourProfile(false),next=prof.filter(x=>x.h>hourNow&&x.h<=hourNow+3).sort((a,b)=>b.avg-a.avg)[0],typical=prof.length?prof.reduce((a,x)=>a+x.avg*x.n,0)/prof.reduce((a,x)=>a+x.n,0):null;
   const ev=soonEvents(3);
   let stay=0;if(next&&typical&&next.avg>=typical)stay++;if(ev.length)stay++;if(liveZones().length)stay+=0;
   lines.push(stay>0?'**Worth staying a bit longer.**':'**Reasonable time to wrap up.**');
   if(next&&typical)lines.push('Your '+fmtHour(next.h)+' hour averages '+money(next.avg)+' per trip vs your usual '+money(typical)+'.');
   if(ev.length)lines.push('Coming up within 3 hours: '+ev.slice(0,3).map(e=>e.name+' '+clock(e.start)).join('; ')+'.');
   if(g){const hours=num(ctx.live?.shiftHours)||(s.onlineHours||null);if(hours>0){const rate=s.gross/hours;lines.push('Today: '+money(s.gross)+' at '+money(rate)+'/hr vs '+money(g.rate)+' goal'+(rate>=g.rate?' ✓':'')+'.');}}
   const max=num(ctx.live?.driverPreferences?.maxShiftHours),sh=num(ctx.live?.shiftHours);if(max&&sh&&sh>=max-0.5)lines.push('You are near your '+max+'-hour shift limit. Safety first.');
   return result(lines.join('\n'));
  }
  if(intent==='weather')return result(weatherLines(ctx.weather,now,tz,true).join('\n'));
  if(intent==='help')return result('Built-in Home Base AI (free) can:\n- **"Brief me"**: today\'s plan, best hours ahead, busy areas, events\n- **"How was my week?"**: totals, best day, pace, gas share\n- **"Should I keep driving?"**: your next hours vs your usual\n- **"What\'s the weather?"**: now, rain in the next 12 hours, NWS alerts\n- Total your earnings for today, a day, this week or this month\n- Check your pace against your goal\n- Judge a trip offer: say the pay and miles, like "$14 for 9 miles, 20 minutes"\n- Compare Uber and Empower from your own records\n- Show your best hours and days\n- Read Uber, Empower or Lyft screenshots into trips (attach a photo)\n- Export your trips as a CSV\n- Point to the busiest areas and upcoming events on the map\n\nOpen-ended planning and conversation use Home Base AI Plus.');
  if(intent==='offer'){
   const pay=num(raw.match(/\$\s?(\d+(?:\.\d+)?)/)?.[1]),mi=num(raw.match(/(\d+(?:\.\d+)?)\s*(?:mi|mile|miles|millas)\b/i)?.[1]),mins=num(raw.match(/(\d+(?:\.\d+)?)\s*(?:min|mins|minutes|minutos)\b/i)?.[1]);
   if(!(pay>0)||!(mi>0))return result('Tell me the pay and the miles, for example "$14 for 9 miles, 20 minutes".');
   const g=goalRate(ctx),over=overheadMinutes(records,tripRows,tz);
   let s=money(pay)+' for '+mi+' miles is '+money(pay/mi)+' per mile.';
   if(mins>0){const hourly=pay/((mins+(over||0))/60);s+=' '+(over?'With your usual '+Math.round(over)+' unpaid minutes per trip, that is ':'That is ')+money(hourly)+' per hour';s+=g?(hourly>=g.rate?', above your '+money(g.rate)+'/hr goal pace.':', below your '+money(g.rate)+'/hr goal pace.'):'.';}
   else s+=' Add the minutes to see pay per hour.';
   const rural=/\b(hampstead|westminster|upperco|manchester|hereford|parkton|mount airy|sykesville|bel air|aberdeen|rural|country|edge)\b/i.test(raw)||mi>=20;
   if(rural){const rt=pay/(mi*2);s+=' If the drive back is likely empty, it pays '+money(rt)+' per mile for the round trip'+(rt>=1.5?', which clears the $1.50 round-trip rule.':', under the $1.50 round-trip rule. Take it only if the drop-off is busy.');}
   const minMile=num(ctx.live?.driverPreferences?.minimumMile);if(minMile)s+=pay/mi>=minMile?' Meets your '+money(minMile)+'/mile minimum.':' Below your '+money(minMile)+'/mile minimum.';
   return result(s);
  }
  if(intent==='csv')return result('Tap "Export trips CSV" under Earnings → Trips from screenshots to download every trip you have saved.',{action:'export_csv'});
  if(intent==='screenshot')return result('Attach the screenshot with the paperclip. I will read the trips, show them for you to check, and save them to Earnings.');
  if(intent==='compare'){
   const from=shiftDay(dayKey(now,tz),-59),s=summarize(records,{from,to:dayKey(now,tz)},tz),u=s.platforms.Uber,e=s.platforms.Empower,l=s.platforms.Lyft;
   const rate=p=>p&&p.onlineHours>=1?money(p.onlineGross/p.onlineHours)+' per online hour':p&&p.activeHours>0?money(p.activeGross/p.activeHours)+' per hour with a rider':'not enough hours recorded';
   const lines=[];if(u)lines.push('Uber: '+money(u.gross)+' over 60 days, '+rate(u)+'.');if(e)lines.push('Empower: '+money(e.gross)+', '+rate(e)+'.');if(l)lines.push('Lyft: '+money(l.gross)+', '+rate(l)+'.');
   if(!lines.length)return result('I need earnings from at least two apps to compare. Add trips in Earnings.');
   if(e){const month=summarize(records,{from:dayKey(now,tz).slice(0,7)+'-01',to:dayKey(now,tz)},tz).platforms.Empower;const tiers=[[250,49.99],[500,99.99],[900,149.99],[1400,199.99],[2000,249.99]];const g=month?.gross||0,fee=g?tiers.find(([c])=>g<=c)?.[1]??249.99:0;if(g)lines.push('Empower this month: '+money(g)+' gross; the Flex fee of about '+money(fee)+' comes out of it first, leaving '+money(Math.max(0,g-fee))+'.');}
   lines.push('Per online hour is the fair comparison. Per rider hour leaves out driving to pickups.');
   return result(lines.join('\n'));
  }
  if(intent==='goal'){
   const g=goalRate(ctx),today=dayKey(now,tz),s=summarize(records,{from:today,to:today},tz);
   const hours=num(ctx.live?.shiftHours)||(s.onlineHours>0?s.onlineHours:null);
   if(!g)return result('No pace goal is set. Set it in Earnings → Today · pay per working hour (for example $100 every 3 hours).');
   let msg='Goal: '+money(g.goal)+' every '+g.hours+' hours ('+money(g.rate)+'/hr). Today: '+money(s.gross)+' gross';
   if(hours>0){const rate=s.gross/hours,need=Math.max(0,g.rate*hours-s.gross);msg+=' over '+r2(hours)+' hours = '+money(rate)+'/hr. '+(need>0?'You are '+money(need)+' behind pace; '+money(g.goal)+' in the next '+g.hours+' hours plus '+money(need)+' catches up.':'You are on pace.');}
   else msg+='. Start a shift (or record online hours) to measure pace.';
   return result(msg);
  }
  if(intent==='costs'){
   const c=ctx.carInputs||{},price=num(c.price),mpg=num(c.mpg),target=num(c.target)||20,period=periodFrom(raw,now,tz)||{from:dayKey(now,tz),to:dayKey(now,tz),label:'today'},s=summarize(records,period,tz);
   if(!(mpg>0))return result('Add your MPG (and gas price) on the Car costs card in Earnings, and I can work out what you keep.');
   if(!(price>0))return result('Your car gets '+mpg+' mpg. Add the gas price on the Car costs card to get cost per mile.');
   const perMile=price/mpg;let msg='Gas costs about '+money(perMile)+' per mile ('+money(price)+'/gal ÷ '+mpg+' mpg).';
   if(s.gross>0&&s.miles>0){const gas=s.miles*perMile;msg+=' For '+period.label+': about '+money(gas)+' gas on '+r2(s.miles)+' rider miles, '+Math.round(gas/s.gross*100)+'% of '+money(s.gross)+' gross (your limit is '+target+'%). Pickup miles add more; use the odometer for the full number.';}
   return result(msg);
  }
  if(intent==='best'){
   const byHour={};for(const t of tripRows){if(!t?.request_time||!(num(t.fare)>=0))continue;const h=+new Date(t.request_time).toLocaleString('en-US',{timeZone:tz,hour:'numeric',hourCycle:'h23'});const b=byHour[h]||(byHour[h]={pay:0,n:0,min:0});b.pay+=num(t.fare);b.n++;b.min+=num(t.trip_time)||0;}
   const hours=Object.entries(byHour).filter(([,b])=>b.n>=3).map(([h,b])=>({h:+h,avg:b.pay/b.n,n:b.n})).sort((a,b)=>b.avg-a.avg);
   const days={};for(const r of records){if(r.payType!=='gross'||r.hoursType!=='online'||!(r.hours>0))continue;const d=DAYS[weekday(recordDayOf(r,tz))];const b=days[d]||(days[d]={g:0,h:0});b.g+=r.earnings;b.h+=r.hours;}
   const dayList=Object.entries(days).map(([d,b])=>({d,rate:b.g/b.h})).sort((a,b)=>b.rate-a.rate);
   if(!hours.length&&!dayList.length)return result('I need more trips with times to rank hours. Add trip screenshots in Earnings.');
   const fmt=h=>new Date(Date.UTC(2026,0,1,h)).toLocaleTimeString('en-US',{hour:'numeric',timeZone:'UTC'});
   const lines=[];if(hours.length)lines.push('Best start hours by average pay per trip: '+hours.slice(0,3).map(x=>fmt(x.h)+' '+money(x.avg)+' ('+x.n+' trips)').join(', ')+'.');
   if(dayList.length)lines.push('Best days per online hour: '+dayList.slice(0,3).map(x=>x.d[0].toUpperCase()+x.d.slice(1)+' '+money(x.rate)).join(', ')+'.');
   lines.push('Based on your own records only; more days make this more reliable.');
   return result(lines.join('\n'));
  }
  if(intent==='where'||intent==='events'){
   const live=ctx.live||{},zones=(live.zones||[]).filter(z=>Number.isFinite(z.score)).sort((a,b)=>b.score-a.score).slice(0,3);
   const soon=(live.events||[]).filter(e=>{const t=Date.parse(e.start);return Number.isFinite(t)&&t>=now-3*3600000&&t<=+now+12*3600000;}).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start)).slice(0,4);
   const lines=[];
   if(intent==='where'&&zones.length)lines.push('Highest predicted demand right now: '+zones.map(z=>z.name).join(', ')+'.');
   if(soon.length)lines.push('Coming up: '+soon.map(e=>e.name+' at '+new Date(e.start).toLocaleTimeString('en-US',{timeZone:tz,hour:'numeric',minute:'2-digit'})).join('; ')+'.');
   if(!lines.length)return result('Live demand is still loading. Open the map for the heat and the 12-hour route.');
   lines.push('Predictions from Home Base data, not guaranteed requests.');
   return result(lines.join('\n'));
  }
  if(intent==='earnings'){
   const period=periodFrom(raw,now,tz)||{from:dayKey(now,tz),to:dayKey(now,tz),label:'today'};
   return result(lineFor(summarize(records,period,tz),period.label));
  }
  const period=periodFrom(raw,now,tz);if(period)return result(lineFor(summarize(records,period,tz),period.label));
  return{handled:false,intent:null,answer:'The built-in assistant can\'t answer that one. It handles earnings, goal pace, trip offers, app comparisons, costs, best hours, weather, screenshots and where to go. Home Base AI Plus (GPT) handles open questions.',source:'built-in'};
 }

 // ---------- browser: OCR and review ----------
 const TESSERACT='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
 let tesseractLoad=null,worker=null,progressHandler=null;
 function loadTesseract(){
  if(typeof window==='undefined')return Promise.reject(Error('Screenshot reading runs in the app.'));
  if(window.Tesseract)return Promise.resolve(window.Tesseract);
  return tesseractLoad||(tesseractLoad=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=TESSERACT;s.async=true;s.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(Error('Screenshot reader did not load.'));s.onerror=()=>{tesseractLoad=null;reject(Error('Screenshot reader needs a connection the first time.'));};document.head.append(s);}));
 }
 // Grayscale, flip dark mode to dark-on-light, and push grey labels to black so
 // the reader keeps times and distances that apps print in light grey.
 function prepareImage(image){
  return new Promise((resolve,reject)=>{
   const src=typeof image==='string'?image:URL.createObjectURL(image),img=new Image();
   img.onload=()=>{try{const scale=Math.min(2,Math.max(1,1400/img.naturalWidth)),c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*scale);c.height=Math.round(img.naturalHeight*scale);
    const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0,c.width,c.height);const d=g.getImageData(0,0,c.width,c.height),px=d.data;
    let sum=0;for(let i=0;i<px.length;i+=4)sum+=px[i]*.299+px[i+1]*.587+px[i+2]*.114;const dark=sum/(px.length/4)<128;
    for(let i=0;i<px.length;i+=4){let v=px[i]*.299+px[i+1]*.587+px[i+2]*.114;if(dark)v=255-v;v=v<205?0:255;px[i]=px[i+1]=px[i+2]=v;}
    g.putImageData(d,0,0);if(typeof image!=='string')URL.revokeObjectURL(src);resolve(c);}catch(e){reject(e);}};
   img.onerror=()=>reject(Error('That image could not be opened.'));img.src=src;
  });
 }
 async function readImage(image,onProgress){
  const T=await loadTesseract();
  const prepared=await prepareImage(image).catch(()=>image);
  // One column of rows in mixed sizes (page mode 4) keeps "UberX $7.73" together
  // and still reads the large day total at the top.
  progressHandler=onProgress||null;
  if(!worker)worker=(async()=>{const w=await T.createWorker('eng',1,{logger:m=>{if(m.status==='recognizing text'&&progressHandler)progressHandler(Math.round(m.progress*100));}});await w.setParameters({tessedit_pageseg_mode:'4'});return w;})().catch(e=>{worker=null;throw e;});
  const {data}=await (await worker).recognize(prepared);
  return data.text||'';
 }
 const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f;}catch{return f;}};
 const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
 function browserContext(){
  // Each source is optional: a map or live feed that is still loading must not
  // stop the driver's own numbers from being answered.
  const safe=(fn,f)=>{try{return fn()??f;}catch{return f;}};
  return{records:safe(()=>window.HomeBaseDriverRecords?.(),null)||read('homeBaseLedger',[]),tripRows:read('homeBaseTripRows',[]).filter(r=>r?.record_id),goalPace:read('homeBaseGoalPace',{}),carInputs:read('homeBaseCarCostInputs',{}),live:safe(()=>window.HomeBaseCopilot?.liveContext?.(),{}),weather:safe(()=>({...(window.HomeBaseWeatherState||{}),hourly:typeof hourlyRainForecast!=='undefined'?hourlyRainForecast:[],alerts:typeof activeWeatherAlerts!=='undefined'?activeWeatherAlerts:[]}),null),tz:safe(()=>typeof marketTimeZone==='string'?marketTimeZone:TZ,TZ)};
 }
 function saveParsed(parsed){
  const ledger=read('homeBaseLedger',[]),out=toRecords(parsed,{ledger});
  write('homeBaseTripRows',mergeById(read('homeBaseTripRows',[]),out.tripRows,'record_id'));
  if(out.ledgerRows.length)write('homeBaseLedger',mergeById(ledger,out.ledgerRows,'id'));
  document.dispatchEvent(new Event('homebase:device-data-changed'));
  try{if(typeof updateEarnings==='function')updateEarnings();}catch{}
  return out;
 }
 function downloadCsv(){
  const csv=tripsCsv(read('homeBaseTripRows',[])),url=URL.createObjectURL(new Blob([csv],{type:'text/csv'})),a=document.createElement('a');
  a.href=url;a.download='home-base-trips.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 // Review sheet: the driver checks every row before anything is saved.
 function review(parsed){
  return new Promise(resolve=>{
   document.getElementById('hbReadReview')?.remove();
   const box=document.createElement('div');box.id='hbReadReview';box.className='hb-read-review';box.setAttribute('role','dialog');box.setAttribute('aria-label','Check the trips I read');
   const today=dayKey(new Date());
   const row=(t,i)=>'<tr class="'+(t.flags.length?'flag':'')+'"><td><input type="checkbox" data-i="'+i+'" data-f="include"'+(t.include?' checked':'')+'></td><td>'+esc(t.time)+(t.canceled?'<small>canceled</small>':'')+'</td><td><input inputmode="decimal" data-i="'+i+'" data-f="fare" value="'+(t.fare??'')+'"></td><td><input inputmode="decimal" data-i="'+i+'" data-f="minutes" value="'+(t.minutes??'')+'"></td><td><input inputmode="decimal" data-i="'+i+'" data-f="miles" value="'+(t.miles??'')+'"></td></tr>';
   box.innerHTML='<div class="hb-read-card"><h3>Check the trips I read</h3><p class="hb-read-note">Empty boxes were not visible in the screenshot. Fill them in or leave them empty. Nothing is saved until you tap Save.</p>'+
    '<div class="hb-read-meta"><label>App<select id="hbReadPlatform">'+['Uber','Empower','Lyft'].map(p=>'<option'+(p===parsed.platform?' selected':'')+'>'+p+'</option>').join('')+'</select></label><label>Date<input type="date" id="hbReadDate" max="'+today+'" value="'+esc(parsed.date||'')+'"></label></div>'+
    (parsed.trips.length?'<div class="hb-read-table"><table><thead><tr><th></th><th>Time</th><th>Pay $</th><th>Min</th><th>Miles</th></tr></thead><tbody>'+parsed.trips.map(row).join('')+'</tbody></table></div>':'<p class="hb-read-note"><b>No trips found.</b> Use the app\'s earnings activity list (each trip shows a time and pay) and try again.</p>')+
    '<p class="hb-read-total" id="hbReadTotal"></p><div class="hb-read-actions"><button type="button" id="hbReadCancel">Cancel</button><button type="button" id="hbReadSave" class="primary-action"'+(parsed.trips.length?'':' disabled')+'>Save trips</button></div></div>';
   document.body.append(box);
   const total=()=>{const sum=parsed.trips.filter(t=>t.include&&t.fare>0).reduce((s,t)=>s+t.fare,0)+parsed.extras.reduce((s,e)=>s+(e.amount>0?e.amount:0),0);
    box.querySelector('#hbReadTotal').textContent=parsed.trips.filter(t=>t.include).length+' trips · '+money(sum)+(parsed.extras.length?' including '+money(parsed.extras.reduce((s,e)=>s+e.amount,0))+' tips/bonuses':'')+(parsed.dayTotal!==null?' · screenshot day total '+money(parsed.dayTotal)+(Math.abs(parsed.dayTotal-sum)<.01?' ✓ matches':' (rows shown add to '+money(sum)+'; read the rest of the day\'s screenshots or check for a cut-off row)'):'');};
   box.querySelectorAll('[data-i]').forEach(input=>input.addEventListener(input.type==='checkbox'?'change':'input',()=>{const t=parsed.trips[+input.dataset.i],f=input.dataset.f;if(f==='include')t.include=input.checked;else{const v=input.value.trim();t[f]=v===''?null:num(v.replace(',','.'));}t.flags=[t.fare===null?'pay not found':null,t.minutes===null?'time with rider not found':null,t.miles===null?'miles not found':null].filter(Boolean);input.closest('tr').classList.toggle('flag',t.flags.length>0);total();}));
   total();
   const done=v=>{box.remove();resolve(v);};
   box.querySelector('#hbReadCancel').onclick=()=>done(null);
   box.querySelector('#hbReadSave').onclick=()=>{parsed.platform=box.querySelector('#hbReadPlatform').value;parsed.date=box.querySelector('#hbReadDate').value||null;if(!parsed.date){box.querySelector('#hbReadDate').focus();return;}
    try{const out=saveParsed(parsed);done({parsed,...out});}catch(error){box.querySelector('#hbReadTotal').textContent=error.message;}};
  });
 }
 async function readScreenshots(files,{onStatus=()=>{}}={}){
  const parsedList=[];
  for(const [i,file] of [...files].entries()){
   onStatus('Reading screenshot '+(i+1)+' of '+files.length+'…');
   const text=await readImage(file,p=>onStatus('Reading screenshot '+(i+1)+' of '+files.length+'… '+p+'%'));
   parsedList.push(parseScreenshotText(text,{platform:null}));
  }
  onStatus('');const results=[];
  for(const group of combineParsed(parsedList)){const saved=await review(group);if(saved)results.push(saved);}
  return results;
 }
 function summaryOf(results){
  if(!results.length)return'Nothing saved.';
  const trips=results.reduce((s,r)=>s+r.tripRows.length,0),pay=results.reduce((s,r)=>s+r.tripRows.reduce((a,t)=>a+(t.fare||0),0),0),miles=results.reduce((s,r)=>s+r.tripRows.reduce((a,t)=>a+(t.trip_distance||0),0),0);
  return'Saved '+plural(trips,'trip')+' · '+money(pay)+(miles?' · '+r2(miles)+' miles':'')+'.'+(results.some(r=>r.daySummary)?' A day total was already in Earnings, so these trips were added as detail and the day was not counted twice.':' Added to Earnings.');
 }
 // Earnings screen card: read screenshots and export the trip CSV.
 function mountEarnings(rootEl){
  if(!rootEl||rootEl.querySelector('#hbScreenshotTrips'))return;
  const trips=read('homeBaseTripRows',[]).filter(r=>r?.record_id);
  const s=document.createElement('section');s.id='hbScreenshotTrips';s.className='workspace-section';
  s.innerHTML='<h3>TRIPS FROM SCREENSHOTS</h3><p class="earnings-data-note">Uber has no CSV export, so Home Base builds one. Choose screenshots of your earnings activity; you check every row before it is saved. Free, and the reading happens on this phone.</p>'+
   '<label class="csv-upload"><svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5M4 15v5h16v-5"/></svg><div><b>Read trip screenshots</b><span>Uber · Empower · Lyft</span></div><em>CHOOSE</em><input id="hbShotInput" type="file" accept="image/*" multiple></label>'+
   '<button type="button" class="secondary-action" id="hbTripsCsv"'+(trips.length?'':' disabled')+'>Export trips CSV ('+trips.length+')</button><p class="earnings-data-note" id="hbShotStatus" role="status"></p>';
  rootEl.append(s);
  const status=s.querySelector('#hbShotStatus');
  s.querySelector('#hbTripsCsv').onclick=downloadCsv;
  s.querySelector('#hbShotInput').onchange=async e=>{const files=[...(e.target.files||[])];e.target.value='';if(!files.length)return;try{const results=await readScreenshots(files,{onStatus:t=>status.textContent=t});status.textContent=summaryOf(results);if(results.length&&typeof renderEarningsPanel==='function')setTimeout(()=>renderEarningsPanel(summaryOf(results)),50);}catch(error){status.textContent=error.message||'Could not read that screenshot.';}};
 }
 function plan(){try{return JSON.parse(localStorage.getItem('homeBaseProductPrefs')||'{}').aiPlan==='plus'?'plus':'builtin';}catch{return'builtin';}}
 function setPlan(value,{chosen=false}={}){let p={};try{p=JSON.parse(localStorage.getItem('homeBaseProductPrefs')||'{}')||{};}catch{}p.aiPlan=value==='plus'?'plus':'builtin';if(chosen)p.aiPlanChosen=true;localStorage.setItem('homeBaseProductPrefs',JSON.stringify(p));}
 // The server decides the plan (free, plus, pro) and GPT Live minutes left.
 let serverStatus=null;
 function notePlanStatus(a){
  if(!a||typeof a.plan!=='string')return;serverStatus={...a,at:Date.now()};try{localStorage.setItem('homeBasePlanStatus',JSON.stringify(serverStatus));}catch{}
  let chosen=false;try{chosen=JSON.parse(localStorage.getItem('homeBaseProductPrefs')||'{}').aiPlanChosen===true;}catch{}
  if(a.plan==='free')setPlan('builtin');else if(['plus','pro'].includes(a.plan)&&!chosen)setPlan('plus');
  if(typeof document!=='undefined')document.dispatchEvent(new Event('homebase:plan-changed'));
 }
 function serverPlan(){return serverStatus?.plan||read('homeBasePlanStatus',null)?.plan||null;}
 function planStatus(){return serverStatus||read('homeBasePlanStatus',null);}
 async function refreshEntitlement(){
  const b=typeof window!=='undefined'?window.HomeBaseAccounts?.backend:null;if(!b)return null;
  try{const u=await b.getUser();if(!u?.id||u.is_anonymous){serverStatus={plan:'signed-out'};if(typeof document!=='undefined')document.dispatchEvent(new Event('homebase:plan-changed'));return serverStatus;}
   const a=await b.evaluateDispatch({operation:'allowance'});notePlanStatus(a);return a;}catch{return null;}
 }
 function ask(text){const r=answer(text,browserContext());if(r.action==='export_csv'&&typeof document!=='undefined')downloadCsv();return r;}
 if(typeof window!=='undefined'&&typeof document!=='undefined'){
  const hook=()=>{if(typeof renderEarningsPanel!=='function')return false;const base=renderEarningsPanel;renderEarningsPanel=function(...args){base(...args);try{const rootEl=document.getElementById('workspaceContent');if(rootEl?.querySelector('#earningsCsv'))mountEarnings(rootEl);}catch{}};return true;};
  if(!hook())window.addEventListener('DOMContentLoaded',hook,{once:true});
  let tries=0;const wait=setInterval(()=>{if(window.HomeBaseAccounts?.backend||++tries>40){clearInterval(wait);refreshEntitlement();}},500);
  window.addEventListener('homebase-calendar-identity',()=>setTimeout(refreshEntitlement,300));
 }
 return{VERSION:'builtin-1',notePlanStatus,serverPlan,planStatus,refreshEntitlement,combineParsed,_prepare:typeof document!=='undefined'?prepareImage:null,answer,ask,intentOf,periodFrom,summarize,overheadMinutes,parseScreenshotText,toRecords,tripsCsv,zonedIso,dayKey,readImage,readScreenshots,review,saveParsed,summaryOf,mountEarnings,downloadCsv,plan,setPlan};
});
