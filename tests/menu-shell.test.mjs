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
 assert.ok(shell.includes("homeWord.innerHTML='<strong>Homebase</strong><small>Drive. Earn. Connect.</small>'"));
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


test('approved charcoal map and smoked-ice microphone treatment stay in the shell',()=>{
 assert.match(css,/Charcoal \+ smoked-ice refinement/);
 assert.match(css,/\.hb-shell-active\.app\.dark,\.hb-shell-active \.map\{background:#171d22!important\}/);
 assert.match(css,/\.hb-voice-bubble\{[\s\S]*?background:rgba\(15,29,39,\.46\)/);
 assert.match(css,/\.hb-voice-bubble svg\{[\s\S]*?filter:none/);
 assert.match(html,/homeBaseBaseMapMode'\)\|\|'dark'/);
});


test('voice Preview calls the exported Copilot preview API instead of out-of-scope private functions',()=>{
 assert.match(shell,/const preview=window\.HomeBaseCopilot\?\.previewAiVoice/);
 assert.doesNotMatch(shell,/hbVoicePreview'[\s\S]{0,180}unlockAiAudio\(\);await previewAiVoice\(\)/);
 assert.match(shell,/normalizeVoiceBlob/);
 assert.match(shell,/application\/octet-stream/);
 assert.match(shell,/Phone voice preview/);
});

test('clean-shell menu commands have visible native behavior',()=>{
 assert.match(shell,/targetId==='panelsBtn'/);
 assert.match(shell,/targetId==='toggleMapTabs'/);
 assert.match(shell,/targetId==='hideMapControls'/);
 assert.match(shell,/targetId==='showMapControls'/);
 assert.match(shell,/targetId==='driveViewToggle'/);
 assert.match(css,/\.hb-shell-active\.hb-show-nav \.home-nav\{display:grid!important/);
});


test('Map HUD hides outside Map while persistent navigation remains available',()=>{
 assert.match(shell,/function syncHomeHud\(\)/);
 assert.match(shell,/app\.classList\.contains\('map-mode'\)/);
 assert.match(shell,/for\(const node of \[homeWord,menuButton,weatherCard,platformBar\]\)node\.hidden=!mapHudShow/);
 assert.match(shell,/homeControls\.hidden=!bottomNavShow;voice\.hidden=!bottomNavShow;liveText\.hidden=!bottomNavShow/);
 assert.match(shell,/function openMenu\(\)[\s\S]{0,260}syncHomeHud\(\)/);
 assert.match(css,/\.hb-reference-controls\[hidden\][\s\S]{0,220}display:none!important/);
});

test('reference Homebase title has no legacy rays or illumination',()=>{
 assert.match(css,/\.hb-shell-active \.hb-home-word:before,\.hb-shell-active \.hb-home-word:after\{content:none!important;display:none!important\}/);
 assert.match(css,/\.hb-shell-active \.hb-home-word,\.hb-shell-active \.hb-home-word strong,\.hb-shell-active \.hb-home-word small\{filter:none!important;text-shadow:none!important/);
 assert.match(css,/Phone spacing: keep the reference header clear/);
});


test('Homebase lettering stays visibly above the dark header background',()=>{
 assert.match(css,/Keep the Homebase lettering above the glass header/);
 assert.match(css,/\.hb-shell-active \.hb-home-word strong\{color:#f5f7f9!important;-webkit-text-fill-color:#f5f7f9!important;opacity:1!important\}/);
 assert.match(css,/\.hb-shell-active \.hb-home-word small\{color:#aab9c7!important;-webkit-text-fill-color:#aab9c7!important;opacity:1!important\}/);
});


test('bottom navigation persists across workspace tabs without leaking map controls',()=>{
 assert.match(shell,/const mapHudShow=onMap&&!workspaceOpen&&chat\.hidden&&!menuOpen,bottomNavShow=chat\.hidden&&!menuOpen/);
 assert.match(shell,/homeControls\.hidden=!bottomNavShow;voice\.hidden=!bottomNavShow;liveText\.hidden=!bottomNavShow/);
 assert.match(css,/\.hb-shell-active:not\(\.hb-home-hud-visible\) \.hb-ref-top,[\s\S]{0,300}\.hb-ref-right\{display:none!important\}/);
 assert.match(css,/\.hb-shell-active\.hb-workspace-open \.hb-ref-bottom\{display:grid!important/);
 assert.match(shell,/function syncBottomNav\(\)/);
});

test('voice orb is aligned to the Ask Homebase navigation column',()=>{
 assert.match(css,/left:calc\(50% \+ min\(100vw,760px\)\/16\)/);
 assert.match(css,/width:54px;height:54px/);
 assert.match(css,/scale\(1\.1\)/);
});
