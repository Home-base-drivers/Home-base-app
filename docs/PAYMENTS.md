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

## Live setup (v278): one key
1. Stripe: activate the account (business details, identity, payout bank). Public pages for
   Stripe review: `https://home-base-drivers.github.io/Home-base-app/legal.html`.
2. Supabase secret `STRIPE_SECRET_KEY` = the **live** secret key. Do not set STRIPE_PRICE_* or
   STRIPE_WEBHOOK_SECRET for live; leave them unset.
3. Open `https://nixihmurdtfcbffgvpij.supabase.co/functions/v1/billing?health=1` (or POST `{"operation":"health"}`) once. The server creates, idempotently: products
   `homebase_plus`, `homebase_pro`, `homebase_minutes_100`; prices with lookup keys
   `homebase_plus_monthly` ($19.99/mo), `homebase_pro_monthly` ($39.99/mo), `homebase_minutes_100`
   ($14.99); the webhook endpoint (4 events); and a customer-portal configuration (cancel at period
   end, switch Plus/Pro, update card, invoices). It returns `ready:true` and ids, never secrets.
4. Webhooks without `STRIPE_WEBHOOK_SECRET` are verified by fetching the event back from Stripe by id
   and using Stripe's copy, so a forged request cannot change a plan.
5. `BILLING_ENABLED=true` opens sales. Owners decided: only after OpenAI has credit.

## Older manual setup (test mode, superseded)
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

## Testing before sales open (no BILLING_ENABLED needed)
Add secret `BILLING_TEST_EMAILS` = comma-separated tester emails (a spare, non-owner account).
While `STRIPE_SECRET_KEY` is a **test** key (`sk_test_…`), only those accounts see working
"Get Plus/Pro" buttons and a "Test mode" note; everyone else still sees "Opens soon".
A live key (`sk_live_…`) ignores the tester list, so this can never open real sales.
Remove the tester list after testing.

## Protected plans
Accounts whose plan source is `owner` or `comp` cannot start checkout (409 `owner_plan`), and
Stripe webhooks never change them (result `owner plan kept`). Owners test with a separate account.

## Current setup state (Oct 17, 2026)
- Done: billing tables (RLS on); Stripe TEST products, prices, webhook
  (`we_1UROVaPUPsL5jNFlJhvxut8G`, 4 events) and customer portal.
- TEST price ids: Plus `price_1URORTPUPsL5jNFlYw7Jjoa0`, Pro `price_1URORlPUPsL5jNFlOGRVAw4O`,
  minutes `price_1UROS4PUPsL5jNFlR5t8BIsj`.
- Open: Supabase secrets, end-to-end test purchase, live mode, `BILLING_ENABLED`.

## AI provider (v288)
Paid text intelligence (Ask Home Base chat, spoken questions, command understanding, translation,
driver memory) runs on **Claude** when the Edge Function secret `ANTHROPIC_API_KEY` is set.
Defaults: `CLAUDE_MODEL=claude-sonnet-5-5` (answers, web search, photos), `CLAUDE_FAST_MODEL=claude-haiku-5-5`
(understanding, translation, memory). `AI_PROVIDER=openai` switches back. Claude has no realtime
voice: without `OPENAI_API_KEY`, spoken replies use the phone's voice and "live voice" becomes the
phone-voice conversation with Claude answers. GPT Live and the minutes pack need OpenAI.

**Workspace (v301).** An organization-level Claude key is rejected with "not scoped to a workspace"
unless `ANTHROPIC_WORKSPACE_ID` (the Console workspace id, `wrkspc_…`) is also set; a key created
inside a workspace needs nothing extra. Until this was found (Oct 27) every Claude request failed
and the app fell back to canned built-in answers.

**Who gets Claude (v301).** Every signed-in driver talks to Claude in chat by default. Free drivers
have `AI_FREE_DAILY_MESSAGES` (default 25) messages per 24 hours; Plus/Pro are unlimited. GPT voice,
translation and live minutes stay Plus/Pro. The phone-only assistant is the offline fallback.
