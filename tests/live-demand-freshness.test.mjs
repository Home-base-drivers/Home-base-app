import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import publicData from '../dist/homebase-public-data.js';

const live=await readFile(new URL('../dist/homebase-live.js',import.meta.url),'utf8');

test('live demand uses the shared freshest-snapshot loader, not the stale bundled file alone',()=>{
  assert.match(live,/HomeBasePublicData\.loadSnapshot\(fetchJson\)/);
  assert.doesNotMatch(live,/await fetch\(`\.\/provider-signals\.json\?ts=/);
});

test('live snapshot loader selects newer signals branch data over bundled fallback',async()=>{
  const now=Date.parse('2026-10-15T03:10:00Z');
  const bundled={generatedAt:'2026-10-07T15:16:56Z',markets:[]};
  const remote={generatedAt:'2026-10-15T03:09:00Z',markets:[]};
  const result=await publicData.loadSnapshot(async url=>url.startsWith('https:')?remote:bundled,now);
  assert.equal(result,remote);
});

test('snapshot loader keeps a valid bundled fallback when live branch is unreachable',async()=>{
  const now=Date.parse('2026-10-15T03:10:00Z');
  const bundled={generatedAt:'2026-10-07T15:16:56Z',markets:[]};
  const result=await publicData.loadSnapshot(async url=>{
    if(url.startsWith('https:'))throw Error('network unavailable');
    return bundled;
  },now);
  assert.equal(result,bundled);
});
