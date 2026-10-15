import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const sw=await readFile(new URL('../dist/sw.js',import.meta.url),'utf8');

test('release versions stay aligned across shell and service worker',()=>{
 const build=html.match(/name="homebase-build" content="(v\d+)"/)?.[1];
 const registration=html.match(/serviceWorker\.register\('sw\.js\?v=(\d+)'/)?.[1];
 const reload=html.match(/hb-release-reload-v(\d+)/)?.[1];
 const cache=sw.match(/const CACHE='home-base-v(\d+)'/)?.[1];
 assert.ok(build&&registration&&reload&&cache);
 assert.equal(build,'v'+registration);
 assert.equal(registration,reload);
 assert.equal(registration,cache);
});

test('critical runtime assets use explicit cache-busting versions',()=>{
 for(const asset of ['homebase-heat.js','homebase-global-heat.js','homebase-agent-client.js','homebase-live.js']){
  assert.match(html,new RegExp(asset.replaceAll('.','\\.')+'\\?v=\\d+'));
 }
});

test('service worker is network-first and immediately takes control',()=>{
 assert.match(sw,/skipWaiting\(\)/);
 assert.match(sw,/clients\.claim\(\)/);
 assert.match(sw,/event\.request\.mode==='navigate'/);
 assert.match(sw,/fetch\(event\.request,\{cache:'no-store'\}\)/);
});

test('a first service-worker install does not reload the app',()=>{
 // clients.claim() fires controllerchange even when no earlier worker is being
 // replaced, so an unguarded handler loads the whole app twice for every new
 // driver on their very first open.
 assert.match(html,/const replacingWorker=!!navigator\.serviceWorker\.controller;/);
 assert.match(html,/addEventListener\('controllerchange',\(\)=>\{if\(!replacingWorker\)return;/);
});

test('a release upgrade still reloads once so drivers get the new version',()=>{
 const guard=html.match(/if\(!replacingWorker\)return;if\(!sessionStorage\.getItem\('hb-release-reload-v(\d+)'\)\)\{sessionStorage\.setItem\('hb-release-reload-v(\d+)','1'\);location\.reload\(\)\}/);
 assert.ok(guard,'the one-shot reload must stay reachable behind the controller check');
 assert.equal(guard[1],guard[2]);
});

test('global heat and decision UI are present in the shipped shell',()=>{
 assert.match(html,/id="layerBtn"/);
 assert.match(html,/BEST MOVE RIGHT NOW/);
 assert.match(html,/HomeBaseGlobalHeat\.create/);
 assert.match(html,/liveMap\.on\('moveend'/);
});
