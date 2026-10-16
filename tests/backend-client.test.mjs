import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHomeBaseBackend, progressSnapshot, toEarningsRecord, fromEarningsRecord, CloudConflictError, connectHomeBase } from '../src/backend-client.mjs';

const sample = { id: 'provider:Uber:123', platform: 'Uber', earnings: 40, date: '2026-09-30',
  startedAt: '2026-09-30T16:00:00Z', timePrecision: false, hours: 2,
  hoursType: 'online', payType: 'gross', miles: null, trips: 4, filename: 'uber.csv' };
const fake = (rpc, user = { id: 'alice' }) => ({ auth: { getUser: async () => ({ data: { user }, error: null }) }, rpc });

test('email sign-in requests a link for existing accounts without creating users or claiming a session',async()=>{
  let request;
  const api=createHomeBaseBackend({auth:{signInWithOtp:async args=>{request=args;return {data:{user:null,session:null},error:null};}}});
  const response=await api.sendSignInLink('driver@example.test','https://home-base-drivers.github.io/Home-base-app/');
  assert.deepEqual(request,{email:'driver@example.test',options:{emailRedirectTo:'https://home-base-drivers.github.io/Home-base-app/',shouldCreateUser:false}});
  assert.equal(response.session,null);
});

test('email code verification uses email OTP in the requesting client and requires a session',async()=>{
  let request,calls=0;
  const api=createHomeBaseBackend({auth:{verifyOtp:async args=>{request=args;calls++;return {data:{user:{id:'driver'},session:{user:{id:'driver'}}},error:null};}}});
  await assert.rejects(api.verifyEmailCode('driver@example.test','not-a-code'));assert.equal(calls,0);
  await api.verifyEmailCode('driver@example.test','000000');
  assert.deepEqual(request,{email:'driver@example.test',token:'000000',type:'email'});
  const rejected=createHomeBaseBackend({auth:{verifyOtp:async()=>({error:new Error('Token has expired or is invalid')})}});
  await assert.rejects(rejected.verifyEmailCode('driver@example.test','000000'),/expired/);
  const missing=createHomeBaseBackend({auth:{verifyOtp:async()=>({data:{user:null,session:null},error:null})}});
  await assert.rejects(missing.verifyEmailCode('driver@example.test','000000'),/could not be confirmed/);
});

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
test('dispatch errors preserve safe support identifiers without copying private response fields',async()=>{
 const client={...fake(async()=>({data:{}})),functions:{invoke:async()=>({error:{context:new Response(JSON.stringify({error:'Provider quota unavailable',code:'ai_provider_error',request_id:'support-123',provider_code:'insufficient_quota',private_field:'private data'}),{status:502})}})}};
 const api=createHomeBaseBackend(client);
 await assert.rejects(()=>api.evaluateDispatch({operation:'agent',utterance:'hi'}),e=>{assert.equal(e.code,'ai_provider_error');assert.equal(e.status,502);assert.equal(e.requestId,'support-123');assert.equal(e.providerCode,'insufficient_quota');assert.equal(e.private_field,undefined);return true});
});
test('dispatch preference syncing keeps complete editable settings while withholding destinations',async()=>{
 let saved;
 const api=createHomeBaseBackend({...fake(async()=>({data:{}})),from:name=>({upsert:async row=>{saved={name,row};return{data:row};}})});
 await api.saveDispatchState({mode:'DIAMOND MODE',minimumMile:1.2,maxShiftHours:6,acceptanceTarget:90,driverName:'Chris',radioCue:true,paidRepositioning:true});
 assert.equal(saved.name,'driver_dispatch_state');assert.equal(saved.row.settings.maxShiftHours,6);
 await assert.rejects(api.saveDispatchState({destination:[39,-76]}));
});
