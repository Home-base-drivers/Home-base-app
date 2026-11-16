import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

// Least-privilege grants (security review 2026-11-15). Supabase gives anon and
// authenticated every privilege on new public tables by default; this emulates that
// default so the replay here reproduces the live grants exactly, then checks the
// hardening migration and its rollback.
const HARDENING = '20261116000000_least_privilege_grants.sql';
const dir = new URL('../supabase/migrations/', import.meta.url);
const rollback = () => readFile(new URL('../supabase/rollbacks/20261116000000_least_privilege_grants.rollback.sql', import.meta.url), 'utf8');
const live = JSON.parse(await readFile(new URL('./fixtures/live-grants-2026-11-15.json', import.meta.url), 'utf8')).grants;
const alice = '10000000-0000-4000-8000-000000000001', bob = '10000000-0000-4000-8000-000000000002';

async function database({ harden = true } = {}) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, phone_confirmed_at timestamptz, is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;`);
  for (const f of (await readdir(dir)).filter(f => f.endsWith('.sql') && (harden || f !== HARDENING)).sort()) await db.exec(await readFile(new URL(f, dir), 'utf8'));
  await db.query('insert into auth.users(id) values ($1),($2)', [alice, bob]);
  return db;
}
const grants = async db => (await db.query(`select grantee, table_name, string_agg(privilege_type, ',' order by privilege_type) privs
  from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated')
  group by grantee, table_name order by table_name, grantee`)).rows;
async function as(db, role, user, fn) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user || '']);
  try { return await fn(); } finally { await db.exec('reset role'); }
}

test('before the fix, the repository replays exactly the grants the live project has', async () => {
  const db = await database({ harden: false });
  assert.deepEqual(await grants(db), live);
  await db.close();
});

test('no client role can truncate, add triggers to or reference any public table', async () => {
  const db = await database();
  const bad = (await grants(db)).filter(g => /TRUNCATE|TRIGGER|REFERENCES/.test(g.privs));
  assert.deepEqual(bad, []);
  await as(db, 'authenticated', alice, async () => {
    await assert.rejects(db.query('truncate public.trip_rows'), { code: '42501' });
    await assert.rejects(db.query('truncate public.homebase_agent_memory'), { code: '42501' });
  });
  // A table added later does not pick the privileges up from the defaults either.
  await db.exec('create table public.later_table(id int primary key)');
  const later = (await grants(db)).filter(g => g.table_name === 'later_table').map(g => g.privs);
  assert.ok(later.length && later.every(p => !/TRUNCATE|TRIGGER|REFERENCES/.test(p)), later.join(' | '));
  await db.close();
});

test('the signed-out role can only read public reference data', async () => {
  const db = await database();
  const anon = (await grants(db)).filter(g => g.grantee === 'anon');
  assert.deepEqual(anon, [
    { grantee: 'anon', table_name: 'platform_capabilities', privs: 'SELECT' },
    { grantee: 'anon', table_name: 'platform_service_areas', privs: 'SELECT' },
    { grantee: 'anon', table_name: 'sponsor_campaigns', privs: 'SELECT' }]);
  await as(db, 'anon', null, async () => {
    assert.ok((await db.query('select * from public.platform_capabilities')).rows.length > 0);
    await assert.rejects(db.query("update public.platform_capabilities set supported=true"), { code: '42501' });
    await assert.rejects(db.query('select * from public.homebase_agent_memory'), { code: '42501' });
  });
  await db.close();
});

test('AI memory and turns: drivers read their own, only the server writes', async () => {
  const db = await database();
  await db.exec('set role service_role');
  await db.query("insert into public.homebase_agent_memory(user_id,memory_key,memory_type,content,source) values ($1,'goal','goal','{\"summary\":\"$300 days\"}','agent_learning'),($2,'goal','goal','{}','agent_learning')", [alice, bob]);
  await db.query("insert into public.homebase_agent_turns(user_id,conversation_id,role,content) values ($1,'c1','assistant','hi')", [alice]);
  await db.query("update public.homebase_agent_memory set active=false where user_id=$1 and memory_key='goal'", [bob]);
  await db.exec('reset role');
  await as(db, 'authenticated', alice, async () => {
    assert.deepEqual((await db.query('select memory_key from public.homebase_agent_memory')).rows, [{ memory_key: 'goal' }]);
    assert.equal((await db.query('select * from public.homebase_agent_turns')).rows.length, 1);
    await assert.rejects(db.query("insert into public.homebase_agent_memory(user_id,memory_key,memory_type,content) values ($1,'x','fact','{}')", [alice]), { code: '42501' });
    await assert.rejects(db.query("update public.homebase_agent_memory set content='{\"summary\":\"planted\"}'"), { code: '42501' });
    await assert.rejects(db.query('delete from public.homebase_agent_memory'), { code: '42501' });
    await assert.rejects(db.query("insert into public.homebase_agent_turns(user_id,conversation_id,role,content) values ($1,'c1','assistant','fake')", [alice]), { code: '42501' });
    await assert.rejects(db.query("update public.homebase_agent_turns set role='assistant'"), { code: '42501' });
  });
  await as(db, 'authenticated', bob, async () => {
    assert.equal((await db.query('select * from public.homebase_agent_turns')).rows.length, 0, 'other drivers stay invisible');
  });
  const policies = (await db.query("select tablename, policyname, roles::text, cmd from pg_policies where tablename in ('homebase_agent_memory','homebase_agent_turns') order by 1")).rows;
  assert.deepEqual(policies, [
    { tablename: 'homebase_agent_memory', policyname: 'agent_memory_own_read', roles: '{authenticated}', cmd: 'SELECT' },
    { tablename: 'homebase_agent_turns', policyname: 'agent_turns_own_read', roles: '{authenticated}', cmd: 'SELECT' }]);
  await db.close();
});

test('everyday driver writes still work after the fix', async () => {
  const db = await database();
  await as(db, 'authenticated', alice, async () => {
    await db.query("insert into public.user_state(user_id,state) values ($1,'{}') on conflict (user_id) do update set state=excluded.state", [alice]);
    await db.query("update public.user_state set market='Washington DC'");
    assert.equal((await db.query('select * from public.user_state')).rows.length, 1);
    await db.query('select public.delete_my_home_base_data()');
    assert.equal((await db.query('select * from public.user_state')).rows.length, 0);
  });
  await db.close();
});

test('the rollback restores the live grants exactly, and the fix can be applied again', async () => {
  const db = await database();
  const hardened = await grants(db);
  await db.exec(await rollback());
  assert.deepEqual(await grants(db), live);
  await db.exec(await readFile(new URL(HARDENING, dir), 'utf8'));
  assert.deepEqual(await grants(db), hardened);
  await db.close();
});

test('the dispatch server writes AI memory and turns with the service role, for the verified driver', async () => {
  const src = await readFile(new URL('../supabase/functions/dispatch/index.ts', import.meta.url), 'utf8');
  for (const name of ['saveTurn', 'forgetMemories', 'upsertMemories']) {
    const line = src.split('\n').find(l => l.trimStart().startsWith(name + ':'));
    assert.ok(line, name);
    assert.match(line, /await usageDb\.from\('homebase_agent_(turns|memory)'\)/, name + ' must use the service-role client');
  }
  assert.match(src, /const usageDb=createClient\(Deno\.env\.get\('SUPABASE_URL'\)!,Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)!/);
  const handler = await readFile(new URL('../supabase/functions/dispatch/handler.mjs', import.meta.url), 'utf8');
  assert.match(handler, /user=await authenticate\(token\)/);
  assert.match(handler, /userId:user\.id/, 'the agent works for the signed-in driver, never an id from the request body');
});
