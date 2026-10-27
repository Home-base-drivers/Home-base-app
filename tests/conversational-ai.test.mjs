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

function handler(plan, used) {
  const h = makeDispatchHandler({ FREE_DAILY_MESSAGES: 3, engine: {}, authenticate: async () => ({ id: 'u1' }), loadState: async () => ({}), loadTrips: async () => [], reportFailure() {},
    entitlements: { allowance: async () => ({ plan }), freeMessagesUsed: async id => { assert.equal(id, 'u1'); return used; } },
    agent: async () => ({ answer: 'Claude answer' }) });
  return body => h(new Request('https://x/dispatch', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify(body) }));
}
test('free drivers talk to Claude in chat up to a daily allowance; paid voice stays paid', async () => {
  const ok = await handler('free', 2)({ operation: 'agent', utterance: 'hi', channel: 'chat' });
  assert.equal(ok.status, 200); assert.equal((await ok.json()).answer, 'Claude answer');
  const capped = await handler('free', 3)({ operation: 'agent', utterance: 'hi', channel: 'chat' });
  assert.equal(capped.status, 402); assert.equal((await capped.json()).code, 'daily_messages_used_up');
  assert.equal((await handler('free', 0)({ operation: 'voice', text: 'hi' })).status, 402);
  assert.equal((await handler('free', 0)({ operation: 'translate', text: 'hi' })).status, 402);
  assert.equal((await handler('pro', 999)({ operation: 'agent', utterance: 'hi', channel: 'chat' })).status, 200);
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
