-- Home Base account, progress, and privacy-safe trip benchmark schema.
-- Run this once in a Supabase project's SQL editor before enabling cloud sync.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  home_market text not null default 'Baltimore',
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create table if not exists public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  market text not null default 'Baltimore',
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.progress_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (length(event_type) between 1 and 80),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.trip_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  row_count integer not null default 0 check (row_count >= 0),
  market text not null,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.trip_rows (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  upload_id uuid not null references public.trip_uploads(id) on delete cascade,
  source_row integer,
  source_filename text,
  market text not null,
  platform text not null default 'Unknown',
  started_at timestamptz,
  duration_minutes integer check (duration_minutes is null or duration_minutes between 1 and 1440),
  gross_earnings numeric(10,2) not null check (gross_earnings between -10000 and 100000),
  distance_miles numeric(10,2) check (distance_miles is null or distance_miles between 0 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists trip_rows_user_started_idx on public.trip_rows(user_id, started_at desc);
create index if not exists trip_rows_market_time_idx on public.trip_rows(market, started_at);
create index if not exists progress_events_user_time_idx on public.progress_events(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.user_state enable row level security;
alter table public.progress_events enable row level security;
alter table public.trip_uploads enable row level security;
alter table public.trip_rows enable row level security;

drop policy if exists "profiles_own_rows" on public.profiles;
create policy "profiles_own_rows" on public.profiles for all to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "user_state_own_rows" on public.user_state;
create policy "user_state_own_rows" on public.user_state for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "progress_events_own_rows" on public.progress_events;
create policy "progress_events_own_rows" on public.progress_events for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "trip_uploads_own_rows" on public.trip_uploads;
create policy "trip_uploads_own_rows" on public.trip_uploads for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "trip_rows_own_rows" on public.trip_rows;
create policy "trip_rows_own_rows" on public.trip_rows for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Returns only a grouped market/day/hour benchmark. It reveals no rows and
-- returns nothing until both anonymity thresholds are satisfied.
create or replace function public.get_market_hourly_benchmark(
  p_market text,
  p_day integer,
  p_hour integer
)
returns table (
  gross_per_hour numeric,
  contributing_users bigint,
  trip_count bigint,
  sample_hours numeric,
  refreshed_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  with sample as (
    select
      tr.user_id,
      tr.gross_earnings,
      tr.duration_minutes
    from public.trip_rows tr
    where lower(tr.market) = lower(p_market)
      and tr.started_at >= now() - interval '90 days'
      and extract(dow from tr.started_at at time zone 'America/New_York')::integer = p_day
      and extract(hour from tr.started_at at time zone 'America/New_York')::integer = p_hour
      and tr.duration_minutes between 1 and 1440
  ), totals as (
    select
      count(distinct user_id) as users,
      count(*) as trips,
      sum(gross_earnings) as gross,
      sum(duration_minutes)::numeric / 60 as hours
    from sample
  )
  select
    round(gross / nullif(hours, 0), 2),
    users,
    trips,
    round(hours, 2),
    now()
  from totals
  where users >= 5 and trips >= 20 and hours > 0;
$$;

create or replace function public.delete_my_home_base_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.trip_rows where user_id = auth.uid();
  delete from public.trip_uploads where user_id = auth.uid();
  delete from public.progress_events where user_id = auth.uid();
  delete from public.user_state where user_id = auth.uid();
  delete from public.profiles where id = auth.uid();
end;
$$;

revoke all on public.profiles, public.user_state, public.progress_events, public.trip_uploads, public.trip_rows from anon;
grant select, insert, update, delete on public.profiles, public.user_state, public.progress_events, public.trip_uploads, public.trip_rows to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on function public.get_market_hourly_benchmark(text, integer, integer) from public;
revoke all on function public.delete_my_home_base_data() from public;
grant execute on function public.get_market_hourly_benchmark(text, integer, integer) to authenticated;
grant execute on function public.delete_my_home_base_data() to authenticated;
