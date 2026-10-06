import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const shell=readFileSync(new URL('../dist/homebase-copilot.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../dist/homebase-copilot.css',import.meta.url),'utf8');

test('every side-menu navigation and control command has a live app target',()=>{
 const ids=[...shell.matchAll(/data-(?:nav|control)=["']([^"']+)["']/g)].map(match=>match[1]);
 assert.ok(ids.length>=10,'expected a complete side menu');
 for(const id of ids)assert.match(html,new RegExp('id=["\\\']'+id+'["\\\']'),'missing target '+id);
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
