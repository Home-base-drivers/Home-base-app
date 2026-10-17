import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const H=createRequire(import.meta.url)('../dist/homebase-demand-history.js');

test('route planning predicts from past history with a wider window than the heat layer',()=>{
 const pts=new Map();for(const r of H.observationRows())for(const i of r.area_observations||[])if(Number.isFinite(i.lat))pts.set(i.lat.toFixed(3)+i.lon.toFixed(3),i);
 const monday3pm=new Date('2026-10-19T15:00:00-04:00');
 const strict=[...pts.values()].filter(i=>H.recurrenceAt(i.lat,i.lon,monday3pm).distinctDates>=2).length;
 const route=[...pts.values()].filter(i=>H.recurrenceAt(i.lat,i.lon,monday3pm,{route:true}).distinctDates>=2).length;
 assert.ok(route>=strict,'route window never finds fewer places than the strict heat window');
 assert.ok(route>=10,'weekday-afternoon history yields verified route spots ('+route+')');
 // Default (heat) behavior is unchanged when no options are passed.
 const one=[...pts.values()][0];assert.deepEqual(H.recurrenceAt(one.lat,one.lon,monday3pm),H.recurrenceAt(one.lat,one.lon,monday3pm,undefined));
});
