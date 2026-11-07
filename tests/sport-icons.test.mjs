import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sports from '../dist/homebase-sports.js';
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
function extract(name){const match=html.match(new RegExp('function '+name+'\\('));assert.ok(match,name);const start=match.index,body=html.indexOf('{',start);let depth=0;for(let i=body;i<html.length;i++){if(html[i]==='{')depth++;else if(html[i]==='}'&&!--depth)return html.slice(start,i+1);}throw Error(name);}
function app(withSports=true){
  const context={safeText:v=>String(v||''),marketDateTime:()=> 'Sun 1 PM',marketTime:()=> '4 PM',demandEvidence:()=> 'Scheduled event',selectedForecastTime:null,currentEventData:[]};
  if(withSports)context.HomeBaseSports=sports;
  vm.createContext(context);
  for(const name of ['eventTypeLabel','eventSport','eventEmoji','eventKindLabel','eventIconSvg','eventPopupContent'])vm.runInContext(extract(name),context);
  return context;
}
// Shapes copied from the live event feed on Nov 5 2026 (scoreboards, Ticketmaster, campus calendars).
const scoreboard=(name,league)=>({name:name+' · 1 PM',cat:'event',eventType:'SPORTS',classification:'sports '+league,tags:{liveEvent:true,source:'public sports feed',league}});
test('scoreboard games show their own sport',()=>{
  const a=app();
  assert.equal(a.eventEmoji(scoreboard('JAX @ BAL','NFL')),'🏈');
  assert.equal(a.eventEmoji(scoreboard('DAL @ MIA','NBA')),'🏀');
  assert.equal(a.eventEmoji(scoreboard('LA @ NYR','NHL')),'🏒');
  assert.equal(a.eventEmoji(scoreboard('Orioles at Yankees','MLB')),'⚾');
  assert.equal(a.eventEmoji(scoreboard('DC @ NE','MLS')),'⚽');
  assert.equal(a.eventEmoji(scoreboard('FSTU @ TOW','NCAA women’s basketball')),'🏀');
  assert.equal(a.eventEmoji(scoreboard('NAVY @ ND','College football')),'🏈');
});
test('ticket and campus listings show their sport',()=>{
  const a=app();
  assert.equal(a.eventEmoji({name:'Navy Midshipmen Mens Basketball vs. Delaware State Hornets',eventType:'event',classification:'Sports Basketball College',genre:'Basketball'}),'🏀');
  assert.equal(a.eventEmoji({name:'New York Rangers vs. Los Angeles Kings',eventType:'event',classification:'Sports Hockey NHL',genre:'Hockey'}),'🏒');
  assert.equal(a.eventEmoji({name:'Maryland Terrapins Womens Volleyball vs. USC Trojans',eventType:'event',classification:'Sports Miscellaneous Miscellaneous',genre:'Miscellaneous'}),'🏐');
  assert.equal(a.eventEmoji({name:'Towson Volleyball vs. Hofstra',eventType:'campus',classification:'Athletics Athletics Volleyball Students'}),'🏐');
  assert.equal(a.eventEmoji({name:'Baltimore Ravens vs. Jacksonville Jaguars',eventType:'Event'}),'🏈');
  assert.equal(a.eventEmoji({name:'Women\'s Basketball vs. Mount St. Mary\'s',eventType:'school_event Event',classification:'college'}),'🏀');
});
test('Ravens away-game bar crowds keep the football icon',()=>{
  const a=app();
  assert.equal(a.eventEmoji({name:'Federal Hill bars · Ravens game · 1 PM',classification:'sports watch party',tags:{watchParty:true,sportLeague:'NFL',league:'Watch party',source:'public sports feed'}}),'🏈');
  assert.match(html,/e\.tags\.sportLeague=row\.league/);
});
test('popup names the league or sport instead of a generic label',()=>{
  const a=app();
  assert.match(a.eventPopupContent(scoreboard('JAX @ BAL','NFL')),/<span>NFL · SCHEDULED<\/span>/);
  assert.match(a.eventPopupContent({name:'Navy Mens Basketball vs. Delaware State',classification:'Sports Basketball College',genre:'Basketball'}),/COLLEGE BASKETBALL · /);
  assert.match(a.eventPopupContent({name:'Spring art walk',genre:'Arts'}),/<span>ARTS · /);
});
test('a sports event with no named sport gets a stadium, and other events keep their icons',()=>{
  const a=app();
  assert.equal(a.eventEmoji({name:'Big game',eventType:'SPORTS'}),'🏟️');
  assert.equal(a.eventEmoji({name:'Jazz night',genre:'Jazz'}),'🎵');
  assert.equal(a.eventEmoji({name:'Heat wave block party',classification:'festival'}),'🎉');
  assert.equal(app(false).eventEmoji(scoreboard('JAX @ BAL','NFL')),'🏟️','without the sports module the app still draws an icon');
});
test('team nicknames that are everyday words only count for sports listings',()=>{
  assert.equal(sports.sportOf({name:'Heat wave party'}),null);
  assert.equal(sports.sportOf({name:'Kings of Comedy',classification:'comedy'}),null);
  assert.equal(sports.sportOf({name:'Knicks vs. Heat',classification:'sports'}).key,'basketball');
});
test('the app reloads the updated sports file',()=>{
  const sw=fs.readFileSync(new URL('../dist/sw.js',import.meta.url),'utf8');
  assert.match(html,/homebase-sports\.js\?v=4/);assert.match(sw,/homebase-sports\.js\?v=4/);
});
test('words that only contain "art" are not arts events',()=>{
  const a=app();
  assert.equal(a.eventTypeLabel({name:'Ravens game',classification:'sports watch party'}),'SPORTS');
  assert.equal(a.eventTypeLabel({name:'Smart start kickoff party'}),'FESTIVAL');
  assert.equal(a.eventTypeLabel({name:'Baltimore art walk'}),'ARTS');
  assert.equal(a.eventTypeLabel({name:'Gallery night',classification:'Arts & Culture'}),'ARTS');
});
