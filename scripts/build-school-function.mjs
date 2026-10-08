import {build} from 'esbuild';
await build({entryPoints:['scripts/school-service.mjs'],outfile:'supabase/functions/school-events/calendar.mjs',bundle:true,format:'esm',platform:'neutral',target:'es2022',external:['node:*']});
