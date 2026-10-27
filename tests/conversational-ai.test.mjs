import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { claudeHeaders } from '../supabase/functions/dispatch/claude.mjs';
import { providerFailure } from '../supabase/functions/dispatch/errors.mjs';
import { makeDispatchHandler } from '../supabase/functions/dispatch/handler.mjs';
import { makeHomeBaseAgent, memoryLines } from '../supabase/functions/dispatch/agent.mjs';
import AI from '../dist/homebase-internal-ai.js';

test('an organization Claude key is sent with its workspace, and the missing-workspace error is explained', () => {
  assert.equal(claudeHeaders('k', 'wrkspc_01ABC')['anthropic-workspace-id'], 'wrkspc_01ABC');
  assert.equal(claudeHeaders('k', '')['anthropic-workspace-id'], undefined);
  assert.equal(claudeHeaders('k', 'bad id; drop')['anthropic-workspace-id'], undefined);
  const e = providerFailure({ status: 400, headers: new Headers() }, { error: { type: 'invalid_request_error', message: 'This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header' } }, 'agent', 'Anthropic');
  assert.equal(e.code, 'ai_not_configured');
  assert.match(e.message, /ANTHROPIC_WORKSPACE_ID/);
  assert.match(fs.readFileSync('supabase/functions/dispatch/claude.mjs', 'utf8'), /headers:claudeHeaders\(apiKey\)/);
});

function handler(plan, { refuse = null, providerError = null, voiceConfigured = true } = {}) {
  const claims = [], releases = [], agentCalls = [];
  const h = makeDispatchHandler({ engine: {}, authenticate: async () => ({ id: 'u1' }), loadState: async () => ({}), loadTrips: async () => [], reportFailure() {},
    entitlements: { allowance: async () => ({ plan }),
      claim: async (id, op, image) => { assert.equal(id, 'u1'); claims.push({ op, image }); if (refuse) throw Object.assign(Error(refuse), { code: refuse }); return { usage_id: claims.length, plan, web_searches: plan === 'free' ? 1 : 2 }; },
      release: async (id, u) => releases.push(id) },
    agent: async args => { agentCalls.push(args); if (providerError) throw providerError; return { answer: 'Claude answer' }; },
    synthesizeVoice: async () => voiceConfigured ? { configured: true, audio: new Uint8Array([1]) } : { configured: false } });
  const call = body => h(new Request('https://x/dispatch', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify(body) }));
  return { call, claims, releases, agentCalls };
}
test('every plan gets Claude answers within server-recorded limits; GPT voices are Pro only; refused requests are given back', async () => {
  const free = handler('free');
  const ok = await free.call({ operation: 'agent', utterance: 'hi', channel: 'chat' });
  assert.equal(ok.status, 200); assert.equal((await ok.json()).answer, 'Claude answer');
  assert.deepEqual(free.claims, [{ op: 'agent', image: false }]); assert.equal(free.agentCalls[0].webSearches, 1);
  await free.call({ operation: 'agent', utterance: 'read this', channel: 'chat', attachments: [{ dataUrl: 'data:image/png;base64,AAAA' }] });
  assert.deepEqual(free.claims[1], { op: 'agent', image: true }, 'screenshots are counted as images');
  for (const code of ['daily_messages_used_up', 'monthly_messages_used_up', 'daily_images_used_up', 'free_pool_used_up', 'email_unconfirmed']) {
    const r = await handler('plus', { refuse: code }).call({ operation: 'agent', utterance: 'hi', channel: 'chat' });
    assert.equal(r.status, 402, code); const body = await r.json(); assert.equal(body.code, code); assert.doesNotMatch(body.error, /unlimited/i);
  }
  const plusVoice = handler('plus'); assert.equal((await plusVoice.call({ operation: 'voice', text: 'hi' })).status, 402); assert.equal(plusVoice.claims.length, 0, 'no charge for a refused GPT voice');
  const pro = handler('pro'); assert.equal((await pro.call({ operation: 'voice', text: 'hi' })).status, 200); assert.equal(pro.claims[0].op, 'voice');
  const noOpenAI = handler('pro', { voiceConfigured: false }); await noOpenAI.call({ operation: 'voice', text: 'hi' }); assert.deepEqual(noOpenAI.releases, [1]);
  const refused = handler('free', { providerError: Object.assign(Error('rejected'), { code: 'ai_provider_error', provider_status: 400 }) });
  assert.equal((await refused.call({ operation: 'agent', utterance: 'hi', channel: 'chat' })).status, 502); assert.deepEqual(refused.releases, [1]);
  const timedOut = handler('free', { providerError: Object.assign(Error('slow'), { code: 'ai_timeout' }) });
  await timedOut.call({ operation: 'agent', utterance: 'hi', channel: 'chat' }); assert.deepEqual(timedOut.releases, [], 'a timeout may have been billed, so it still counts');
  const src = fs.readFileSync('supabase/functions/dispatch/index.ts', 'utf8');
  assert.match(src, /CLAUDE_CHAT_MODEL'\)\|\|'claude-haiku-5-5'/); assert.match(src, /CLAUDE_VISION_MODEL'\)\|\|'claude-sonnet-5-5'/);
  assert.match(src, /SUPABASE_SERVICE_ROLE_KEY/); assert.doesNotMatch(src, /FREE_DAILY|freeMessagesUsed/);
});

test('the assistant knows the driver: learned memory and measured habits go into every request, and it can forget', async () => {
  const calls = [], forgotten = [], saved = [];
  const replies = [
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Rain starts near your usual 4 PM start.' }] },
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't', name: 'save_memories', input: { memories: [{ key: 'home_time', type: 'constraint', summary: 'Home by 10 PM on weeknights', confidence: .8 }], forget: ['avoid_bwi', 'not_a_key'] } }] }
  ];
  const agent = makeHomeBaseAgent({ provider: 'anthropic', apiKey: 'k', model: 'claude-sonnet-5-5', fastModel: 'claude-haiku-5-5',
    fetchImpl: async (url, init) => { calls.push(JSON.parse(init.body)); return new Response(JSON.stringify(replies.shift()), { status: 200 }); },
    loadMemory: async () => [{ memory_key: 'avoid_bwi', memory_type: 'preference', content: { summary: 'Avoids BWI airport queue' }, confidence: .7 }],
    loadTurns: async () => [], saveTurn: async () => {}, upsertMemories: async (u, m) => saved.push(...m), forgetMemories: async (u, keys) => forgotten.push(...keys) });
  const r = await agent({ userId: 'u1', utterance: 'Actually BWI is fine now. I need to be home by 10 on weeknights.', channel: 'chat', context: { driverProfile: { usualStartHours: [16], asksMostAbout: ['weather'] } } });
  assert.match(r.answer, /usual 4 PM/);
  assert.match(calls[0].system, /avoid_bwi: Avoids BWI airport queue/);
  assert.match(calls[0].system, /"usualStartHours":\[16\]/);
  assert.match(calls[0].system, /Be predictive/);
  assert.match(calls[1].messages[0].content, /Existing memory:[\s\S]*avoid_bwi/);
  assert.deepEqual(forgotten, ['avoid_bwi']);
  assert.equal(saved[0].key, 'home_time');
  assert.match(memoryLines([{ memory_key: 'x', content: { big: 'y'.repeat(2000) } }]), /^- \[fact\] x: .{1,330}$/);
});

test('Claude answers by default; the phone-only assistant is the offline fallback or an explicit choice', () => {
  const store = new Map();
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  try {
    store.set('homeBaseProductPrefs', JSON.stringify({ aiPlan: 'builtin', aiPlanChosen: true })); // an old choice from the GPT-only days
    assert.equal(AI.plan(), 'plus');
    AI.notePlanStatus({ plan: 'free' });
    assert.equal(AI.plan(), 'plus', 'free drivers get conversation too');
    AI.setPlan('builtin', { chosen: true });
    assert.equal(AI.plan(), 'builtin');
    AI.notePlanStatus({ plan: 'pro' });
    assert.equal(AI.plan(), 'builtin', 'an explicit choice is kept');
    const u = AI.noteUsage("what's the weather", new Date('2026-10-27T20:00:00Z'));
    assert.equal(u.topics.weather, 1); assert.equal(u.hours[16], 1);
    assert.deepEqual(AI.driverProfile({ records: [] }).asksMostAbout, ['weather']);
  } finally { delete globalThis.localStorage; }
  const chat = fs.readFileSync('dist/homebase-chat.js', 'utf8');
  assert.match(chat, /data-engine="plus">Home Base AI</);
  assert.doesNotMatch(chat, /GPT · Plus/);
});

test('everyday answers use the small model; only screenshots use the vision model; history and replies stay short', async () => {
  const bodies = [];
  const agent = makeHomeBaseAgent({ provider: 'anthropic', apiKey: 'k', model: 'claude-haiku-5-5', visionModel: 'claude-sonnet-5-5', fastModel: 'claude-haiku-5-5',
    fetchImpl: async (u, init) => { bodies.push(JSON.parse(init.body)); return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }), { status: 200 }); },
    loadMemory: async () => [], loadTurns: async () => Array.from({ length: 50 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'turn ' + i })), saveTurn: async () => {}, upsertMemories: async () => {} });
  await agent({ userId: 'u', utterance: 'hi', channel: 'chat', webSearches: 0 });
  assert.equal(bodies[0].model, 'claude-haiku-5-5'); assert.equal(bodies[0].max_tokens, 1024);
  assert.ok(!bodies[0].tools.some(t => t.name === 'web_search'), 'no web search when the plan allows none');
  assert.ok(bodies[0].messages.length <= 13, 'only recent history is sent');
  await agent({ userId: 'u', utterance: 'read this', channel: 'chat', webSearches: 2, attachments: [{ dataUrl: 'data:image/png;base64,AAAA' }] });
  const vision = bodies.find(b => b.model === 'claude-sonnet-5-5');
  assert.ok(vision, 'screenshots use the vision model'); assert.equal(vision.tools.find(t => t.name === 'web_search').max_uses, 2);
});
