-- Paid plans and GPT Live voice minutes, enforced on the server.
-- Free: built-in AI only. Plus/Pro: GPT chat + a monthly GPT Live allowance.
-- Minutes are billed from server time only; the phone never reports its own usage.

create table if not exists public.ai_plan_limits (
  plan text primary key check (plan in ('free', 'plus', 'pro')),
  included_voice_seconds integer not null check (included_voice_seconds >= 0),
  monthly_price_usd numeric(8,2) not null check (monthly_price_usd >= 0),
  updated_at timestamptz not null default now()
);
insert into public.ai_plan_limits (plan, included_voice_seconds, monthly_price_usd) values
  ('free', 0, 0), ('plus', 7200, 19.99), ('pro', 15600, 39.99)
on conflict (plan) do nothing;

create table if not exists public.ai_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' references public.ai_plan_limits(plan),
  current_period_end timestamptz,                 -- null = no expiry (owner/manual)
  extra_voice_seconds integer not null default 0 check (extra_voice_seconds >= 0),
  extra_month date,                               -- add-on minutes apply to this month only
  source text not null default 'manual' check (length(source) between 1 and 60),
  updated_at timestamptz not null default now()
);

create table if not exists public.voice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz,
  ended_at timestamptz,
  max_seconds integer not null check (max_seconds > 0),
  billed_seconds integer check (billed_seconds >= 0),
  end_reason text check (end_reason is null or length(end_reason) <= 40)
);
create index if not exists voice_sessions_user_started on public.voice_sessions (user_id, started_at desc);

alter table public.ai_plan_limits enable row level security;
alter table public.ai_entitlements enable row level security;
alter table public.voice_sessions enable row level security;
drop policy if exists "plans are readable" on public.ai_plan_limits;
create policy "plans are readable" on public.ai_plan_limits for select to authenticated using (true);
drop policy if exists "own entitlement" on public.ai_entitlements;
create policy "own entitlement" on public.ai_entitlements for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "own voice sessions" on public.voice_sessions;
create policy "own voice sessions" on public.voice_sessions for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.ai_plan_limits, public.ai_entitlements, public.voice_sessions from anon, authenticated;
grant select on public.ai_plan_limits, public.ai_entitlements, public.voice_sessions to authenticated;
grant all on public.ai_plan_limits, public.ai_entitlements, public.voice_sessions to service_role;

-- Seconds a session counts for. An open session counts until its last heartbeat
-- plus 45 seconds (so a crashed phone is not billed to its cap), never past its cap.
create or replace function private.voice_session_seconds(s public.voice_sessions, at_time timestamptz)
returns integer language sql stable set search_path = '' as $$
  select case when s.billed_seconds is not null then s.billed_seconds
    else least(s.max_seconds, greatest(0, floor(extract(epoch from
      least(at_time, coalesce(s.last_seen_at, s.started_at) + interval '45 seconds') - s.started_at))))::integer end
$$;

create or replace function private.ai_allowance_for(u uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  local_month timestamp := date_trunc('month', now() at time zone 'America/New_York');
  period_start timestamptz := local_month at time zone 'America/New_York';
  period_end timestamptz := (local_month + interval '1 month') at time zone 'America/New_York';
  e public.ai_entitlements%rowtype;
  v_plan text := 'free';
  v_included integer := 0;
  v_extra integer := 0;
  v_used integer := 0;
begin
  select * into e from public.ai_entitlements where user_id = u;
  if found and (e.current_period_end is null or e.current_period_end > now()) then v_plan := e.plan; end if;
  select included_voice_seconds into v_included from public.ai_plan_limits where plan = v_plan;
  if found and e.extra_month = local_month::date then v_extra := e.extra_voice_seconds; end if;
  select coalesce(sum(private.voice_session_seconds(s, now())), 0)::integer into v_used
    from public.voice_sessions s where s.user_id = u and s.started_at >= period_start;
  return jsonb_build_object('plan', v_plan, 'included_seconds', coalesce(v_included, 0), 'extra_seconds', v_extra,
    'used_seconds', v_used, 'remaining_seconds', greatest(0, coalesce(v_included, 0) + v_extra - v_used),
    'period_start', period_start, 'period_end', period_end);
end;
$$;

create or replace function private.my_ai_allowance()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  return private.ai_allowance_for((select auth.uid()));
end;
$$;

-- Opens a metered GPT Live session. Raises plan_required / voice_minutes_used_up.
create or replace function private.start_voice_session()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := (select auth.uid()); a jsonb; v_id uuid; v_max integer;
begin
  if u is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('voice:' || u::text, 0));
  -- One live session at a time: close any left open (billed at what they used).
  update public.voice_sessions s set billed_seconds = private.voice_session_seconds(s, now()), ended_at = now(), end_reason = 'superseded'
    where s.user_id = u and s.ended_at is null;
  a := private.ai_allowance_for(u);
  if a->>'plan' = 'free' then raise exception 'plan_required' using errcode = 'P0001', hint = 'GPT Live voice is part of Home Base Plus.'; end if;
  v_max := (a->>'remaining_seconds')::integer;
  if v_max < 30 then raise exception 'voice_minutes_used_up' using errcode = 'P0001', hint = 'This month''s GPT Live minutes are used.'; end if;
  insert into public.voice_sessions (user_id, plan, max_seconds, last_seen_at) values (u, a->>'plan', v_max, now()) returning id into v_id;
  return a || jsonb_build_object('session_id', v_id, 'max_seconds', v_max);
end;
$$;

create or replace function private.heartbeat_voice_session(p_session uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := (select auth.uid()); s public.voice_sessions%rowtype;
begin
  if u is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  update public.voice_sessions set last_seen_at = now()
    where id = p_session and user_id = u and ended_at is null returning * into s;
  if not found then return jsonb_build_object('open', false, 'seconds_left', 0); end if;
  return jsonb_build_object('open', true, 'seconds_left', greatest(0, s.max_seconds - floor(extract(epoch from now() - s.started_at))::integer));
end;
$$;

create or replace function private.end_voice_session(p_session uuid, p_reason text default 'ended')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := (select auth.uid()); reason text := left(coalesce(p_reason, 'ended'), 40);
begin
  if u is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  update public.voice_sessions s set
    last_seen_at = now(), ended_at = now(), end_reason = reason,
    -- A session that never connected costs nothing.
    billed_seconds = case when reason = 'failed' then 0
      else least(s.max_seconds, greatest(0, floor(extract(epoch from now() - s.started_at))))::integer end
    where s.id = p_session and s.user_id = u and s.ended_at is null;
  return private.ai_allowance_for(u);
end;
$$;

-- Plan changes come only from the server (billing webhook, owner tools).
create or replace function private.set_ai_plan(p_user uuid, p_plan text, p_source text, p_period_end timestamptz default null,
  p_extra_voice_seconds integer default null, p_extra_month date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  insert into public.ai_entitlements (user_id, plan, source, current_period_end, extra_voice_seconds, extra_month, updated_at)
    values (p_user, p_plan, p_source, p_period_end, coalesce(p_extra_voice_seconds, 0), p_extra_month, now())
  on conflict (user_id) do update set plan = excluded.plan, source = excluded.source, current_period_end = excluded.current_period_end,
    extra_voice_seconds = coalesce(p_extra_voice_seconds, public.ai_entitlements.extra_voice_seconds),
    extra_month = coalesce(p_extra_month, public.ai_entitlements.extra_month), updated_at = now();
  return private.ai_allowance_for(p_user);
end;
$$;

-- Privileged work lives in private (security definer); public exposes thin
-- security-invoker wrappers, matching the rest of the schema.
create or replace function public.my_ai_allowance() returns jsonb language sql security invoker set search_path = '' as $$ select private.my_ai_allowance() $$;
create or replace function public.start_voice_session() returns jsonb language sql security invoker set search_path = '' as $$ select private.start_voice_session() $$;
create or replace function public.heartbeat_voice_session(p_session uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.heartbeat_voice_session(p_session) $$;
create or replace function public.end_voice_session(p_session uuid, p_reason text default 'ended') returns jsonb language sql security invoker set search_path = '' as $$ select private.end_voice_session(p_session, p_reason) $$;
create or replace function public.set_ai_plan(p_user uuid, p_plan text, p_source text, p_period_end timestamptz default null,
  p_extra_voice_seconds integer default null, p_extra_month date default null)
returns jsonb language sql security invoker set search_path = '' as $$ select private.set_ai_plan(p_user, p_plan, p_source, p_period_end, p_extra_voice_seconds, p_extra_month) $$;

revoke all on function private.voice_session_seconds(public.voice_sessions, timestamptz) from public, anon, authenticated;
revoke all on function private.ai_allowance_for(uuid) from public, anon, authenticated;
revoke all on function private.my_ai_allowance(), private.start_voice_session(), private.heartbeat_voice_session(uuid),
  private.end_voice_session(uuid, text), private.set_ai_plan(uuid, text, text, timestamptz, integer, date) from public, anon, authenticated;
revoke all on function public.my_ai_allowance(), public.start_voice_session(), public.heartbeat_voice_session(uuid),
  public.end_voice_session(uuid, text), public.set_ai_plan(uuid, text, text, timestamptz, integer, date) from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;
grant execute on function private.my_ai_allowance(), private.start_voice_session(), private.heartbeat_voice_session(uuid),
  private.end_voice_session(uuid, text) to authenticated;
grant execute on function public.my_ai_allowance(), public.start_voice_session(), public.heartbeat_voice_session(uuid),
  public.end_voice_session(uuid, text) to authenticated;
grant execute on function private.set_ai_plan(uuid, text, text, timestamptz, integer, date),
  public.set_ai_plan(uuid, text, text, timestamptz, integer, date) to service_role;
