import {copyFile} from 'node:fs/promises';
// One source of calculation truth; generated server copy is never edited by hand.
await copyFile(new URL('../dist/homebase-dispatch.js',import.meta.url),new URL('../supabase/functions/dispatch/engine.js',import.meta.url));
