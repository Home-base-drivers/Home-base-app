-- Optional first-party learning. No raw GPS, provider secrets or sale endpoint.
create table public.privacy_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  usage_analytics boolean not null default false,
  model_improvement boolean not null default false,
  benchmark_sharing boolean not null default false,
  policy_version text not null default '2026-10-03',
  updated_at timestamptz not null default now()
);
create table public.consent_receipts (
  receipt_id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  choices jsonb not null,
  policy_version text not null,
  recorded_at timestamptz not null default now()
);
create index consent_user_time_idx on public.consent_receipts(user_id, recorded_at);
create table public.usage_events (
  event_id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null check (event_name in ('view_map','view_earnings','view_profile','view_support','view_alerts',
    'recommendation_opened','navigation_started','csv_imported','shift_started','shift_completed','sponsor_clicked')),
  surface text not null check (surface in ('app','map','earnings','profile','support','alerts','sponsor')),
  recorded_at timestamptz not null default now()
);
create index usage_user_time_idx on public.usage_events(user_id, recorded_at);
create table public.model_predictions (
  user_id uuid not null references auth.users(id) on delete cascade,
  prediction_id uuid not null,
  model_version text not null check (length(model_version) between 1 and 60),
  area text not null check (length(area) between 1 and 120),
  platform text not null check (platform in ('Uber','Lyft','Empower')),
  horizon_minutes integer not null check (horizon_minutes in (15,30,60)),
  forecast_for timestamptz not null,
  gross_hourly_estimate numeric(8,2) not null check (gross_hourly_estimate between 0 and 1000),
  input_status text not null check (input_status in ('modeled','provider_context','history_estimate')),
  recorded_at timestamptz not null default now(),
  primary key (user_id, prediction_id),
  check (forecast_for >= recorded_at and forecast_for <= recorded_at + interval '90 minutes')
);
create index predictions_user_time_idx on public.model_predictions(user_id, recorded_at);
create table public.shift_observations (
  user_id uuid not null references auth.users(id) on delete cascade,
  observation_id uuid not null,
  shift_id uuid not null,
  area text not null check (length(area) between 1 and 120),
  observed_at timestamptz not null,
  source text not null default 'foreground_neighborhood' check (source = 'foreground_neighborhood'),
  recorded_at timestamptz not null default now(),
  primary key (user_id, observation_id),
  check (observed_at between recorded_at - interval '10 minutes' and recorded_at + interval '1 minute')
);
create index observations_user_time_idx on public.shift_observations(user_id, recorded_at);
-- Subscription entitlements can only be changed by a verified billing adapter.
create table public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','plus')),
  status text not null default 'inactive' check (status in ('inactive','active','past_due','cancelled')),
  paid_through timestamptz,
  updated_at timestamptz not null default now()
);
-- No public commercial exports until rights review and deidentification approval.
create table private.analytics_release_registry (
  release_id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  status text not null default 'blocked' check (status in ('blocked','review','approved','withdrawn')),
  rights_reviewed_at timestamptz,
  privacy_reviewed_at timestamptz,
  approved_by text,
  check (status <> 'approved' or (rights_reviewed_at is not null and privacy_reviewed_at is not null and approved_by is not null))
);
alter table private.analytics_release_registry enable row level security;
revoke all on private.analytics_release_registry from public, anon, authenticated;
grant all on private.analytics_release_registry to service_role;

alter table public.privacy_preferences enable row level security;
alter table public.consent_receipts enable row level security;
alter table public.usage_events enable row level security;
alter table public.model_predictions enable row level security;
alter table public.shift_observations enable row level security;
alter table public.subscriptions enable row level security;

create policy privacy_own_read on public.privacy_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy receipts_own_read on public.consent_receipts for select to authenticated using ((select auth.uid()) = user_id);
create policy usage_own_read on public.usage_events for select to authenticated using ((select auth.uid()) = user_id);
create policy usage_consented_insert on public.usage_events for insert to authenticated with check (
  (select auth.uid()) = user_id and exists (select 1 from public.privacy_preferences p where p.user_id = (select auth.uid()) and p.usage_analytics));
create policy predictions_own_read on public.model_predictions for select to authenticated using ((select auth.uid()) = user_id);
create policy predictions_consented_insert on public.model_predictions for insert to authenticated with check (
  (select auth.uid()) = user_id and exists (select 1 from public.privacy_preferences p where p.user_id = (select auth.uid()) and p.model_improvement));
create policy observations_own_read on public.shift_observations for select to authenticated using ((select auth.uid()) = user_id);
create policy observations_consented_insert on public.shift_observations for insert to authenticated with check (
  (select auth.uid()) = user_id and exists (select 1 from public.privacy_preferences p where p.user_id = (select auth.uid()) and p.model_improvement));
create policy subscriptions_own_read on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.privacy_preferences, public.consent_receipts, public.usage_events,
  public.model_predictions, public.shift_observations, public.subscriptions from public, anon, authenticated;
grant select on public.privacy_preferences, public.consent_receipts, public.subscriptions to authenticated;
grant select, insert on public.usage_events, public.model_predictions, public.shift_observations to authenticated;
grant usage on sequence public.usage_events_event_id_seq to authenticated;
grant all on public.privacy_preferences, public.consent_receipts, public.usage_events,
  public.model_predictions, public.shift_observations, public.subscriptions to service_role;

-- Locked private definer is necessary to write immutable consent receipts and
-- erase optional learning history without granting browsers audit-write access.
create function private.set_home_base_privacy(p_usage boolean, p_model boolean, p_benchmark boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_choices jsonb;
begin
  if v_user is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_usage is null or p_model is null or p_benchmark is null then raise exception 'Explicit choices required' using errcode = '22023'; end if;
  -- Shared user lock serializes preference changes and collection inserts.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  v_choices := jsonb_build_object('usage_analytics',p_usage,'model_improvement',p_model,'benchmark_sharing',p_benchmark);
  insert into public.privacy_preferences(user_id,usage_analytics,model_improvement,benchmark_sharing)
    values(v_user,p_usage,p_model,p_benchmark) on conflict(user_id) do update set
      usage_analytics=excluded.usage_analytics,model_improvement=excluded.model_improvement,
      benchmark_sharing=excluded.benchmark_sharing,updated_at=now();
  insert into public.consent_receipts(user_id,choices,policy_version) values(v_user,v_choices,'2026-10-03');
  update public.profiles set benchmark_consent=p_benchmark where id=v_user;
  if not p_usage then delete from public.usage_events where user_id=v_user; end if;
  if not p_model then
    delete from public.model_predictions where user_id=v_user;
    delete from public.shift_observations where user_id=v_user;
  end if;
  return v_choices;
end; $$;
revoke all on function private.set_home_base_privacy(boolean,boolean,boolean) from public, anon;
grant execute on function private.set_home_base_privacy(boolean,boolean,boolean) to authenticated;
create function public.set_home_base_privacy(p_usage boolean,p_model boolean,p_benchmark boolean)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.set_home_base_privacy(p_usage,p_model,p_benchmark);
$$;
revoke all on function public.set_home_base_privacy(boolean,boolean,boolean) from public,anon;
grant execute on function public.set_home_base_privacy(boolean,boolean,boolean) to authenticated;

create function private.collection_clock_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
  new.recorded_at := clock_timestamp();
  if tg_table_name = 'usage_events' then
    if not exists(select 1 from public.privacy_preferences where user_id=new.user_id and usage_analytics) then
      raise exception 'Usage consent required' using errcode='42501';
    end if;
    if (select count(*) from public.usage_events where user_id=new.user_id and recorded_at>now()-interval '1 day') >= 500 then
      raise exception 'Daily usage limit reached' using errcode='54000';
    end if;
  else
    if not exists(select 1 from public.privacy_preferences where user_id=new.user_id and model_improvement) then
      raise exception 'Model consent required' using errcode='42501';
    end if;
    if tg_table_name = 'model_predictions' and
      (select count(*) from public.model_predictions where user_id=new.user_id and recorded_at>now()-interval '1 day') >= 600 then
      raise exception 'Daily prediction limit reached' using errcode='54000';
    end if;
    if tg_table_name = 'shift_observations' and
      (select count(*) from public.shift_observations where user_id=new.user_id and recorded_at>now()-interval '1 day') >= 288 then
      raise exception 'Daily observation limit reached' using errcode='54000';
    end if;
  end if;
  return new;
end; $$;
revoke all on function private.collection_clock_guard() from public, anon, authenticated;
create trigger usage_clock before insert on public.usage_events for each row execute function private.collection_clock_guard();
create trigger prediction_clock before insert on public.model_predictions for each row execute function private.collection_clock_guard();
create trigger observation_clock before insert on public.shift_observations for each row execute function private.collection_clock_guard();

-- Own-data deletion extends the existing flow; external connections still block it.
create function private.clear_optional_home_base_data() returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  delete from public.usage_events where user_id=v_user;
  delete from public.model_predictions where user_id=v_user;
  delete from public.shift_observations where user_id=v_user;
  delete from public.consent_receipts where user_id=v_user;
  delete from public.privacy_preferences where user_id=v_user;
end; $$;
revoke all on function private.clear_optional_home_base_data() from public,anon;
grant execute on function private.clear_optional_home_base_data() to authenticated;
alter function public.delete_my_home_base_data() rename to delete_my_home_base_core_data;
revoke all on function public.delete_my_home_base_core_data() from public,anon;
create function public.delete_my_home_base_data() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  perform public.delete_my_home_base_core_data();
  perform private.clear_optional_home_base_data();
end; $$;
revoke all on function public.delete_my_home_base_data() from public,anon;
grant execute on function public.delete_my_home_base_data() to authenticated;

create function private.prune_home_base_learning() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.usage_events where recorded_at < now()-interval '90 days';
  delete from public.shift_observations where recorded_at < now()-interval '90 days';
  delete from public.model_predictions where recorded_at < now()-interval '180 days';
end; $$;
revoke all on function private.prune_home_base_learning() from public,anon,authenticated;
grant execute on function private.prune_home_base_learning() to service_role;

-- Contextual sponsorship inventory, not behavioral ad targeting.
create table public.sponsor_campaigns (
  campaign_id uuid primary key default extensions.gen_random_uuid(),
  advertiser text not null check(length(advertiser) between 1 and 100),
  headline text not null check(length(headline) between 1 and 150),
  description text not null check(length(description) <= 400),
  destination_url text not null check(destination_url ~ '^https://[a-zA-Z0-9.-]+(/[^[:space:]]*)?$'),
  active boolean not null default false,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  check(ends_at>starts_at)
);
alter table public.sponsor_campaigns enable row level security;
create policy sponsors_active_read on public.sponsor_campaigns for select to anon,authenticated
  using(active and starts_at<=now() and ends_at>now());
revoke all on public.sponsor_campaigns from public,anon,authenticated;
grant select on public.sponsor_campaigns to anon,authenticated;
grant all on public.sponsor_campaigns to service_role;
