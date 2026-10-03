import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { deleteAccountHandler } from './handler.mjs';
Deno.serve(deleteAccountHandler(createClient, (name: string) => Deno.env.get(name)));
