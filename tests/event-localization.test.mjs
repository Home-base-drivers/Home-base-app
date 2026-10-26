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

test('events count only inside the driver\'s rideshare service area',()=>{
  const M=require('../dist/baltimore-market.js'),baltimore=[39.29,-76.61],miami=[25.77,-80.19];
  for(const p of [[38.898,-77.021],[38.978,-76.49],[39.64,-77.72],[38.95,-77.45],[38.336,-75.085]])assert.ok(M.inDriverServiceArea(baltimore,p),'DMV '+p);
  for(const p of [[39.90,-75.17],[39.96,-76.73],[39.74,-75.55],[39.68,-75.75],[39.46,-77.96]])assert.ok(!M.inDriverServiceArea(baltimore,p),'outside DMV '+p);
  assert.ok(M.inDriverServiceArea(miami,[27.95,-82.46]));assert.ok(!M.inDriverServiceArea(miami,[25.04,-77.35]));
  assert.match(html,/HomeBaseMarket\.inDriverServiceArea\(currentLocation,point\)/);
});
test('distances read in miles in the US',()=>{
  const c={currentCountryCode:'US'};vm.createContext(c);vm.runInContext(html.match(/function usesMiles\([^\n]*/)[0]+'\n'+html.match(/function distanceLabel\([^\n]*/)[0],c);
  assert.equal(c.distanceLabel(16.09344),'10.0 mi');c.currentCountryCode='FR';assert.equal(c.distanceLabel(10),'10.0 km');
});
