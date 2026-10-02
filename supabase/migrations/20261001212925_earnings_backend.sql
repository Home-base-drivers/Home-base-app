-- Home Base private account backend. Apply after the account bootstrap migration.
-- This does not connect a driver to any external earnings provider.

create schema if not exists private;
revoke all on schema private from public, anon;
create schema if not exists extensions;
alter extension pgcrypto set schema extensions;

alter table public.profiles
  add column benchmark_consent boolean not null default false;
alter table public.user_state add column version bigint not null default 1;
alter table public.user_state
  add constraint user_state_version_positive check (version > 0),
  add constraint user_state_object check (jsonb_typeof(state) = 'object'),
  add constraint user_state_size check (octet_length(state::text) <= 524288);

-- A trip cannot point at another driver's upload, even if its UUID is known.
alter table public.trip_uploads add constraint trip_uploads_owner_unique unique (id, user_id);
alter table public.trip_rows add constraint trip_rows_upload_owner_fk
  foreign key (upload_id, user_id) references public.trip_uploads(id, user_id) on delete cascade;
create index trip_rows_upload_owner_idx on public.trip_rows(upload_id, user_id);
create index trip_uploads_user_time_idx on public.trip_uploads(user_id, uploaded_at desc);

create table public.earnings_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  record_id text not null check (length(record_id) between 1 and 1024),
  platform text not null check (length(platform) between 1 and 60),
  local_date date check (local_date is null or isfinite(local_date)),
  started_at timestamptz check (started_at is null or isfinite(started_at)),
  time_precision boolean not null default false,
  amount numeric(14,2) not null check (amount between -1000000 and 10000000),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  pay_type text not null check (pay_type in ('gross', 'payout')),
  hours numeric(10,4) check (hours between 0 and 744),
  hours_type text not null check (hours_type in ('online', 'active', 'unknown')),
  miles numeric(14,2) check (miles between 0 and 1000000),
  trip_count integer check (trip_count between 0 and 1000000),
  source text not null check (source in ('csv', 'manual', 'provider')),
  source_filename text check (length(source_filename) <= 255),
  market text not null default 'Baltimore' check (length(market) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, record_id),
  constraint earnings_precise_timestamp check (not time_precision or started_at is not null)
);
create index earnings_user_date_idx on public.earnings_records(user_id, local_date desc);
create index earnings_user_platform_date_idx on public.earnings_records(user_id, platform, local_date desc);
create index earnings_benchmark_idx on public.earnings_records(market, started_at)
  where pay_type = 'gross' and hours_type = 'online' and hours > 0 and time_precision;

-- Browser clients can read connection status; only an approved server adapter
-- may mark an external account connected or update its successful sync time.
-- No access tokens, refresh tokens, or passwords are stored in this table.
create table public.account_connections (
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('Uber', 'Lyft', 'Empower')),
  provider text not null check (length(provider) between 1 and 80),
  status text not null default 'not_configured'
    check (status in ('not_configured', 'connecting', 'connected', 'reauth_required', 'disconnected', 'error', 'unsupported')),
  last_synced_at timestamptz,
  last_error_code text check (length(last_error_code) <= 80),
  updated_at timestamptz not null default now(),
  primary key (user_id, platform)
);
alter table public.earnings_records enable row level security;
alter table public.account_connections enable row level security;

create policy earnings_read_own on public.earnings_records for select to authenticated
  using ((select auth.uid()) = user_id);
create policy earnings_insert_own on public.earnings_records for insert to authenticated
  with check ((select auth.uid()) = user_id and source in ('csv', 'manual'));
create policy earnings_update_own on public.earnings_records for update to authenticated
  using ((select auth.uid()) = user_id and source in ('csv', 'manual'))
  with check ((select auth.uid()) = user_id and source in ('csv', 'manual'));
create policy earnings_delete_own on public.earnings_records for delete to authenticated
  using ((select auth.uid()) = user_id);
create policy connections_read_own on public.account_connections for select to authenticated
  using ((select auth.uid()) = user_id);
create policy connections_delete_own_inactive on public.account_connections for delete to authenticated
  using ((select auth.uid()) = user_id and status in ('not_configured', 'disconnected', 'unsupported'));

revoke all on public.earnings_records, public.account_connections from public, anon, authenticated;
grant select, insert, update, delete on public.earnings_records to authenticated;
grant select, delete on public.account_connections to authenticated;
grant select, insert, update, delete on public.earnings_records, public.account_connections to service_role;

create function private.touch_earnings_record()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.touch_earnings_record() from public, anon, authenticated;
create trigger earnings_touch before update on public.earnings_records
for each row execute function private.touch_earnings_record();

create function private.advance_state_version()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.advance_state_version() from public, anon, authenticated;
create trigger state_version before update on public.user_state
for each row execute function private.advance_state_version();

create function public.save_home_base_state(
  p_state jsonb,
  p_expected_version bigint,
  p_market text default 'Baltimore'
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_version bigint;
  v_key text;
begin
  if v_user is null then raise exception 'Sign in to save progress' using errcode = '42501'; end if;
  if p_expected_version is null or p_expected_version < 0 then
    raise exception 'Expected version is required' using errcode = '22023';
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' or octet_length(p_state::text) > 524288 then
    raise exception 'Progress must be an object smaller than 512 KiB' using errcode = '22023';
  end if;
  if p_market is null or length(p_market) not between 1 and 100 then
    raise exception 'Invalid market' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_state) loop
    if v_key not in ('homeBaseDriverProfile', 'homeBaseCostPrefs', 'homeBaseAlertPrefs',
      'homeBaseProductPrefs', 'homeBaseMapUi', 'homeBaseEarningsView', 'homeBaseShifts',
      'homeBaseForecastSnapshots', 'homeBaseForecastAccuracy') then
      raise exception 'Unsupported progress field: %', v_key using errcode = '22023';
    end if;
    if v_key in ('homeBaseShifts', 'homeBaseForecastSnapshots', 'homeBaseForecastAccuracy') then
      if jsonb_typeof(p_state -> v_key) <> 'array' then
        raise exception 'Progress history must be an array' using errcode = '22023';
      end if;
    elsif jsonb_typeof(p_state -> v_key) <> 'object' then
      raise exception 'Progress settings must be objects' using errcode = '22023';
    end if;
  end loop;
  update public.user_state set state = p_state, market = p_market
    where user_id = v_user and version = p_expected_version returning version into v_version;
  if v_version is null and p_expected_version = 0 then
    insert into public.user_state(user_id, state, market, version)
      values (v_user, p_state, p_market, 1)
      on conflict (user_id) do nothing returning version into v_version;
  end if;
  if v_version is null then
    raise exception 'Progress changed on another device. Reload before saving.' using errcode = '40001';
  end if;
  return jsonb_build_object('version', v_version, 'state', p_state);
end;
$$;

create function public.upsert_home_base_earnings(p_records jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_total integer;
  v_saved integer;
  v_protected integer;
begin
  if v_user is null then raise exception 'Sign in to save earnings' using errcode = '42501'; end if;
  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception 'Earnings records must be an array' using errcode = '22023';
  end if;
  v_total := jsonb_array_length(p_records);
  if v_total > 500 or octet_length(p_records::text) > 1048576 then
    raise exception 'Send at most 500 records and 1 MiB per request' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_records) r
    where jsonb_typeof(r) <> 'object' or r ? 'user_id' or
      coalesce(r ->> 'source', '') not in ('csv', 'manual')) then
    raise exception 'Invalid record or source. Driver ownership is assigned by the server.' using errcode = '22023';
  end if;
  if (select count(distinct r ->> 'record_id') from jsonb_array_elements(p_records) r) <> v_total then
    raise exception 'Each record must have a unique stable ID within the batch' using errcode = '22023';
  end if;
  select count(*) into v_protected from public.earnings_records e
    join jsonb_array_elements(p_records) r on e.record_id = r ->> 'record_id'
    where e.user_id = v_user and e.source = 'provider';
  -- A single failing row rolls back the entire batch. Provider-owned records
  -- retain their authoritative values; a CSV cannot overwrite them.
  insert into public.earnings_records as existing (
    user_id, record_id, platform, local_date, started_at, time_precision, amount,
    currency, pay_type, hours, hours_type, miles, trip_count, source, source_filename, market
  ) select v_user, r.record_id, r.platform, r.local_date, r.started_at,
      coalesce(r.time_precision, false), r.amount, coalesce(r.currency, 'USD'),
      r.pay_type, r.hours, r.hours_type, r.miles, r.trip_count, r.source,
      r.source_filename, coalesce(r.market, 'Baltimore')
    from jsonb_to_recordset(p_records) as r (
      record_id text, platform text, local_date date, started_at timestamptz,
      time_precision boolean, amount numeric, currency text, pay_type text,
      hours numeric, hours_type text, miles numeric, trip_count integer,
      source text, source_filename text, market text
    ) where not exists (select 1 from public.earnings_records e
      where e.user_id = v_user and e.record_id = r.record_id and e.source = 'provider')
    on conflict (user_id, record_id) do update set
      platform = excluded.platform, local_date = excluded.local_date,
      started_at = excluded.started_at, time_precision = excluded.time_precision,
      amount = excluded.amount, currency = excluded.currency, pay_type = excluded.pay_type,
      hours = excluded.hours, hours_type = excluded.hours_type, miles = excluded.miles,
      trip_count = excluded.trip_count, source = excluded.source,
      source_filename = excluded.source_filename, market = excluded.market
    where existing.source in ('csv', 'manual') and
      (existing.platform, existing.local_date, existing.started_at, existing.time_precision,
        existing.amount, existing.currency, existing.pay_type, existing.hours, existing.hours_type,
        existing.miles, existing.trip_count, existing.source, existing.source_filename, existing.market)
      is distinct from
      (excluded.platform, excluded.local_date, excluded.started_at, excluded.time_precision,
        excluded.amount, excluded.currency, excluded.pay_type, excluded.hours, excluded.hours_type,
        excluded.miles, excluded.trip_count, excluded.source, excluded.source_filename, excluded.market);
  get diagnostics v_saved = row_count;
  return jsonb_build_object('saved', v_saved, 'unchanged', v_total - v_saved - v_protected,
    'protected', v_protected, 'total', v_total);
end;
$$;

-- The only privileged read returns consenting, thresholded aggregates.
-- Active-trip hours, payouts, delivery work, future timestamps, and undated
-- records never contribute to the rideshare online-hour benchmark.
create function private.market_hourly_benchmark(p_market text, p_day integer, p_hour integer)
returns table (gross_per_hour numeric, contributing_users bigint, trip_count bigint,
  sample_hours numeric, refreshed_at timestamptz)
language plpgsql security definer set search_path = '' stable as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_day is null or p_hour is null or p_day not between 0 and 6 or p_hour not between 0 and 23 or p_market is null then
    raise exception 'Invalid benchmark time or market' using errcode = '22023';
  end if;
  return query
  with sample as (
    select e.user_id, e.amount, e.hours, coalesce(e.trip_count, 0) as trips
    from public.earnings_records e join public.profiles p on p.id = e.user_id
    where p.benchmark_consent and lower(e.market) = lower(p_market)
      and e.pay_type = 'gross' and e.hours_type = 'online' and e.hours > 0
      and e.time_precision and e.platform in ('Uber', 'Lyft', 'Empower')
      and e.started_at >= now() - interval '90 days' and e.started_at <= now()
      and extract(dow from e.started_at at time zone 'America/New_York')::integer = p_day
      and extract(hour from e.started_at at time zone 'America/New_York')::integer = p_hour
  ), totals as (
    select count(distinct s.user_id) as users, sum(s.trips)::bigint as trips,
      sum(s.amount) as gross, sum(s.hours) as hours from sample s
  ) select round(t.gross / nullif(t.hours, 0), 2), t.users, t.trips, round(t.hours, 2), now()
    from totals t where t.users >= 5 and t.trips >= 20 and t.hours > 0;
end;
$$;
revoke all on function private.market_hourly_benchmark(text, integer, integer) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.market_hourly_benchmark(text, integer, integer) to authenticated;

create or replace function public.get_market_hourly_benchmark(p_market text, p_day integer, p_hour integer)
returns table (gross_per_hour numeric, contributing_users bigint, trip_count bigint,
  sample_hours numeric, refreshed_at timestamptz)
language sql security invoker set search_path = '' stable as $$
  select * from private.market_hourly_benchmark(p_market, p_day, p_hour);
$$;

create or replace function public.delete_my_home_base_data()
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  -- Provider connections are intentionally server-managed. The deletion RPC
  -- refuses to pretend an external account was revoked while still linked.
  if exists (select 1 from public.account_connections where user_id = (select auth.uid())
    and status in ('connected', 'connecting', 'reauth_required', 'error')) then
    raise exception 'Disconnect linked platforms before clearing cloud data' using errcode = '55000';
  end if;
  delete from public.account_connections where user_id = (select auth.uid());
  delete from public.earnings_records where user_id = (select auth.uid());
  delete from public.trip_rows where user_id = (select auth.uid());
  delete from public.trip_uploads where user_id = (select auth.uid());
  delete from public.progress_events where user_id = (select auth.uid());
  delete from public.user_state where user_id = (select auth.uid());
  delete from public.profiles where id = (select auth.uid());
end;
$$;

revoke all on function public.save_home_base_state(jsonb, bigint, text) from public, anon;
revoke all on function public.upsert_home_base_earnings(jsonb) from public, anon;
revoke all on function public.get_market_hourly_benchmark(text, integer, integer) from public, anon;
revoke all on function public.delete_my_home_base_data() from public, anon;
grant execute on function public.save_home_base_state(jsonb, bigint, text) to authenticated;
grant execute on function public.upsert_home_base_earnings(jsonb) to authenticated;
grant execute on function public.get_market_hourly_benchmark(text, integer, integer) to authenticated;
grant execute on function public.delete_my_home_base_data() to authenticated;

-- Explicit grants are required by new Supabase Data API defaults.
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on public.profiles, public.user_state,
  public.progress_events, public.trip_uploads, public.trip_rows to authenticated, service_role;
revoke all on public.profiles, public.user_state, public.progress_events,
  public.trip_uploads, public.trip_rows from public, anon;
