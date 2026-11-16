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

test('with a GitHub token a signed-in driver in a stale market starts one refresh for all active markets', async () => {
  const a = fakeAdminWithAuth(), sent = [];
  const handler = marketActivityHandler(a.client, n => n === 'GITHUB_DISPATCH_TOKEN' ? 'token' : undefined, async (url, init) => { sent.push([url, JSON.parse(init.body)]); return { status: 204 }; });
  const r = await (await handler(postAs({ markets: ['baltimore'] }, 'good'))).json();
  assert.equal(r.refresh, 'started');
  assert.match(sent[0][0], /actions\/workflows\/live-signals\.yml\/dispatches$/);
  assert.deepEqual(sent[0][1], { ref: 'main', inputs: { markets: 'baltimore,new-york' } });
  const b = fakeAdminWithAuth({ claim: false }), none = [];
  const recent = await (await marketActivityHandler(b.client, () => 'token', async () => { none.push(1); return { status: 204 }; })(postAs({ markets: ['baltimore'] }, 'good'))).json();
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

function fakeAdminWithAuth(opts = {}) {
  const a = fakeAdmin(opts), users = { good: { id: 'u1' }, guest: { id: 'u2', is_anonymous: true } };
  return { calls: a.calls, client: (...args) => ({ ...a.client(...args), auth: { getUser: async t => users[t] ? { data: { user: users[t] }, error: null } : { data: null, error: { message: 'bad' } } } }) };
}
const postAs = (body, token) => new Request('https://x.supabase.co/functions/v1/market-activity', { method: 'POST', headers: { Origin: 'https://homebasedrivers.com', 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });

test('only a signed-in driver can start a refresh; anyone else just records the market', async () => {
  const env = n => n === 'GITHUB_DISPATCH_TOKEN' ? 'token' : undefined;
  for (const token of [null, 'forged', 'guest']) {
    const a = fakeAdminWithAuth(), sent = [];
    const r = await (await marketActivityHandler(a.client, env, async () => { sent.push(1); return { status: 204 }; })(postAs({ markets: ['baltimore'] }, token))).json();
    assert.deepEqual(r, { recorded: ['baltimore'], refresh: 'scheduled' }, String(token));
    assert.equal(sent.length, 0, 'no GitHub dispatch for ' + token);
    assert.deepEqual(a.calls.map(c => c[0]), ['touch_markets'], 'no refresh claim used up by ' + token);
  }
  // Origin alone (spoofable) never counts as sign-in.
  const noOrigin = fakeAdminWithAuth(), none = [];
  await marketActivityHandler(noOrigin.client, env, async () => { none.push(1); return { status: 204 }; })(new Request('https://x', { method: 'POST', body: JSON.stringify({ markets: ['baltimore'] }) }));
  assert.equal(none.length, 0);
  const a = fakeAdminWithAuth(), sent = [];
  const ok = await (await marketActivityHandler(a.client, env, async (url, init) => { sent.push([url, init.headers.Authorization]); return { status: 204 }; })(postAs({ markets: ['baltimore'] }, 'good'))).json();
  assert.equal(ok.refresh, 'started'); assert.equal(sent.length, 1);
  assert.equal(sent[0][1], 'Bearer token', 'the GitHub token is the server\'s, never the driver\'s');
});

test('the app sends the driver\'s sign-in with the ping only when there is one', async () => {
  const payload = { markets: [{ id: 'miami', center: { lat: 25.77, lon: -80.19 }, radiusKm: 60 }] };
  const seen = [], request = async (url, init) => { seen.push(init.headers); return { ok: true, json: async () => ({}) }; };
  const config = { supabaseUrl: 'https://abc.supabase.co', supabasePublishableKey: 'sb_publishable_x' };
  await P.reportActivity(config, payload, 25.77, -80.19, request, 2e12, true, 'Bearer eyJhbGciOi.abc.def');
  await P.reportActivity(config, payload, 25.77, -80.19, request, 2e12, true);
  await P.reportActivity(config, payload, 25.77, -80.19, request, 2e12, true, 'Bearer bad token\r\nX: 1');
  assert.equal(seen[0].Authorization, 'Bearer eyJhbGciOi.abc.def');
  assert.equal(seen[1].Authorization, undefined);
  assert.equal(seen[2].Authorization, undefined, 'malformed values are not sent');
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.match(html, /HomeBaseAccounts\?\.backend\?\.calendarSession\?\.\(\)\)\.catch\(\(\)=>null\)\.then\(session=>HomeBasePublicData\.reportActivity\(globalThis\.HomeBaseConfig,payload,lat,lon,undefined,undefined,false,session\?\.authorization\|\|''\)\)/);
});
