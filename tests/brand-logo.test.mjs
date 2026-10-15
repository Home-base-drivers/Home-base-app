import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const copilotJs = await readFile(new URL('../dist/homebase-copilot.js', import.meta.url), 'utf8');
const copilotCss = await readFile(new URL('../dist/homebase-copilot.css', import.meta.url), 'utf8');
const sw = await readFile(new URL('../dist/sw.js', import.meta.url), 'utf8');

// The map top bar carried only the wordmark, while the logo sat off-canvas in
// the slide-out menu, so drivers never saw the mark on the screen they use.
test('the map top bar shows the logo beside the wordmark', () => {
  const brand = copilotJs.match(/homeWord\.innerHTML='([^']*)'/)?.[1];
  assert.ok(brand, 'the top bar brand markup must still be built here');
  assert.match(brand, /homebase-logo\.png/, 'the logo belongs in the top bar');
  assert.match(brand, /<strong>Homebase<\/strong>/, 'the wordmark must stay');
  assert.match(brand, /Drive\. Earn\. Connect\./, 'the tagline must stay');
});

// The card was already a flex column so the wordmark could stack over the
// tagline; without an explicit row the logo pushes the text onto a new line
// and the card grows to roughly 81px tall.
test('the brand card lays the logo out in a row, not stacked', () => {
  assert.match(copilotCss, /#hbHomeWord\{[^}]*flex-direction:row!important/);
  assert.match(copilotCss, /#hbHomeWord \.hb-home-logo\{[^}]*width:30px!important/);
  assert.match(copilotCss, /#hbHomeWord \.hb-home-text\{[^}]*flex-direction:column!important/);
});

test('the logo file is precached so it survives offline', () => {
  assert.match(sw, /homebase-logo\.png/);
});
