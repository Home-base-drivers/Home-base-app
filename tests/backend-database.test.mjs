import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

// Real PostgreSQL execution in WASM. Supabase's Auth role/UID contract is
// emulated here; live REST/Auth verification still runs after provisioning.
const alice = '10000000-0000-4000-8000-000000000001';
const bob = '10000000-0000-4000-8000-000000000002';
let db;
before(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
  const migrations = (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort();
  for (const migration of migrations) await db.exec(await readFile(new URL('../supabase/migrations/' + migration, import.meta.url), 'utf8'));
  await db.query('insert into auth.users values ($1),($2)', [alice, bob]);
});
after(async () => { await db?.close(); });

test('optional telemetry requires consent and is isolated from other drivers', async () => {
  await as('authenticated', alice, async () => {
    await assert.rejects(db.query("insert into public.usage_events(user_id,event_name,surface) values ($1,'view_map','map')",[alice]),{code:'42501'});
    await db.query('select public.set_home_base_privacy(true,true,false)');
    await db.query("insert into public.usage_events(user_id,event_name,surface,recorded_at) values ($1,'view_map','map','2000-01-01')",[alice]);
    const rows=(await db.query('select * from public.usage_events')).rows;
    assert.equal(rows.length,1);
    assert.ok(new Date(rows[0].recorded_at).getTime()>Date.now()-60000);
    await assert.rejects(db.query("insert into public.usage_events(user_id,event_name,surface) values ($1,'view_map','map')",[bob]),{code:'42501'});
    await assert.rejects(db.query("insert into public.consent_receipts(user_id,choices,policy_version) values ($1,'{}','forged')",[alice]),{code:'42501'});
    await assert.rejects(db.query("insert into public.subscriptions(user_id,plan,status) values ($1,'plus','active')",[alice]),{code:'42501'});
  });
  await as('authenticated',bob,async()=>assert.equal((await db.query('select * from public.usage_events')).rows.length,0));
});

test('predictions cannot be backfilled and consent withdrawal deletes optional history', async () => {
  await as('authenticated',alice,async()=>{
    await db.query('select public.set_home_base_privacy(true,true,false)');
    const sql=`insert into public.model_predictions(user_id,prediction_id,model_version,area,platform,horizon_minutes,forecast_for,gross_hourly_estimate,input_status)
      values ($1,$2,'test','Midtown','Uber',15,$3,30,'modeled')`;
    await assert.rejects(db.query(sql,[alice,'30000000-0000-4000-8000-000000000001','2000-01-01']),{code:'23514'});
    await db.query(sql,[alice,'30000000-0000-4000-8000-000000000002',new Date(Date.now()+15*60000).toISOString()]);
    await assert.rejects(db.query('update public.model_predictions set gross_hourly_estimate=100 where user_id=$1',[alice]),{code:'42501'});
    await db.query(`insert into public.shift_observations(user_id,observation_id,shift_id,area,observed_at) values ($1,$2,$3,'Midtown',now())`,
      [alice,'40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001']);
    await db.query('select public.set_home_base_privacy(false,false,false)');
    for(const table of ['usage_events','model_predictions','shift_observations'])assert.equal((await db.query('select * from public.'+table)).rows.length,0);
    assert.ok((await db.query('select * from public.consent_receipts')).rows.length>=2);
    await assert.rejects(db.query(sql,[alice,'30000000-0000-4000-8000-000000000003',new Date(Date.now()+15*60000).toISOString()]),{code:'42501'});
  });
});

async function as(role, id, action) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || '']);
  try { return await action(); } finally { await db.exec('reset role'); }
}
const row = (id, changes = {}) => ({
  record_id: id, platform: 'Uber', local_date: '2026-09-30', amount: 40,
  pay_type: 'gross', hours: 2, hours_type: 'online', source: 'csv', trip_count: 4, ...changes
});
const save = records => db.query('select public.upsert_home_base_earnings($1::jsonb) as result', [JSON.stringify(records)]);

test('anonymous clients cannot read private tables or invoke mutations', async () => {
  await as('anon', null, async () => {
    for (const table of ['profiles', 'user_state', 'progress_events', 'trip_uploads', 'trip_rows', 'earnings_records', 'account_connections']) {
      await assert.rejects(db.query(`select * from public.${table}`), { code: '42501' });
    }
    await assert.rejects(save([row('anon')]), { code: '42501' });
    await assert.rejects(db.query("select public.save_home_base_state('{}',0,'Baltimore')"), { code: '42501' });
    await assert.rejects(db.query('select public.delete_my_home_base_data()'), { code: '42501' });
  });
});

test('earnings are private per driver; a guessed driver ID cannot reassign rows', async () => {
  await as('authenticated', alice, () => save([row('private-a')]));
  await as('authenticated', bob, async () => {
    assert.equal((await db.query('select * from public.earnings_records')).rows.length, 0);
    await assert.rejects(db.query(`insert into public.earnings_records
      (user_id,record_id,platform,amount,pay_type,hours_type,source) values ($1,'bad','Uber',9,'gross','unknown','csv')`, [alice]), { code: '42501' });
  });
  await as('authenticated', alice, async () => {
    await assert.rejects(db.query('update public.earnings_records set user_id=$1 where record_id=$2', [bob, 'private-a']), { code: '42501' });
  });
});

test('repeat CSV imports are idempotent and a stable-ID correction updates one row', async () => {
  await as('authenticated', alice, async () => {
    assert.deepEqual((await save([row('repeat')])).rows[0].result, { saved: 1, unchanged: 0, protected: 0, total: 1 });
    assert.equal((await save([row('repeat')])).rows[0].result.unchanged, 1);
    assert.equal((await save([row('repeat', { amount: 45 })])).rows[0].result.saved, 1);
    const records = (await db.query("select amount from public.earnings_records where record_id='repeat'")).rows;
    assert.equal(records.length, 1);
    assert.equal(Number(records[0].amount), 45);
  });
});

test('invalid import rows roll back the complete batch', async () => {
  await as('authenticated', alice, async () => {
    await assert.rejects(save([row('rollback-ok'), row('rollback-bad', { hours: -1 })]), { code: '23514' });
    assert.equal((await db.query("select * from public.earnings_records where record_id like 'rollback-%'")).rows.length, 0);
    await assert.rejects(save([row('duplicate'), row('duplicate')]), { code: '22023' });
    await assert.rejects(save([row('invalid-owner', { user_id: bob })]), { code: '22023' });
  });
});

test('a driver cannot fabricate a provider connection or verified provider record', async () => {
  await as('authenticated', alice, async () => {
    await assert.rejects(save([row('fake', { source: 'provider' })]), { code: '22023' });
    await assert.rejects(db.query(`insert into public.account_connections(user_id,platform,provider,status)
      values ($1,'Uber','argyle','connected')`, [alice]), { code: '42501' });
    await assert.rejects(db.query(`insert into public.earnings_records
      (user_id,record_id,platform,amount,pay_type,hours_type,source) values ($1,'fake-direct','Uber',9,'gross','unknown','provider')`, [alice]), { code: '42501' });
  });
});

test('server-managed records are visible only to their owner and CSVs cannot overwrite them', async () => {
  await as('service_role', null, () => db.query(`insert into public.earnings_records
    (user_id,record_id,platform,amount,pay_type,hours_type,source)
    values ($1,'provider:Uber:real','Uber',99,'gross','unknown','provider')`, [alice]));
  await as('authenticated', alice, async () => {
    const res = (await save([row('provider:Uber:real', { amount: 1 })])).rows[0].result;
    assert.equal(res.protected, 1);
    assert.equal(res.saved, 0);
    assert.equal(Number((await db.query("select amount from public.earnings_records where record_id='provider:Uber:real'")).rows[0].amount), 99);
  });
  await as('authenticated', bob, async () => {
    assert.equal((await db.query("select * from public.earnings_records where source='provider'")).rows.length, 0);
  });
});

test('progress detects a stale second device and preserves the newer saved version', async () => {
  await as('authenticated', alice, async () => {
    const first = (await db.query("select public.save_home_base_state($1,0,'Baltimore') as result", [JSON.stringify({ homeBaseMapUi: { heat: true } })])).rows[0].result;
    assert.equal(first.version, 1);
    const second = (await db.query("select public.save_home_base_state($1,1,'Baltimore') as result", [JSON.stringify({ homeBaseMapUi: { heat: false } })])).rows[0].result;
    assert.equal(second.version, 2);
    await assert.rejects(db.query("select public.save_home_base_state('{}',1,'Baltimore')"), { code: '40001' });
    await assert.rejects(db.query("select public.save_home_base_state('{\"access_token\":\"secret\"}',2,'Baltimore')"), { code: '22023' });
    const state = (await db.query('select state,version from public.user_state')).rows[0];
    assert.deepEqual(state.state, { homeBaseMapUi: { heat: false } });
    assert.equal(Number(state.version), 2);
  });
  await as('authenticated', bob, async () => {
    assert.equal((await db.query('select * from public.user_state')).rows.length, 0);
  });
});

test('a trip cannot be attached to another driver\'s upload', async () => {
  const upload = '90000000-0000-4000-8000-000000000001';
  await as('authenticated', bob, () => db.query(`insert into public.trip_uploads(id,user_id,filename,market)
    values ($1,$2,'bob.csv','Baltimore')`, [upload, bob]));
  await as('authenticated', alice, async () => {
    await assert.rejects(db.query(`insert into public.trip_rows(user_id,upload_id,market,gross_earnings)
      values ($1,$2,'Baltimore',10)`, [alice, upload]), { code: '23503' });
  });
});

test('benchmarks require consent, five users, twenty trips, and online hours', async () => {
  const date = (await db.query("select now()-interval '1 day' as t")).rows[0].t;
  const stamp = new Date(date).toISOString();
  const parts = (await db.query(`select extract(dow from $1::timestamptz at time zone 'America/New_York')::integer as day,
    extract(hour from $1::timestamptz at time zone 'America/New_York')::integer as hour`, [stamp])).rows[0];
  const users = Array.from({ length: 5 }, (_, i) => `20000000-0000-4000-8000-00000000000${i + 1}`);
  for (const [i, id] of users.entries()) {
    await db.query('insert into auth.users values ($1)', [id]);
    await as('authenticated', id, async () => {
      await db.query('insert into public.profiles(id,benchmark_consent) values ($1,$2)', [id, i < 4]);
      await save([row('benchmark', { local_date: null, started_at: stamp, time_precision: true, amount: 60, hours: 2 })]);
    });
  }
  const benchmark = () => db.query("select * from public.get_market_hourly_benchmark('Baltimore',$1,$2)", [parts.day, parts.hour]);
  await as('authenticated', alice, async () => assert.equal((await benchmark()).rows.length, 0));
  await as('authenticated', users[4], () => db.query('update public.profiles set benchmark_consent=true'));
  await as('authenticated', users[0], () => save([
    row('active-excluded', { started_at: stamp, time_precision: true, amount: 100000, hours: 1, hours_type: 'active' }),
    row('payout-excluded', { started_at: stamp, time_precision: true, amount: 100000, hours: 1, pay_type: 'payout' }),
    row('delivery-excluded', { started_at: stamp, time_precision: true, amount: 100000, hours: 1, platform: 'Uber Eats' })
  ]));
  await as('authenticated', alice, async () => {
    const data = (await benchmark()).rows[0];
    assert.equal(Number(data.gross_per_hour), 30);
    assert.equal(Number(data.contributing_users), 5);
    assert.equal(Number(data.trip_count), 20);
    assert.equal(Number(data.sample_hours), 10);
  });
});

test('cloud data deletion affects only the authenticated driver', async () => {
  await as('authenticated', bob, () => save([row('bob-kept')]));
  await as('authenticated', alice, () => db.query('select public.delete_my_home_base_data()'));
  await as('authenticated', alice, async () => assert.equal((await db.query('select * from public.earnings_records')).rows.length, 0));
  await as('authenticated', bob, async () => assert.equal((await db.query("select * from public.earnings_records where record_id='bob-kept'")).rows.length, 1));
});

test('cloud deletion cannot pretend a connected platform was revoked', async () => {
  await as('authenticated', bob, () => save([row('linked-kept')]));
  await as('service_role', null, () => db.query(`insert into public.account_connections
    (user_id,platform,provider,status) values ($1,'Uber','test-adapter','connected')`, [bob]));
  await as('authenticated', bob, async () => {
    await assert.rejects(db.query('select public.delete_my_home_base_data()'), { code: '55000' });
    await db.query('delete from public.account_connections');
    assert.equal((await db.query('select * from public.account_connections')).rows.length, 1);
    assert.equal((await db.query("select * from public.earnings_records where record_id='linked-kept'")).rows.length, 1);
  });
  await as('service_role', null, () => db.query("update public.account_connections set status='disconnected' where user_id=$1", [bob]));
  await as('authenticated', bob, async () => {
    await db.query('select public.delete_my_home_base_data()');
    assert.equal((await db.query('select * from public.account_connections')).rows.length, 0);
  });
});

test('all exposed tables have RLS; privileged benchmark code stays outside public', async () => {
  const tables = (await db.query(`select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'`)).rows;
  assert.ok(tables.length >= 7);
  assert.ok(tables.every(r => r.relrowsecurity));
  const exposedDefiners = (await db.query(`select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef`)).rows;
  assert.deepEqual(exposedDefiners, []);
});

test('sponsorship is server-managed and only current approved inventory is public', async () => {
  await as('service_role', null, () => db.query(`insert into public.sponsor_campaigns(advertiser,headline,description,destination_url,active,starts_at,ends_at)
    values ('Synthetic sponsor','Active offer','Test only','https://example.com/offer',true,now()-interval '1 day',now()+interval '1 day'),
    ('Synthetic sponsor','Inactive offer','Test only','https://example.com/offer',false,now()-interval '1 day',now()+interval '1 day')`));
  await as('anon',null,async()=>assert.deepEqual((await db.query('select headline from public.sponsor_campaigns')).rows,[{headline:'Active offer'}]));
  await as('authenticated',alice,async()=>await assert.rejects(db.query("update public.sponsor_campaigns set active=true"),{code:'42501'}));
});

test('retention deletes old learning records while keeping fresh observations', async () => {
  await as('authenticated',alice,async()=>{
    await db.query('select public.set_home_base_privacy(true,true,false)');
    await db.query("insert into public.usage_events(user_id,event_name,surface) values ($1,'view_map','map')",[alice]);
    await assert.rejects(db.query('select private.prune_home_base_learning()'),{code:'42501'});
  });
  await db.query("update public.usage_events set recorded_at=now()-interval '91 days' where user_id=$1",[alice]);
  await as('authenticated',alice,()=>db.query("insert into public.usage_events(user_id,event_name,surface) values ($1,'view_profile','profile')",[alice]));
  await as('service_role',null,()=>db.query('select private.prune_home_base_learning()'));
  assert.deepEqual((await db.query('select event_name from public.usage_events where user_id=$1',[alice])).rows,[{event_name:'view_profile'}]);
});
