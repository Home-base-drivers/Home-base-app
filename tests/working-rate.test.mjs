import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const E=createRequire(import.meta.url)('../dist/homebase-earnings.js');
test('Sunday Oct 11: breaks come out of working time, bonus shown separately',()=>{
  const r=E.workingRate({earned:136.05,bonus:67,hoursOut:5,breakMinutes:20});
  assert.equal(r.workingHours.toFixed(3),'4.667');
  assert.equal(r.rate.toFixed(2),'29.15');
  assert.equal(r.withBonus.toFixed(2),'43.51');
  assert.equal(r.meetsGoal,false);assert.equal(r.meetsGoalWithBonus,true);
  assert.equal(r.perGoalWindow.toFixed(2),'87.46');
});
test('no working time returns null',()=>{assert.equal(E.workingRate({earned:50,hoursOut:0.25,breakMinutes:30}),null);});
test('weekly trip bonus value per trip',()=>{
  const q=E.questPlan({target:50,done:42,reward:67});
  assert.equal(q.left,8);assert.equal(q.perTrip.toFixed(2),'1.34');assert.equal(q.complete,false);
  assert.equal(E.questPlan({target:50,done:50,reward:67}).complete,true);
});
