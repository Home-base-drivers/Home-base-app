import { writeFile } from 'node:fs/promises';

const output = new URL('../dist/runtime-config.js', import.meta.url);
const config = {
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || ''
};

// Both values are intentionally public browser configuration. Never include a
// Supabase secret/service-role key in this file.
await writeFile(output, `window.HOME_BASE_CONFIG = ${JSON.stringify(config, null, 2)};\n`);
