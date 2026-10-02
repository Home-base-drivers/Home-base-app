import { build } from 'esbuild';
await build({
  entryPoints: ['src/backend-client.mjs'], outfile: 'dist/homebase-backend.js',
  bundle: true, minify: true, format: 'iife', globalName: 'HomeBaseCloud',
  platform: 'browser', target: ['es2022'], legalComments: 'eof'
});
