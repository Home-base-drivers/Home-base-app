import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1])
  .filter((source) => source.trim());

if (!scripts.length) throw new Error('No inline application script found.');
for (const source of scripts) Function(source);
console.log(`Validated ${scripts.length} inline script block${scripts.length === 1 ? '' : 's'}.`);
