import test from 'node:test';
import assert from 'node:assert/strict';
import policy from '../dist/homebase-route-policy.js';
import heat from '../dist/homebase-heat.js';
import {publishedAttendance} from '../scripts/public-events.mjs';

const event={cat:'event',eventStart:new Date(Date.now()+30*60000),tags:{publicCalendar:true}};
const sized=count=>({...event,expectedAttendance:count,attendanceBasis:'organizer_estimate',attendanceSourceUrl:'https://venue.example/event',attendanceConfidence:.75});
test('supported attendance forecasts scale monotonically without making capacity or RSVPs turnout',()=>{
 const small=policy.eventImpact(sized(100)),large=policy.eventImpact(sized(20000));
 assert.ok(large.scale>small.scale);assert.equal(large.attendance,20000);
 assert.match(large.label,/estimate/);
 for(const source of [{...event,capacity:50000},{...event,num_attending:50000},{...sized(50000),attendanceSourceUrl:null},{...sized(-1)},{...sized(Infinity)}])assert.equal(policy.eventImpact(source).attendance,null);
 assert.equal(policy.eventImpact(sized(0)).scale,0);
});
test('organizer turnout is retained with provenance while other counts remain unknown',()=>{
 assert.equal(publishedAttendance({expectedAttendance:2000},'https://organizer.example/event').expectedAttendance,2000);
 assert.deepEqual(publishedAttendance({maximumAttendeeCapacity:2000,num_attending:2000},'https://organizer.example/event'),{});
 assert.deepEqual(publishedAttendance({expectedAttendance:2000},null),{});
});
test('attendance changes current event heat color and opacity without painting price surge',()=>{
 const pixel=count=>{
  const source=sized(count),weight=12*policy.eventImpact(source).scale,strength=heat.sourceStrength(source,new Date(),()=>weight),shade=heat.sourceShade(strength);
  return heat.composeFields(strength,strength*shade,0,0,{current:1,event:shade});
 };
 const small=pixel(100),large=pixel(20000);
 assert.ok(large.level>small.level);assert.ok(large.opacity>small.opacity);
 assert.ok(large.level<=.78);assert.ok(large.level>=.7);
 assert.equal(heat.sourceStrength(sized(20000),new Date(Date.now()+3*3600000),()=>40),0);
});
