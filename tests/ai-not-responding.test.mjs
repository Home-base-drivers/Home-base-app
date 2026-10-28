// The in-app AI must always answer or say why. A sign-in check or request that
// never finishes (phone network, iOS suspending the app mid-request) used to leave
// the chat silent: the sign-in check had no deadline and a hung reply kept the
// chat locked so every later question was ignored.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHomeBaseBackend, storedSession } from '../src/backend-client.mjs';

const hang = () => new Promise(() => {});
const user = { id: 'driver-1' };

test('dispatch checks the saved session with a deadline instead of a network user lookup', async () => {
  let invoked = null, getUserCalls = 0;
  const client = { auth: { getUser: async () => { getUserCalls++; return { data: { user }, error: null }; }, getSession: async () => ({ data: { session: { user, access_token: 'tok' } }, error: null }) },
    functions: { invoke: async (name, opts) => { invoked = { name, opts }; return { data: { answer: 'hi' }, error: null }; } } };
  const api = createHomeBaseBackend(client);
  assert.deepEqual(await api.evaluateDispatch({ operation: 'agent', utterance: 'hi' }), { answer: 'hi' });
  assert.equal(getUserCalls, 0);
  assert.equal(invoked.opts.headers.Authorization, 'Bearer tok');
  assert.equal(invoked.opts.timeout, 60000);
});

test('a stuck auth library falls back to the saved token and calls the AI directly', async () => {
  const storage = { getItem: () => JSON.stringify({ access_token: 'saved', expires_at: Math.floor(Date.now() / 1000) + 3600, user }) };
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ answer: 'ok' }), { status: 200 }); };
  try {
    const api = createHomeBaseBackend({ auth: { getSession: hang }, functions: { invoke: hang } },
      { storage, storageKey: 'home-base-auth', supabaseUrl: 'https://x.supabase.co', supabaseKey: 'sb_publishable_x', authTimeoutMs: 20 });
    assert.deepEqual(await api.evaluateDispatch({ operation: 'agent', utterance: 'hi' }), { answer: 'ok' });
    assert.equal(calls[0].url, 'https://x.supabase.co/functions/v1/dispatch');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer saved');
  } finally { globalThis.fetch = realFetch; }
});

test('a stuck auth library with no saved token fails fast with a clear reason', async () => {
  const api = createHomeBaseBackend({ auth: { getSession: hang } }, { storage: { getItem: () => null }, storageKey: 'k', authTimeoutMs: 20 });
  await assert.rejects(api.evaluateDispatch({ operation: 'agent' }), e => e.code === 'auth_timeout');
});

test('a reply that never arrives times out as ai_timeout', async () => {
  const api = createHomeBaseBackend({ auth: { getSession: async () => ({ data: { session: { user, access_token: 't' } }, error: null }) }, functions: { invoke: hang } }, { aiTimeoutMs: 20 });
  await assert.rejects(api.evaluateDispatch({ operation: 'agent' }), e => e.code === 'ai_timeout');
});

test('expired or anonymous saved sessions are never used', () => {
  const at = n => ({ getItem: () => JSON.stringify({ access_token: 'a', expires_at: n, user }) });
  assert.equal(storedSession(at(Math.floor(Date.now() / 1000) - 10), 'k'), null);
  assert.equal(storedSession({ getItem: () => JSON.stringify({ access_token: 'a', user: { id: 'x', is_anonymous: true } }) }, 'k'), null);
  assert.ok(storedSession(at(Math.floor(Date.now() / 1000) + 3600), 'k'));
});

function loadAgentClient(backend) {
  const ctx = { window: {}, localStorage: { getItem: () => null }, navigator: { language: 'en-US' }, document: { getElementById: () => null }, console, setTimeout, clearTimeout, Promise };
  ctx.window = ctx; ctx.HomeBaseAccounts = { backend };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('dist/homebase-agent-client.js', 'utf8'), ctx);
  return ctx.HomeBaseAgentClient;
}

test('the AI client sign-in check has a deadline and lets the server decide when it cannot finish', async () => {
  const agent = loadAgentClient({ signedInUser: hang });
  const t = Date.now();
  assert.equal(await agent.signedIn(), true);
  assert.ok(Date.now() - t < 9000);
  assert.equal(await loadAgentClient({ signedInUser: async () => null }).signedIn(), false);
});

test('a question that never gets an answer rejects with ai_timeout and a driver-facing reason', async () => {
  const agent = loadAgentClient({ signedInUser: async () => user, getUser: async () => user, evaluateDispatch: hang });
  await assert.rejects(agent.ask('hi', {}, { timeoutMs: 30 }), e => e.code === 'ai_timeout');
  assert.match(agent.describeError({ code: 'ai_timeout' }), /took too long/);
  assert.match(agent.describeError({ code: 'auth_timeout' }), /sign-in/);
});

test('the chat marks itself busy before checking sign-in and always releases the lock', () => {
  const chat = fs.readFileSync('dist/homebase-chat.js', 'utf8');
  assert.match(chat, /pending=true;\n\s*try\{if\(usePlus&&!await agent\.signedIn\(\)\)\{pending=false;/);
  assert.match(chat, /catch\(error\)\{pending=false;showNotice\(agent\?\.describeError/);
});

test('voice opens the typed chat when the phone cannot take speech', () => {
  const copilot = fs.readFileSync('dist/homebase-copilot.js', 'utf8');
  assert.match(copilot, /function typeInstead\(\)\{try\{window\.HomeBaseShell\?\.openChat\?\.\(\);window\.HomeBaseChat\?\.focus\?\.\(\)\}catch\{\}\}/);
  assert.match(copilot, /if\(!Recognition\)\{[^}]*typeInstead\(\);return;\}/);
  assert.match(copilot, /\['not-allowed','service-not-allowed','network','language-not-supported'\]\.includes\(e\.error\)\)typeInstead\(\)/);
});
