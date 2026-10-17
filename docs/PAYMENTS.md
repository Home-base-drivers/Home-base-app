# Home Base payments (Stripe)

Web checkout through Stripe, so subscriptions avoid the 15–30% app-store fee
(about 3% + $0.30 instead). Edge Function `billing` (verify_jwt **off**: Stripe
webhooks are verified by signature; app calls verify the Supabase session inside).

| Product | Stripe price | Plan effect |
|---|---|---|
| Home Base Plus | $19.99 / month, recurring | `plus`: GPT answers + 120 GPT Live min/month |
| Home Base Pro | $39.99 / month, recurring | `pro`: GPT answers + 260 GPT Live min/month |
| 100 GPT Live minutes | $14.99, one-time | +6000 s for the current month (Plus/Pro only) |

## Flow
1. Phone → `billing` `{operation:'checkout', plan}` → Stripe Checkout URL (customer created once,
   `client_reference_id` = Supabase user id).
2. Stripe → `billing` webhook (signed, 5-minute tolerance, each event id processed once; failures
   are forgotten so Stripe retries) → `set_ai_plan(user, plan, 'stripe', period_end + 3 days)`.
3. Cancel/unpaid → plan `free`. Manage/cancel/switch: `{operation:'portal'}` → Stripe customer portal.
4. Tables: `billing_customers` (driver can read own row), `billing_events` (server only).

## Owner setup (sales stay closed until step 4)
1. Stripe Dashboard → Products: create the three prices above; copy their `price_…` ids.
2. Developers → Webhooks → add endpoint
   `https://nixihmurdtfcbffgvpij.supabase.co/functions/v1/billing` with events
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`; copy the signing secret.
3. Settings → Billing → Customer portal: enable cancel and switching between Plus and Pro.
4. Supabase → Edge Functions → Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_MINUTES`, and finally
   `BILLING_ENABLED=true` **only after OpenAI has credit** (Plus/Pro sell GPT features).
Test first with Stripe test-mode keys and card 4242 4242 4242 4242.
