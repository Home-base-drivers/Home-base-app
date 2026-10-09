import test from 'node:test';
import assert from 'node:assert/strict';
import {checkUpdateReady, validatePush} from './check-update-ready.mjs';
const sha = 'a'.repeat(40), newer = 'b'.repeat(40), zero = '0'.repeat(40);
function fixture(change = () => null) {
  const seen = [], counts = new Map();
  const request = async value => {
    const url = new URL(value), key = url.pathname + url.search, count = (counts.get(key) || 0) + 1;
    counts.set(key, count); seen.push(url);
    const override = change(url, count);
    if (override?.http) return {ok: false, status: override.http};
    const body = override ?? (url.pathname.endsWith('/git/ref/heads/main') ? {object: {sha}} : url.pathname.includes('/workflows/pages.yml/') ? {workflow_runs: [{head_sha: sha, status: 'completed', conclusion: 'success'}]} : {total_count: 0, workflow_runs: []});
    return {ok: true, json: async () => body};
  };
  return {request, seen};
}
test('an idle repository with a finished deployment permits the exact checked main head', async () => {
  const f = fixture(), result = await checkUpdateReady(sha, f.request);
  assert.deepEqual(result, {head: sha, previousConclusion: 'success'});
  assert.equal(f.seen.filter(u => u.pathname.endsWith('/git/ref/heads/main')).length, 2);
});
test('every processing state blocks submission regardless of which owner started it', async () => {
  for (const status of ['queued', 'in_progress', 'waiting', 'pending', 'requested']) for (const owner of ['chrisbrouard', 'ellyg1625']) {
    const f = fixture(url => url.searchParams.get('status') === status ? {total_count: 1, workflow_runs: [{name: 'Home Base update', status, actor: {login: owner}}]} : null);
    await assert.rejects(checkUpdateReady(sha, f.request), new RegExp(owner));
  }
});
test('a run appearing during the check and a racing main update both block publication', async () => {
  const lateRun = fixture((url, count) => url.searchParams.get('status') === 'queued' && count === 2 ? {total_count: 1, workflow_runs: [{status: 'queued'}]} : null);
  await assert.rejects(checkUpdateReady(sha, lateRun.request), /Update processing/);
  const changed = fixture((url, count) => url.pathname.endsWith('/git/ref/heads/main') && count === 2 ? {object: {sha: newer}} : null);
  await assert.rejects(checkUpdateReady(sha, changed.request), /Main changed/);
});
test('missing or unfinished deployment registration and unknown API results fail closed', async () => {
  for (const value of [{workflow_runs: []}, {workflow_runs: [{head_sha: sha, status: 'queued'}]}, {workflow_runs: [{head_sha: sha, status: 'completed', conclusion: null}]}, {}]) {
    const f = fixture(url => url.pathname.includes('/workflows/pages.yml/') ? value : null);
    await assert.rejects(checkUpdateReady(sha, f.request), /deployment|processing/);
  }
  await assert.rejects(checkUpdateReady(sha, fixture(() => ({http: 403})).request), /Submission blocked/);
  await assert.rejects(checkUpdateReady(sha, fixture(url => url.searchParams.has('status') ? {} : null).request), /Incomplete workflow/);
});
test('a completed failed run is reported and does not prevent an idle corrective update', async () => {
  const f = fixture(url => url.pathname.includes('/workflows/pages.yml/') ? {workflow_runs: [{head_sha: sha, status: 'completed', conclusion: 'failure'}]} : null);
  assert.equal((await checkUpdateReady(sha, f.request)).previousConclusion, 'failure');
});
test('push validation rejects deletion and stale replacement while accepting new or descendant refs', () => {
  assert.throws(() => validatePush([`HEAD ${zero} refs/heads/main ${sha}`], () => true), /Deleting/);
  assert.throws(() => validatePush([`HEAD ${newer} refs/heads/main ${sha}`], () => false), /Non-fast-forward/);
  assert.doesNotThrow(() => validatePush([`HEAD ${newer} refs/heads/main ${sha}`], () => true));
  assert.doesNotThrow(() => validatePush([`HEAD ${newer} refs/heads/feature ${zero}`], () => false));
});
test('the data-only live signals refresh does not block owner updates, but any other run still does', async () => {
  const dataRun = {name: 'Refresh live demand signals', path: '.github/workflows/live-signals.yml', status: 'in_progress'};
  const idleWithData = fixture(url => url.searchParams.get('status') === 'in_progress' ? {total_count: 1, workflow_runs: [dataRun]} : null);
  assert.equal((await checkUpdateReady(sha, idleWithData.request)).head, sha);
  const busy = fixture(url => url.searchParams.get('status') === 'queued' ? {total_count: 2, workflow_runs: [dataRun, {name: 'Deploy Home Base to GitHub Pages', path: '.github/workflows/pages.yml', status: 'queued'}]} : null);
  await assert.rejects(checkUpdateReady(sha, busy.request), /Deploy Home Base/);
  const lookalike = fixture(url => url.searchParams.get('status') === 'queued' ? {total_count: 1, workflow_runs: [{name: 'x', path: '.github/workflows/live-signals.yml.bak', status: 'queued'}]} : null);
  await assert.rejects(checkUpdateReady(sha, lookalike.request), /Update processing/);
});
