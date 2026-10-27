import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const copilot = fs.readFileSync('dist/homebase-copilot.js', 'utf8');
const live = fs.readFileSync('dist/homebase-live-assistant.js', 'utf8');

// iPhone Safari often never marks speech as final. Voice must still send the
// driver's words, never loop the microphone forever, and never hang on the network.
test('voice sends the latest words when speech is never marked final', () => {
  assert.match(copilot, /const deliver=text=>\{[^}]*if\(sent\|\|!text\)return false;sent=true;/, 'each voice turn is sent once');
  assert.match(copilot, /silenceTimer=setTimeout\(\(\)=>\{if\(sent\|\|!latest\)return;/, 'a pause sends what was heard');
  assert.match(copilot, /deliver\(latest\);\},VOICE_SILENCE_MS\)/);
  assert.match(copilot, /recognition\.onend=\(\)=>\{clearTimeout\(silenceTimer\);resetButton\(\);if\(!failed&&!sent&&latest\)\{deliver\(latest\);return;\}/, 'closing the mic sends what was heard');
});

test('an empty microphone does not restart forever', () => {
  assert.match(copilot, /MAX_EMPTY_VOICE_TURNS=2/);
  assert.match(copilot, /\+\+emptyVoiceTurns>MAX_EMPTY_VOICE_TURNS\)\{stopConversation\(/);
});

test('Claude answers and GPT voice have deadlines, and a late answer is still written', () => {
  assert.match(copilot, /withTimeout\(request,AI_ANSWER_TIMEOUT_MS,'ai_timeout'\)/);
  assert.match(copilot, /request\.then\(late=>\{[^}]*logChat\?\.\('assistant',text\)/);
  assert.match(copilot, /withTimeout\(HomeBaseAccounts\.backend\.evaluateDispatch\(\{operation:'voice'/);
  assert.match(copilot, /withTimeout\(aiAudioContext\.resume\?\.\(\),1500,'audio_resume_timeout'\)/);
  assert.match(copilot, /withTimeout\(audio\.play\(\),4000,'audio_play_timeout'\)/);
  assert.match(copilot, /aiAudioWatchdog=setTimeout\(done,\(buffer\.duration\+3\)\*1000\)/, 'playback that never reports its end still finishes');
});

test('an ended phone-voice session does not hold the voice button', () => {
  assert.match(copilot, /voiceActive:\(\)=>conversationActive\|\|listening\|\|speechBusy/);
  assert.match(live, /if\(guestActive&&window\.HomeBaseCopilot\?\.voiceActive\?\.\(\)===false\)guestActive=false;/);
});

test('withTimeout rejects with its code and passes results through', async () => {
  const src = copilot.match(/function withTimeout\(promise,ms,code\)\{.*?\}\)\]\)\}/)[0];
  const withTimeout = new Function(src + ';return withTimeout;')();
  assert.equal(await withTimeout(Promise.resolve(7), 50, 'x'), 7);
  await assert.rejects(withTimeout(new Promise(() => {}), 10, 'ai_timeout'), e => e.code === 'ai_timeout');
});

// GPT voices and GPT Live are off until an owner funds OpenAI and sets GPT_VOICE_ENABLED=true.
test('GPT voice stays off unless the server switches it on; voice is answered by Claude', () => {
  const entry = fs.readFileSync('supabase/functions/dispatch/index.ts', 'utf8');
  assert.match(entry, /const gptVoiceEnabled=Deno\.env\.get\('GPT_VOICE_ENABLED'\)==='true'&&!!openaiKey;/);
  assert.match(entry, /const synthesizeVoice=gptVoiceEnabled\?makeVoiceSynthesizer\(.*\):async\(\)=>\(\{configured:false/);
  assert.match(entry, /const createLiveSession=gptVoiceEnabled\?makeLiveSessionCreator\(/);
  assert.match(entry, /allowance:async\(\)=>\(\{\.\.\.\(await rpc\('my_ai_allowance'\)\|\|\{\}\),gpt_voice:gptVoiceEnabled\}\)/);
  assert.match(copilot, /window\.HomeBaseInternalAI\?\.gptVoice\?\.\(\)===true&&window\.HomeBaseInternalAI\?\.plan\?\.\(\)!=='builtin'\)\{\n   q\('#copilotStatus'\)\.textContent='Generating Home Base AI voice…'/, 'GPT voice audio only when switched on');
  assert.match(copilot, /if\(wake&&window\.HomeBaseLiveAssistant\?\.startLive&&window\.HomeBaseInternalAI\?\.gptVoice\?\.\(\)===true\)/, '"let\'s talk" goes to Claude while GPT Live is off');
  assert.match(copilot, /!builtin&&state\.aiUnderstanding&&window\.HomeBaseAgentBridge\)\{[^\n]*channel:'voice'/, 'voice questions go to Claude');
  const chat = fs.readFileSync('dist/homebase-chat.js', 'utf8'), plans = fs.readFileSync('dist/homebase-plans.js', 'utf8');
  assert.match(chat, /voiceSel\.hidden=!\(st\.plan==='pro'&&st\.gpt_voice===true\)/);
  assert.match(plans, /current==='pro'&&st\.gpt_voice===true\?'<button type="button" data-buy="minutes"/, 'no minute packs are sold while GPT Live is off');
});

test('gptVoice() is true only for Pro with gpt_voice reported by the server', async () => {
  const store = new Map();
  globalThis.localStorage ??= { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const AI = (await import('../dist/homebase-internal-ai.js')).default;
  AI.notePlanStatus({ plan: 'pro', gpt_voice: false }); assert.equal(AI.gptVoice(), false);
  AI.notePlanStatus({ plan: 'pro' }); assert.equal(AI.gptVoice(), false);
  AI.notePlanStatus({ plan: 'plus', gpt_voice: true }); assert.equal(AI.gptVoice(), false);
  AI.notePlanStatus({ plan: 'pro', gpt_voice: true }); assert.equal(AI.gptVoice(), true);
});
