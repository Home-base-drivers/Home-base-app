import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {progressKeys} from '../src/backend-client.mjs';

test('every synced setting is accepted by the newest save_home_base_state migration',()=>{
 const dir=new URL('../supabase/migrations/',import.meta.url);
 const latest=readdirSync(dir).filter(f=>readFileSync(new URL(f,dir),'utf8').includes('function public.save_home_base_state')).sort().at(-1);
 const sql=readFileSync(new URL(latest,dir),'utf8');
 for(const key of progressKeys)assert.match(sql,new RegExp("'"+key+"'"),key+' missing from '+latest);
});
