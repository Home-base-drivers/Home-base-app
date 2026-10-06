import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const live=fs.readFileSync(new URL('../dist/homebase-live-assistant.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../dist/sw.js',import.meta.url),'utf8');

test('Homebase microphone is upgraded to GPT Live WebRTC',()=>{
 assert.match(live,/new RTCPeerConnection\(\)/);
 assert.match(live,/createDataChannel\('oai-events'\)/);
 assert.match(live,/getUserMedia/);
 assert.match(live,/operation:'live-session'/);
 assert.match(live,/window\.HomeBaseCopilot\.toggleConversation=start/);
});

test('GPT Live keeps user and assistant transcripts in Copilot history',()=>{
 assert.match(live,/session\.input_transcript\.delta/);
 assert.match(live,/session\.output_transcript\.delta/);
 assert.match(live,/HomeBaseShell\?\.logChat/);
});

test('GPT Live asset is versioned and cached by the PWA',()=>{
 assert.match(html,/homebase-live-assistant\.js\?v=1/);
 assert.match(sw,/homebase-live-assistant\.js\?v=1/);
 assert.match(sw,/home-base-v143/);
});
