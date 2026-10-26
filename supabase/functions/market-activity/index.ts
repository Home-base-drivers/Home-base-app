import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { marketActivityHandler } from './handler.mjs';
Deno.serve(marketActivityHandler(createClient, (name: string) => Deno.env.get(name), fetch));
