-- Claude message allowances per plan. We pay per message, so every plan has a
-- finite daily and monthly limit (never unlimited), screenshots (which use the
-- larger vision model) have their own daily limit, and Free drivers share one
-- daily pool so total Free cost is capped no matter how many accounts exist.
-- GPT voices and GPT Live are Pro only; Free and Plus hear Claude's answers in
-- the phone's own voice.
--
-- Usage is recorded only by the server (service role) in an append-only ledger
-- keyed by a hash of the normalized sign-in email, so deleting chat history,
-- deleting and recreating the account, or using Gmail dot/plus aliases does not
-- reset the count. Parallel requests are serialized per driver.

alter table public.ai_plan_limits
  add column if not exists daily_messages integer not null default 0,
  add column if not exists monthly_messages integer not null default 0,
  add column if not exists daily_images integer not null default 0,
  add column if not exists web_searches_per_message integer not null default 0,
  add column if not exists pool_daily_messages integer;

update public.ai_plan_limits set daily_messages = 10, monthly_messages = 150, daily_images = 2, web_searches_per_message = 1, pool_daily_messages = 1500, updated_at = now() where plan = 'free';
update public.ai_plan_limits set daily_messages = 50, monthly_messages = 800, daily_images = 10, web_searches_per_message = 2, pool_daily_messages = null, included_voice_seconds = 0, updated_at = now() where plan = 'plus';
update public.ai_plan_limits set daily_messages = 120, monthly_messages = 1200, daily_images = 30, web_searches_per_message = 3, pool_daily_messages = null, updated_at = now() where plan = 'pro';

alter table public.ai_plan_limits drop constraint if exists ai_plan_limits_finite;
alter table public.ai_plan_limits add constraint ai_plan_limits_finite check (
  daily_messages between 0 and 1000 and monthly_messages between 0 and 20000 and daily_images between 0 and 200
  and web_searches_per_message between 0 and 5 and (pool_daily_messages is null or pool_daily_messages between 0 and 100000)
  and daily_messages <= monthly_messages);
-- GPT voice is a Pro feature.
alter table public.ai_plan_limits drop constraint if exists ai_plan_limits_voice_pro_only;
alter table public.ai_plan_limits add constraint ai_plan_limits_voice_pro_only check (plan = 'pro' or included_voice_seconds = 0);

create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  account_key text not null check (length(account_key) between 8 and 80),
  user_id uuid not null,               -- no foreign key: deleting the account does not erase usage
  plan text not null,
  kind text not null check (kind in ('message', 'image')),
  operation text not null check (length(operation) <= 30),
  created_at timestamptz not null default now(),
  released_at timestamptz
);
create index if not exists ai_usage_key_created on public.ai_usage (account_key, created_at desc);
create index if not exists ai_usage_plan_created on public.ai_usage (plan, created_at desc);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;
grant all on public.ai_usage to service_role;
drop policy if exists "own usage" on public.ai_usage;
create policy "own usage" on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));

-- One key per person: lowercased email, +tags removed, Gmail dots removed, hashed.
create or replace function private.ai_account_key(u uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare e text; local_part text; domain text;
begin
  select lower(trim(email)) into e from auth.users where id = u;
  if e is null or position('@' in e) = 0 then return 'user:' || u::text; end if;
  local_part := split_part(e, '@', 1); domain := split_part(e, '@', 2);
  local_part := split_part(local_part, '+', 1);
  if domain in ('gmail.com', 'googlemail.com') then local_part := replace(local_part, '.', ''); domain := 'gmail.com'; end if;
  return encode(pg_catalog.sha256(convert_to(local_part || '@' || domain, 'UTF8')), 'hex');
end;
$$;

create or replace function private.ai_usage_counts(k text, at_time timestamptz)
returns jsonb language sql stable security definer set search_path = '' as $$
  with bounds as (
    select (date_trunc('day', at_time at time zone 'America/New_York') at time zone 'America/New_York') as day_start,
           (date_trunc('month', at_time at time zone 'America/New_York') at time zone 'America/New_York') as month_start)
  select jsonb_build_object(
    'messages_today', count(*) filter (where u.created_at >= b.day_start),
    'messages_month', count(*),
    'images_today', count(*) filter (where u.kind = 'image' and u.created_at >= b.day_start))
  from bounds b left join public.ai_usage u on u.account_key = k and u.released_at is null and u.created_at >= b.month_start
  group by b.day_start
$$;

-- Allowance now also reports Claude messages used and left.
create or replace function private.ai_allowance_for(u uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  local_month timestamp := date_trunc('month', now() at time zone 'America/New_York');
  period_start timestamptz := local_month at time zone 'America/New_York';
  period_end timestamptz := (local_month + interval '1 month') at time zone 'America/New_York';
  e public.ai_entitlements%rowtype;
  l public.ai_plan_limits%rowtype;
  v_plan text := 'free';
  v_extra integer := 0;
  v_used integer := 0;
  c jsonb;
begin
  select * into e from public.ai_entitlements where user_id = u;
  if found and (e.current_period_end is null or e.current_period_end > now()) then v_plan := e.plan; end if;
  select * into l from public.ai_plan_limits where plan = v_plan;
  if v_plan = 'pro' and e.extra_month = local_month::date then v_extra := e.extra_voice_seconds; end if;
  select coalesce(sum(private.voice_session_seconds(s, now())), 0)::integer into v_used
    from public.voice_sessions s where s.user_id = u and s.started_at >= period_start;
  c := private.ai_usage_counts(private.ai_account_key(u), now());
  return jsonb_build_object('plan', v_plan, 'included_seconds', coalesce(l.included_voice_seconds, 0), 'extra_seconds', v_extra,
    'used_seconds', v_used, 'remaining_seconds', greatest(0, coalesce(l.included_voice_seconds, 0) + v_extra - v_used),
    'gpt_voice', v_plan = 'pro',
    'daily_messages', coalesce(l.daily_messages, 0), 'monthly_messages', coalesce(l.monthly_messages, 0), 'daily_images', coalesce(l.daily_images, 0),
    'messages_today', (c->>'messages_today')::integer, 'messages_month', (c->>'messages_month')::integer, 'images_today', (c->>'images_today')::integer,
    'messages_left_today', greatest(0, least(coalesce(l.daily_messages, 0) - (c->>'messages_today')::integer, coalesce(l.monthly_messages, 0) - (c->>'messages_month')::integer)),
    'period_start', period_start, 'period_end', period_end);
end;
$$;

-- Server-only: record one Claude call before it is made, or refuse it.
create or replace function private.claim_ai_usage(p_user uuid, p_operation text, p_image boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  usr auth.users%rowtype; a jsonb; l public.ai_plan_limits%rowtype; k text; c jsonb; pool integer; v_id bigint;
  day_start timestamptz := date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York';
begin
  select * into usr from auth.users where id = p_user;
  if not found or coalesce(usr.is_anonymous, false) then raise exception 'sign_in' using errcode = 'P0001'; end if;
  if usr.email_confirmed_at is null and usr.phone_confirmed_at is null then raise exception 'email_unconfirmed' using errcode = 'P0001'; end if;
  k := private.ai_account_key(p_user);
  -- One claim at a time per person, so parallel requests cannot overshoot.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ai-usage:' || k, 0));
  a := private.ai_allowance_for(p_user);
  select * into l from public.ai_plan_limits where plan = a->>'plan';
  c := private.ai_usage_counts(k, now());
  if (c->>'messages_today')::integer >= l.daily_messages then raise exception 'daily_messages_used_up' using errcode = 'P0001'; end if;
  if (c->>'messages_month')::integer >= l.monthly_messages then raise exception 'monthly_messages_used_up' using errcode = 'P0001'; end if;
  if p_image and (c->>'images_today')::integer >= l.daily_images then raise exception 'daily_images_used_up' using errcode = 'P0001'; end if;
  if l.pool_daily_messages is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ai-usage-pool:' || l.plan, 0));
    select count(*) into pool from public.ai_usage where plan = l.plan and released_at is null and created_at >= day_start;
    if pool >= l.pool_daily_messages then raise exception 'free_pool_used_up' using errcode = 'P0001'; end if;
  end if;
  insert into public.ai_usage (account_key, user_id, plan, kind, operation)
    values (k, p_user, l.plan, case when p_image then 'image' else 'message' end, left(coalesce(p_operation, 'message'), 30)) returning id into v_id;
  return jsonb_build_object('usage_id', v_id, 'plan', l.plan, 'web_searches', l.web_searches_per_message, 'image', p_image,
    'messages_left_today', greatest(0, least(l.daily_messages - (c->>'messages_today')::integer - 1, l.monthly_messages - (c->>'messages_month')::integer - 1)));
end;
$$;

-- Server-only: give a message back when the AI provider refused the request
-- (nothing was billed). Only within 10 minutes, only once.
create or replace function private.release_ai_usage(p_usage bigint, p_user uuid)
returns boolean language sql security definer set search_path = '' as $$
  with r as (update public.ai_usage set released_at = now()
    where id = p_usage and user_id = p_user and released_at is null and created_at > now() - interval '10 minutes' returning 1)
  select exists(select 1 from r)
$$;

create or replace function public.claim_ai_usage(p_user uuid, p_operation text, p_image boolean default false)
returns jsonb language sql security invoker set search_path = '' as $$ select private.claim_ai_usage(p_user, p_operation, p_image) $$;
create or replace function public.release_ai_usage(p_usage bigint, p_user uuid)
returns boolean language sql security invoker set search_path = '' as $$ select private.release_ai_usage(p_usage, p_user) $$;
revoke all on function private.claim_ai_usage(uuid, text, boolean), private.release_ai_usage(bigint, uuid), private.ai_account_key(uuid), private.ai_usage_counts(text, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_ai_usage(uuid, text, boolean), public.release_ai_usage(bigint, uuid) from public, anon, authenticated;
grant execute on function private.claim_ai_usage(uuid, text, boolean), private.release_ai_usage(bigint, uuid), private.ai_account_key(uuid), private.ai_usage_counts(text, timestamptz) to service_role;
grant execute on function public.claim_ai_usage(uuid, text, boolean), public.release_ai_usage(bigint, uuid) to service_role;

-- GPT Live is Pro only.
create or replace function private.start_voice_session()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := (select auth.uid()); a jsonb; v_id uuid; v_max integer;
begin
  if u is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('voice:' || u::text, 0));
  update public.voice_sessions s set billed_seconds = private.voice_session_seconds(s, now()), ended_at = now(), end_reason = 'superseded'
    where s.user_id = u and s.ended_at is null;
  a := private.ai_allowance_for(u);
  if a->>'plan' <> 'pro' then raise exception 'plan_required' using errcode = 'P0001', hint = 'GPT voices and GPT Live are part of Home Base Pro.'; end if;
  v_max := (a->>'remaining_seconds')::integer;
  if v_max < 30 then raise exception 'voice_minutes_used_up' using errcode = 'P0001', hint = 'This month''s GPT Live minutes are used.'; end if;
  insert into public.voice_sessions (user_id, plan, max_seconds, last_seen_at) values (u, a->>'plan', v_max, now()) returning id into v_id;
  return a || jsonb_build_object('session_id', v_id, 'max_seconds', v_max);
end;
$$;
