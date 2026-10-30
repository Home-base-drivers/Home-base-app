import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';

const copilot=fs.readFileSync(new URL('../dist/homebase-copilot.js',import.meta.url),'utf8');
const chat=fs.readFileSync(new URL('../dist/homebase-chat.js',import.meta.url),'utf8');
const D=createRequire(import.meta.url)('../dist/homebase-dispatch.js');

test('synced driver settings carry no AI switch, so reload must keep Home Base AI on',()=>{
 // The settings saved in the cloud have only these keys; rebuilding the state from them
 // leaves aiUnderstanding undefined, which used to send every voice question to the phone.
 const synced={mode:'MAX PROFIT',diamond:false,vehicle:null,platforms:[],driverName:'',paidRepositioning:true};
 assert.equal(D.DriverState.create(synced).aiUnderstanding,undefined);
 const reload=copilot.match(/function reload\(\)\{[\s\S]*?update\(true\);\}/)?.[0]||'';
 assert.match(reload,/Object\.assign\(state,D\.DriverState\.create\([\s\S]*?\)\);[\s\S]*?if\(state\.aiUnderstanding===undefined\)state\.aiUnderstanding=true;refreshTrips\(\)/);
});

test('typing pauses a running voice conversation and the keyboard Send key sends on phones',()=>{
 assert.match(copilot,/function openChat\(\)\{closeMenu\(\);if\(window\.HomeBaseCopilot\?\.voiceActive\?\.\(\)\)window\.HomeBaseCopilot\.stopConversation/);
 assert.match(chat,/input\.addEventListener\('focus',\(\)=>\{if\(window\.HomeBaseCopilot\?\.voiceActive\?\.\(\)\)window\.HomeBaseCopilot\.stopConversation/);
 assert.match(chat,/event\.key==='Enter'&&!event\.shiftKey&&!event\.isComposing\)\{event\.preventDefault\(\);form\.requestSubmit\(\)\}/);
 assert.doesNotMatch(chat,/matchMedia\('\(hover:hover\)'\)/);
 // Searching old chats redraws once after a pause, not on every letter.
 assert.match(copilot,/searchTimer=setTimeout\(renderChat,200\)/);
});
