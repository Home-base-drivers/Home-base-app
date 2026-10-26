// Events stay in the driver's market. Oct 26: NHL games at Madison Square Garden and
// TD Garden appeared in Baltimore because "Garden"/"Square" matched local place names.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const Sports=require('../dist/homebase-sports.js');
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const extract=name=>html.match(new RegExp('(?:const GENERIC_VENUE_WORDS[^\\n]*\\n)?function '+name+'\\([^]*?\\n\\}'))?.[0]||html.match(new RegExp('function '+name+'\\([^\\n]*'))[0];
const ctx={};vm.createContext(ctx);
vm.runInContext(html.match(/function eventToken\([^\n]*/)[0]+'\n'+html.match(/const GENERIC_VENUE_WORDS[^\n]*/)[0]+'\n'+html.match(/function findEventVenue\([^\n]*/)[0]+'\n'+html.match(/function sportEmoji\([^\n]*/)[0]+'\nthis.findEventVenue=findEventVenue;this.sportEmoji=sportEmoji;',ctx);
const baltimorePlaces=[{name:'Union Square',lat:39.2867,lon:-76.6415},{name:'Madison Park',lat:39.30,lon:-76.63},{name:'Sherwood Gardens',lat:39.34,lon:-76.61},{name:'Lexington Market',lat:39.29,lon:-76.62}];

test('an out-of-town arena is placed at its real venue, never at a same-word local place',()=>{
  const msg=Sports.venuePlace('Madison Square Garden');
  assert.equal(msg.city,'New York');assert.ok(Math.abs(msg.lat-40.7506)<.01);
  assert.equal(ctx.findEventVenue('Madison Square Garden',baltimorePlaces),null);
  assert.equal(ctx.findEventVenue('TD Garden',baltimorePlaces),null);
  assert.equal(ctx.findEventVenue('Lexington Market',baltimorePlaces).name,'Lexington Market');
});
test('every configured sports venue is in the app registry with the same coordinates',()=>{
  const config=JSON.parse(fs.readFileSync(new URL('../config/provider-markets.json',import.meta.url)));
  for(const m of config.markets)for(const v of m.sportsVenues||[]){const hit=Sports.venuePlace(v.name);assert.ok(hit,v.name);assert.equal(hit.lat,v.lat,v.name);assert.equal(hit.lon,v.lon,v.name);}
});
test('games outside the market city are dropped unless their venue is known and nearby',()=>{
  assert.match(html,/HomeBaseSports\.venuePlace\(row\.venue\)/);
  assert.match(html,/if\(!localCity\)continue/);
  assert.match(html,/function eventNearDriver\(event\)/);
});
test('sports icons match the league',()=>{
  assert.equal(ctx.sportEmoji({tags:{league:'NHL'}}),'🏒');
  assert.equal(ctx.sportEmoji({tags:{league:'NFL'}}),'🏈');
  assert.equal(ctx.sportEmoji({tags:{league:'NBA'}}),'🏀');
  assert.equal(ctx.sportEmoji({tags:{league:'MLB'}}),'⚾');
  assert.equal(ctx.sportEmoji({tags:{league:'MLS'}}),'⚽');
});
