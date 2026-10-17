-- Stripe subscriptions. Written only by the billing Edge Function (service role)
-- after a verified Stripe webhook; drivers can read their own row.
create table if not exists public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  subscription_id text,
  subscription_status text,
  price_id text,
  plan text not null default 'free' check (plan in ('free', 'plus', 'pro')),
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.billing_events (
  id text primary key,
  type text not null,
  result text,
  received_at timestamptz not null default now()
);
alter table public.billing_customers enable row level security;
alter table public.billing_events enable row level security;
drop policy if exists "own billing" on public.billing_customers;
create policy "own billing" on public.billing_customers for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.billing_customers, public.billing_events from anon, authenticated;
grant select on public.billing_customers to authenticated;
grant all on public.billing_customers, public.billing_events to service_role;
