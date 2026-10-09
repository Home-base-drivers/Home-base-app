import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const REPOSITORY = 'Home-base-drivers/Home-base-app';
const ACTIVE = ['queued', 'in_progress', 'waiting', 'pending', 'requested'];
const SHA = /^[a-f0-9]{40}$/;
const ZERO = '0'.repeat(40);
// The live data refresh only replaces the machine-owned `signals` branch. It
// never changes main or Pages, so it cannot overwrite an owner's update.
const DATA_ONLY = /(^|\/)\.github\/workflows\/live-signals\.yml(@.*)?$/;
export const blockingRuns = runs => runs.filter(run => !DATA_ONLY.test(run?.path || ''));

export async function checkUpdateReady(expectedHead, request = fetch) {
  if (!SHA.test(expectedHead || '') || expectedHead === ZERO) throw Error('Supply the fetched main SHA with --expected-head.');
  const headers = {Accept: 'application/vnd.github+json', 'Cache-Control': 'no-cache', 'User-Agent': 'HomeBase-update-guard', 'X-GitHub-Api-Version': '2022-11-28'};
  if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
  const get = async path => {
    const response = await request(`https://api.github.com/repos/${REPOSITORY}/${path}`, {headers, cache: 'no-store', signal: AbortSignal.timeout(12_000)});
    if (!response.ok) throw Error(`GitHub status unavailable (HTTP ${response.status}). Submission blocked.`);
    return response.json();
  };
  const head = async () => {
    const value = (await get('git/ref/heads/main'))?.object?.sha;
    if (!SHA.test(value || '')) throw Error('Cannot verify main. Submission blocked.');
    if (value !== expectedHead) throw Error('Main changed. Fetch and integrate the other update before submitting.');
  };
  const idle = async () => {
    const responses = await Promise.all(ACTIVE.map(status => get(`actions/runs?status=${status}&per_page=100`)));
    for (const response of responses) {
      if (!Number.isInteger(response.total_count) || !Array.isArray(response.workflow_runs)) throw Error('Incomplete workflow status. Submission blocked.');
      const blocking = blockingRuns(response.workflow_runs);
      if (response.total_count > response.workflow_runs.length || blocking.length) {
        const run = blocking[0] || response.workflow_runs[0];
        throw Error(`Update processing: ${run?.name || 'workflow'} (${run?.status || 'pending'})${run?.actor?.login ? ' by ' + run.actor.login : ''}. Wait; do not cancel it.${run?.html_url ? ' ' + run.html_url : ''}`);
      }
    }
  };
  await head();
  await idle();
  const release = await get(`actions/workflows/pages.yml/runs?branch=main&head_sha=${expectedHead}&per_page=100`);
  if (!Array.isArray(release.workflow_runs) || !release.workflow_runs.length) throw Error('The latest main update has not registered a deployment yet. Wait and recheck.');
  const runs = release.workflow_runs;
  if (runs.some(run => run.head_sha !== expectedHead || run.status !== 'completed' || !run.conclusion)) throw Error('The latest main update is not finished processing. Wait and recheck.');
  // Catch a new submission or scheduled run appearing during the first lookup.
  await idle();
  await head();
  return {head: expectedHead, previousConclusion: runs[0].conclusion};
}

export function validatePush(rows, ancestor) {
  for (const row of rows) {
    const [localRef, localSha, remoteRef, remoteSha] = row.trim().split(/\s+/);
    if (!localRef || !remoteRef || !SHA.test(localSha || '') || !SHA.test(remoteSha || '')) throw Error('Cannot verify push references. Submission blocked.');
    if (localSha === ZERO) throw Error('Deleting shared refs is blocked by the Home Base update guard.');
    if (remoteSha !== ZERO && !ancestor(remoteSha, localSha)) throw Error(`Non-fast-forward update to ${remoteRef} blocked. Fetch and integrate the other owner\u2019s changes.`);
  }
}

async function main() {
  const args = process.argv.slice(2), push = args[0] === '--pre-push';
  let expected;
  if (push) {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    const rows = input.trim().split('\n').filter(Boolean);
    if (!rows.length) return;
    validatePush(rows, (old, next) => {
      try { execFileSync('git', ['merge-base', '--is-ancestor', old, next], {stdio: 'ignore'}); return true; } catch { return false; }
    });
    expected = rows.find(row => row.split(/\s+/)[2] === 'refs/heads/main')?.split(/\s+/)[3];
  } else if (args.length) {
    if (args[0] !== '--expected-head' || args.length !== 2) throw Error('Usage: npm run check:update -- --expected-head <fetched-main-SHA>');
    expected = args[1];
  }
  if (!expected) expected = execFileSync('git', ['rev-parse', 'refs/remotes/origin/main'], {encoding: 'utf8'}).trim();
  const result = await checkUpdateReady(expected);
  console.log(`READY: GitHub is idle; main is ${result.head}; previous deployment finished (${result.previousConclusion}). Use this exact head for publication.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {console.error(error.message); process.exitCode = 1;});
