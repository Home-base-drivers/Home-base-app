import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const shell=readFileSync(new URL('../dist/homebase-copilot.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../dist/homebase-copilot.css',import.meta.url),'utf8');
const planner=readFileSync(new URL('../dist/homebase-planner.js',import.meta.url),'utf8');

test('every side-menu navigation and control command has a live app target',()=>{
 const ids=[...shell.matchAll(/data-(?:nav|control)=["']([^"']+)["']/g)].map(match=>match[1]);
 assert.ok(ids.length>=10,'expected a complete side menu');
 for(const id of ids)assert.ok(new RegExp('id=["\\\']'+id+'["\\\']').test(html)||new RegExp('id=["\\\']'+id+'["\\\']').test(planner),'missing target '+id);
});

test('former top controls live in the side menu',()=>{
 for(const id of ['panelsBtn','layerBtn','refreshBtn','installBtn','heatToggle','paletteToggle']){
  assert.match(shell,new RegExp('data-control=["\\\']'+id+'["\\\']'));
 }
 assert.match(css,/header \.status,\.hb-shell-active header \.map-style-controls\{display:none!important\}/);
});

test('Homebase wordmark is clean and transparent on the home map',()=>{
 assert.match(shell,/homeWord\.textContent='Homebase'/);
 assert.match(css,/\.hb-home-word\{[^}]*background:transparent/);
 assert.match(css,/\.hb-menu-toggle\{[^}]*background:transparent/);
});

test('menu commands close the drawer and execute the real target',()=>{
 assert.match(shell,/function runMenuCommand\(/);
 assert.match(shell,/closeMenu\(\);\s*requestAnimationFrame\(\(\)=>\{target\.click\(\)/);
});


test('legacy planner toolbar and floating restore buttons are removed from the clean Home screen',()=>{
 for(const selector of ['.planner-toolbar','#showPlannerView','#showMapTabs','#showMapControls'])assert.match(css,new RegExp('\\.hb-shell-active '+selector.replace('.','\\.').replace('#','\\#')));
 assert.match(css,/planner-toolbar[^}]*display:none!important/);
});

test('planner toolbar commands are available from the side drawer',()=>{
 for(const id of ['driveViewToggle','demandDetails','toggleMapTabs','showPickupCard','hideMapControls','showMapControls']){
  assert.match(shell,new RegExp('data-control=["\\\']'+id+'["\\\']'));
 }
});


test('planner itself force-hides legacy map controls even before shell CSS applies',()=>{
 assert.match(planner,/toolbar\.style\.display='none'/);
 assert.match(planner,/showView\.style\.display='none'/);
 assert.match(planner,/showTabs\.style\.display='none'/);
 assert.match(planner,/restore\.style\.display='none'/);
});

test('Pulse Modern branding uses water-glass Homebase and voice treatments',()=>{
 assert.match(css,/Pulse Modern brand treatment/);
 assert.match(css,/\.hb-home-word:before,\.hb-home-word:after/);
 assert.match(css,/background-clip:text/);
 assert.match(css,/\.hb-voice-bubble\{[\s\S]*?backdrop-filter:blur\(13px\) saturate\(145%\)/);
});
