import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../dist/homebase-agent-client.js',import.meta.url),'utf8');
function harness(elements={},getUser=async()=>({id:'driver'})){
 const ctx={document:{getElementById:id=>elements[id]},HomeBaseAccounts:{backend:{getUser}}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(code,ctx);return ctx.HomeBaseAgentClient;
}
test('a click cannot confirm GPS or external navigation completion',async()=>{
 let clicks=0;const client=harness({refreshBtn:{click:()=>clicks++},mapsBtn:{click:()=>clicks++}});
 for(const name of ['refresh','navigate']){const r=await client.execute({name});assert.equal(r.requested,true);assert.equal(r.confirmed,false);assert.equal(r.ok,false);}
 assert.equal(clicks,2);
});
test('toggle confirmation requires an observed state change',async()=>{
 let state='false';const client=harness({layerBtn:{getAttribute:()=>state,click:()=>{state='true'}},bonusToggle:{getAttribute:()=>state,click:()=>{}}});
 const changed=await client.execute({name:'heatmap'});assert.equal(changed.confirmed,true);assert.equal(changed.state,'true');
 const unchanged=await client.execute({name:'bonuses'});assert.equal(unchanged.confirmed,false);assert.equal(unchanged.ok,false);
 assert.equal((await client.execute({name:'twelve_hour'})).confirmed,false);
});
test('account network errors are not relabeled as sign-in failures',async()=>{
 const client=harness({},async()=>{throw Error('Network request failed')});await assert.rejects(()=>client.signedIn(),/Network/);
 assert.doesNotMatch(client.describeError(Error('Live session failed (502)')),/Sign in/);
 assert.match(client.describeError(Object.assign(Error('Auth session missing!'),{name:'AuthSessionMissingError'})),/Sign in/);
});
