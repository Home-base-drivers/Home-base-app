import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');

// $ is scoped to #app. The install panel lives outside #app, so using $ for
// these nodes returned null and installHelp() threw on its first assignment —
// tapping "INSTALL / HOME SCREEN HELP" did nothing at all on iPhone, which is
// the only route an iOS driver has to install the app.
test('the shorthand selector is scoped to #app, which is why this matters', () => {
  assert.match(html, /const \$=s=>app\.querySelector\(s\)/);
});

test('installHelp resolves the install panel from the document, not #app', () => {
  const at = html.indexOf('function installHelp()');
  assert.notEqual(at, -1, 'installHelp must still exist');
  const body = html.slice(at, at + 900);
  assert.match(body, /document\.getElementById\('installTitle'\)/);
  assert.match(body, /document\.getElementById\('installCopy'\)/);
  assert.ok(!/\$\('#installTitle'\)/.test(body), '$ cannot reach the install panel');
  assert.ok(!/\$\('#installCopy'\)/.test(body), '$ cannot reach the install panel');
});

test('the iPhone branch still gives the Safari Add to Home Screen steps', () => {
  const at = html.indexOf('function installHelp()');
  const body = html.slice(at, at + 1100);
  assert.match(body, /iphone\|ipad\|ipod/i);
  assert.match(body, /Add to Home Screen/);
  assert.match(body, /Share/);
});

test('the shell stays installable: manifest, apple icon and standalone meta', () => {
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /rel="apple-touch-icon"/);
  assert.match(html, /apple-mobile-web-app-capable" content="yes"/);
});
