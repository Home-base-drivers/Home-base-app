import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHomeBaseBackend, progressSnapshot, toEarningsRecord, fromEarningsRecord, CloudConflictError, connectHomeBase } from '../src/backend-client.mjs';

const sample = { id: 'provider:Uber:123', platform: 'Uber', earnings: 40, date: '2026-09-30',
  startedAt: '2026-09-30T16:00:00Z', timePrecision: false, hours: 2,
  hoursType: 'online', payType: 'gross', miles: null, trips: 4, filename: 'uber.csv' };
const fake = (rpc, user = { id: 'alice' }) => ({ auth: { getUser: async () => ({ data: { user }, error: null }) }, rpc });

test('cloud snapshots exclude earnings copies, credentials, GPS, and diagnostic logs', () => {
  const values = { homeBaseMapUi: '{"heat":true}', homeBaseDriverProfile: '{"name":"Driver"}',
    homeBaseLedger: '[1]', 'home-base-auth': '{"access_token":"private"}', driverRouterLocation: '[39,-76]', homeBaseErrorLog: '[]' };
  const snapshot = progressSnapshot({ getItem: key => values[key] ?? null });
  assert.deepEqual(snapshot, { homeBaseDriverProfile: { name: 'Driver' }, homeBaseMapUi: { heat: true } });
});

test('date-only records retain date precision; active time and payouts remain distinct', () => {
  const db = toEarningsRecord({ ...sample, hoursType: 'active', payType: 'payout' });
  assert.equal(db.started_at, null);
  assert.equal(db.time_precision, false);
  assert.equal(db.hours_type, 'active');
  assert.equal(db.pay_type, 'payout');
  assert.equal(fromEarningsRecord(db).hoursType, 'active');
  assert.ok(!Object.hasOwn(db, 'user_id'));
  assert.throws(() => toEarningsRecord(sample, { source: 'provider' }));
  assert.throws(() => toEarningsRecord({ ...sample, date: '2026-02-30' }));
});

test('imports validate every record before transmitting and do not send malformed rows', async () => {
  let calls = 0;
  const api = createHomeBaseBackend(fake(async () => { calls++; }));
  await assert.rejects(api.saveEarnings([sample, { ...sample, id: 'bad', earnings: NaN }]));
  assert.equal(calls, 0);
});

test('imports split into bounded batches without passing a caller-supplied driver ID', async () => {
  const batches = [];
  const api = createHomeBaseBackend(fake(async (name, args) => {
    assert.equal(name, 'upsert_home_base_earnings');
    batches.push(args.p_records);
    return { data: { saved: args.p_records.length, unchanged: 0, protected: 0, total: args.p_records.length } };
  }));
  const rows = Array.from({ length: 501 }, (_, i) => ({ ...sample, id: 'csv:' + i, user_id: 'bob' }));
  assert.equal((await api.saveEarnings(rows)).saved, 501);
  assert.deepEqual(batches.map(r => r.length), [500, 1]);
  assert.ok(batches.flat().every(r => !Object.hasOwn(r, 'user_id')));
});

test('stale progress raises a conflict that the interface must resolve explicitly', async () => {
  const api = createHomeBaseBackend(fake(async () => ({ error: { code: '40001' } })));
  await assert.rejects(api.saveProgress({ homeBaseMapUi: {} }, 1), CloudConflictError);
});

test('missing and anonymous sessions cannot send private data', async () => {
  for (const user of [null, { id: 'anonymous', is_anonymous: true }]) {
    let calls = 0;
    const api = createHomeBaseBackend(fake(async () => { calls++; }, user));
    await assert.rejects(api.saveEarnings([sample]));
    await assert.rejects(api.saveProgress({}, 0));
    assert.equal(calls, 0);
  }
});

test('frontend initialization refuses server keys and incomplete configuration', () => {
  assert.throws(() => connectHomeBase({ supabaseUrl: 'https://test.supabase.co', supabasePublishableKey: 'sb_secret_private' }));
  assert.throws(() => connectHomeBase({}));
});
