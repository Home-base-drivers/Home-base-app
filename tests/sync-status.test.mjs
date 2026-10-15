import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {syncStatus, SYNC_KEYS as K} from '../src/backend-client.mjs';

const store = entries => ({ getItem: key => (key in entries ? String(entries[key]) : null) });
const NOW = Date.parse('2026-10-15T12:00:00Z');
const linked = {[K.owner]:'user-1', [K.version]:'7'};

test('signed out is reported even when a previous link is remembered', () => {
  const s = syncStatus(store({...linked, [K.enabled]:'true', [K.syncedAt]:NOW-60000}), {signedIn:false}, NOW);
  assert.equal(s.state, 'signed-out');
  assert.match(s.detail, /stay on this device/);
});

test('an in-flight sync outranks every other state', () => {
  for (const session of [{signedIn:true, busy:true}, {signedIn:false, busy:true}]) {
    assert.equal(syncStatus(store({...linked, [K.failedAt]:NOW}), session, NOW).state, 'syncing');
  }
});

test('saving disabled is distinguished from never linked', () => {
  const never = syncStatus(store({}), {signedIn:true}, NOW);
  assert.equal(never.state, 'disabled');
  assert.match(never.detail, /Not linked yet/);
  const off = syncStatus(store({...linked, [K.enabled]:'false'}), {signedIn:true}, NOW);
  assert.equal(off.state, 'disabled');
  assert.match(off.detail, /Automatic saving is off/);
});

test('a saved state reports when it last succeeded', () => {
  const s = syncStatus(store({...linked, [K.enabled]:'true', [K.syncedAt]:NOW-120000}), {signedIn:true}, NOW);
  assert.equal(s.state, 'saved');
  assert.equal(s.lastSaved, '2 minutes ago');
  assert.match(s.detail, /Saved to your account 2 minutes ago\./);
});

// The point of the state machine: a failure must not be papered over by an
// older success, or the driver is told their records are safe when they are not.
test('a failure newer than the last success keeps the failed state', () => {
  const s = syncStatus(store({...linked, [K.enabled]:'true',
    [K.syncedAt]:NOW-600000, [K.failedAt]:NOW-1000, [K.failure]:'error'}), {signedIn:true}, NOW);
  assert.equal(s.state, 'failed');
  assert.match(s.detail, /did not finish/);
});

test('a success after a failure clears the failed state', () => {
  const s = syncStatus(store({...linked, [K.enabled]:'true',
    [K.syncedAt]:NOW-1000, [K.failedAt]:NOW-600000, [K.failure]:'error'}), {signedIn:true}, NOW);
  assert.equal(s.state, 'saved');
});

test('a conflict says plainly that nothing was overwritten', () => {
  const s = syncStatus(store({...linked, [K.enabled]:'true', [K.failedAt]:NOW, [K.failure]:'conflict'}), {signedIn:true}, NOW);
  assert.equal(s.state, 'failed');
  assert.match(s.detail, /newer records/);
  assert.match(s.detail, /nothing was overwritten/);
});

test('unreadable or absent storage degrades to signed out, never to saved', () => {
  const throwing = { getItem: () => { throw Error('blocked'); } };
  for (const storage of [throwing, undefined, null, {}]) {
    assert.equal(syncStatus(storage, {signedIn:false}, NOW).state, 'signed-out');
    assert.notEqual(syncStatus(storage, {signedIn:true}, NOW).state, 'saved');
  }
});

test('relative wording covers minutes, hours and older saves', () => {
  const at = ms => syncStatus(store({...linked, [K.enabled]:'true', [K.syncedAt]:NOW-ms}), {signedIn:true}, NOW).lastSaved;
  assert.equal(at(10000), 'just now');
  assert.equal(at(60000), 'a minute ago');
  assert.equal(at(3600000), 'an hour ago');
  assert.equal(at(5*3600000), '5 hours ago');
  assert.match(at(5*86400000), /^on /);
});

test('the shipped screens derive status instead of asserting it', async () => {
  const growth = await readFile(new URL('../dist/homebase-growth.js', import.meta.url), 'utf8');
  const planner = await readFile(new URL('../dist/homebase-planner.js', import.meta.url), 'utf8');
  const bundle = await readFile(new URL('../dist/homebase-backend.js', import.meta.url), 'utf8');
  assert.ok(bundle.includes('syncStatus'), 'built bundle must expose syncStatus');
  // The old fixed claim must be gone from the backup card.
  assert.ok(!planner.includes('Cloud backup is not connected'));
  assert.match(planner, /syncStatus\(localStorage,globalThis\.HomeBaseCloudState\|\|\{\}\)/);
  assert.match(growth, /markSynced\(\)/);
  assert.match(growth, /markFailed\(conflict\?'conflict':'error'\)/);
  assert.match(growth, /growth-sync-'\+syncState\(\)\.state/);
  // The reassurance stays, as ordinary text.
  assert.ok(growth.includes('No Uber/Lyft passwords are collected here.'));
});

test('the reassurance is no longer styled as a warning', async () => {
  const css = await readFile(new URL('../dist/homebase-growth.css', import.meta.url), 'utf8');
  assert.ok(!/\.growth-note\{[^}]*#edce8b/.test(css), 'amber caution colour must be gone');
  assert.match(css, /\.growth-account \.growth-note\{[^}]*color:#9db9c9\}/);
});
