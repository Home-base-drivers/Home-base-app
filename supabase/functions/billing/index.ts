import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { billingHandler } from './handler.mjs';
import { withAllowedOrigin } from './cors.mjs';
// verify_jwt must be off: Stripe webhooks carry a Stripe signature, not a Supabase JWT.
// App requests are authenticated inside the handler.
Deno.serve(withAllowedOrigin(billingHandler(createClient, (name: string) => Deno.env.get(name))));
