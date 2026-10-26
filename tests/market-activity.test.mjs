import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { marketActivityHandler, MARKETS } from '../supabase/functions/market-activity/handler.mjs';
import { selectMarkets } from '../scripts/refresh-provider-signals.mjs';
const P = createRequire(import.meta.url)('../dist/homebase-public-data.js');

function fakeAdmin({ claim = true } = {}) {
  const calls = [];
  return { calls, client: () => ({ rpc: async (name, args) => { calls.push([name, args]); return name === 'claim_market_refresh' ? { data: claim } : name === 'active_markets' ? { data: ['new-york'] } : { data: null }; } }) };
}
const post = body => new Request('https://x.supabase.co/functions/v1/market-activity', { method: 'POST', headers: { Origin: 'https://homebasedrivers.com', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('every configured market is accepted by the activity function', async () => {
  const config = JSON.parse(await readFile(new URL('../config/provider-markets.json', import.meta.url), 'utf8'));
  assert.deepEqual([...MARKETS].sort(), config.markets.map(m => m.id).sort());
});

test('activity is recorded by market id only; unknown markets are refused', async () => {
  const a = fakeAdmin();
  const handler = marketActivityHandler(a.client, () => undefined);
  assert.equal((await handler(post({ markets: ['nowhere'] }))).status, 400);
  const r = await handler(post({ markets: ['baltimore', 'washington-dc', 'baltimore'] }));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { recorded: ['baltimore', 'washington-dc'], refresh: 'scheduled' });
  assert.deepEqual(a.calls, [['touch_markets', { p_markets: ['baltimore', 'washington-dc'] }]]);
  assert.equal((await handler(new Request('https://x', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: '{}' }))).status, 403);
});

test('with a GitHub token a stale market starts one refresh for all active markets', async () => {
  const a = fakeAdmin(), sent = [];
  const handler = marketActivityHandler(a.client, n => n === 'GITHUB_DISPATCH_TOKEN' ? 'token' : undefined, async (url, init) => { sent.push([url, JSON.parse(init.body)]); return { status: 204 }; });
  const r = await (await handler(post({ markets: ['baltimore'] }))).json();
  assert.equal(r.refresh, 'started');
  assert.match(sent[0][0], /actions\/workflows\/live-signals\.yml\/dispatches$/);
  assert.deepEqual(sent[0][1], { ref: 'main', inputs: { markets: 'baltimore,new-york' } });
  const b = fakeAdmin({ claim: false }), none = [];
  const recent = await (await marketActivityHandler(b.client, () => 'token', async () => { none.push(1); return { status: 204 }; })(post({ markets: ['baltimore'] }))).json();
  assert.equal(recent.refresh, 'recent'); assert.equal(none.length, 0);
});

test('refresh selection: active list, all, or none', () => {
  const markets = MARKETS.map(id => ({ id }));
  assert.equal(selectMarkets(markets, undefined).size, MARKETS.length);
  assert.equal(selectMarkets(markets, 'all').size, MARKETS.length);
  assert.deepEqual([...selectMarkets(markets, 'baltimore,washington-dc,bogus')], ['baltimore', 'washington-dc']);
  assert.equal(selectMarkets(markets, 'none').size, 0);
});

test('the app reports only market ids, at most every 10 minutes', async () => {
  const payload = { markets: [{ id: 'baltimore', center: { lat: 39.2904, lon: -76.6122 }, radiusKm: 58 }, { id: 'washington-dc', center: { lat: 38.9072, lon: -77.0369 }, radiusKm: 40 }, { id: 'miami', center: { lat: 25.77, lon: -80.19 }, radiusKm: 60 }] };
  const sent = [], request = async (url, init) => { sent.push([url, JSON.parse(init.body)]); return { ok: true, json: async () => ({}) }; };
  const config = { supabaseUrl: 'https://abc.supabase.co', supabasePublishableKey: 'sb_publishable_x' };
  await P.reportActivity(config, payload, 39.29, -76.61, request, 1e12);
  await P.reportActivity(config, payload, 39.29, -76.61, request, 1e12 + 60000);
  await P.reportActivity(config, payload, 39.29, -76.61, request, 1e12 + 11 * 60000);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0], ['https://abc.supabase.co/functions/v1/market-activity', { markets: ['baltimore', 'washington-dc'] }]);
});

test('activity table: private rows, throttled refresh claims, public active list', async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;`);
  for (const f of (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort()) await db.exec(await readFile(new URL('../supabase/migrations/' + f, import.meta.url), 'utf8'));
  await db.query("select public.touch_markets(array['baltimore','washington-dc','bad id!'])");
  assert.deepEqual((await db.query('select * from public.active_markets(120)')).rows.map(r => r.active_markets), ['baltimore', 'washington-dc']);
  assert.equal((await db.query("select public.claim_market_refresh('baltimore',30,10) as c")).rows[0].c, true);
  assert.equal((await db.query("select public.claim_market_refresh('washington-dc',30,10) as c")).rows[0].c, false, 'global limit');
  await db.exec("set role anon");
  await assert.rejects(db.query('select * from public.market_activity'), { code: '42501' });
  await assert.rejects(db.query("select public.touch_markets(array['miami'])"), { code: '42501' });
  assert.equal((await db.query('select * from public.active_markets(120)')).rows.length, 2);
  await db.close();
});
