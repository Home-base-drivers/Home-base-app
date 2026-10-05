-- Add dispatch intelligence to the existing trip/account system. No destructive rewrite.
alter table public.trip_rows alter column upload_id drop not null;
alter table public.trip_rows add column if not exists record_id text;
alter table public.trip_rows add column if not exists source text not null default 'csv' check(source in ('csv','manual','screenshot','provider'));
alter table public.trip_rows add column if not exists completeness text not null default 'unknown' check(completeness in ('partial','unknown','complete'));
alter table public.trip_rows add column if not exists confidence numeric not null default .5 check(confidence between 0 and 1);
alter table public.trip_rows add column if not exists provenance text not null default 'USER-REPORTED' check(provenance in ('LIVE','RECENT','HISTORICAL','PREDICTED','USER-REPORTED','SCREENSHOT-DERIVED'));
alter table public.trip_rows add column if not exists dedup_key text;
alter table public.trip_rows add column if not exists normalized jsonb not null default '{}' check(jsonb_typeof(normalized)='object' and octet_length(normalized::text)<32768);
create unique index if not exists dispatch_trip_id on public.trip_rows(user_id,record_id) where record_id is not null;
create unique index if not exists dispatch_trip_dedup on public.trip_rows(user_id,dedup_key) where dedup_key is not null;
-- Clients cannot forge provider history or overwrite a protected provider record.
drop policy if exists trip_rows_own_rows on public.trip_rows;
create policy trip_rows_own_read on public.trip_rows for select to authenticated using((select auth.uid())=user_id);
create policy trip_rows_own_delete on public.trip_rows for delete to authenticated using((select auth.uid())=user_id);
create policy trip_rows_own_insert on public.trip_rows for insert to authenticated with check((select auth.uid())=user_id and source<>'provider' and provenance in ('USER-REPORTED','SCREENSHOT-DERIVED'));
create policy trip_rows_own_update on public.trip_rows for update to authenticated using((select auth.uid())=user_id and source<>'provider') with check((select auth.uid())=user_id and source<>'provider' and provenance in ('USER-REPORTED','SCREENSHOT-DERIVED'));

create table public.driver_dispatch_state(
 user_id uuid primary key references auth.users(id) on delete cascade,
 settings jsonb not null default '{}' check(jsonb_typeof(settings)='object' and octet_length(settings::text)<32768),
 updated_at timestamptz not null default now()
);
create table public.dispatch_recommendations(
 user_id uuid not null references auth.users(id) on delete cascade,
 recommendation_id uuid not null,
 recorded_at timestamptz not null default now(),
 model_version text not null,
 recommendation jsonb not null check(jsonb_typeof(recommendation)='object' and octet_length(recommendation::text)<32768),
 outcome jsonb check(outcome is null or (jsonb_typeof(outcome)='object' and octet_length(outcome::text)<8192)),
 primary key(user_id,recommendation_id)
);
alter table public.driver_dispatch_state enable row level security;
alter table public.dispatch_recommendations enable row level security;
create policy dispatch_settings_own on public.driver_dispatch_state for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy dispatch_recommendation_own on public.dispatch_recommendations for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
revoke all on public.driver_dispatch_state,public.dispatch_recommendations from anon;
grant select,insert,update,delete on public.driver_dispatch_state,public.dispatch_recommendations to authenticated;
grant all on public.driver_dispatch_state,public.dispatch_recommendations to service_role;

create table public.platform_capabilities(
 platform text not null,action text not null,supported boolean not null default false,
 evidence_url text,verified_at timestamptz,primary key(platform,action),
 check(not supported or (evidence_url like 'https://%' and verified_at is not null))
);
create table public.platform_service_areas(
 platform text not null,effective_from date not null,effective_to date,
 markets jsonb not null,geometry jsonb,provenance text not null,note text,
 primary key(platform,effective_from),check(effective_to is null or effective_to>effective_from)
);
alter table public.platform_capabilities enable row level security;
alter table public.platform_service_areas enable row level security;
create policy capability_public_read on public.platform_capabilities for select to anon,authenticated using(true);
create policy service_area_public_read on public.platform_service_areas for select to anon,authenticated using(true);
grant select on public.platform_capabilities,public.platform_service_areas to anon,authenticated;
grant all on public.platform_capabilities,public.platform_service_areas to service_role;
insert into public.platform_capabilities(platform,action)
select p,a from unnest(array['Uber','Empower','Lyft']) p cross join unnest(array['read_trips','read_earnings','read_driver_status','pause_requests','resume_requests','accept_trip','decline_trip']) a;
insert into public.platform_service_areas values('Empower','2026-10-01',null,'["Baltimore","Washington DC","Northern Virginia"]',null,'USER-REPORTED','Driver-reported expansion; exact official polygon has not been verified.');

-- Atomic ingestion reuses trip_rows and computes identity on the server, not the client.
create function public.ingest_dispatch_trips(p_records jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare u uuid:=(select auth.uid());r jsonb;k text;rec public.trip_rows%rowtype;added integer:=0;dups integer:=0;origin text;dest text;stamp timestamptz;fare numeric;prov text;
begin
 if u is null then raise exception 'Sign in first' using errcode='42501';end if;
 if jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records)>500 then raise exception 'Import at most 500 trips' using errcode='22023';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,0));
 for r in select value from jsonb_array_elements(p_records) loop
  if r->>'source' not in ('screenshot','manual','csv') or coalesce(r->>'record_id','')='' or length(r->>'record_id')>128 or coalesce(r->>'platform','')='' or length(r->>'platform')>60 then raise exception 'Invalid client trip' using errcode='22023';end if;
  stamp:=nullif(r->>'request_time','')::timestamptz;fare:=(r->>'fare')::numeric;
  if fare is null or fare<0 or fare>100000 then raise exception 'Invalid fare' using errcode='22023';end if;
  origin:=lower(trim(regexp_replace(coalesce(r->>'origin',''),'\s+',' ','g')));dest:=lower(trim(regexp_replace(coalesce(r->>'destination',''),'\s+',' ','g')));
  if origin='' and jsonb_typeof(r->'pickup_location')='array' then origin:=(r->'pickup_location')::text;end if;
  if dest='' and jsonb_typeof(r->'dropoff_location')='array' then dest:=(r->'dropoff_location')::text;end if;
  k:=case when stamp is not null and origin<>'' and dest<>'' then md5(lower(trim(r->>'platform'))||'|'||stamp::text||'|'||round(fare,2)::text||'|'||origin||'|'||dest) else null end;
  select * into rec from public.trip_rows where user_id=u and (record_id=r->>'record_id' or (k is not null and dedup_key=k)) limit 1;
  prov:=case when r->>'source'='screenshot' then 'SCREENSHOT-DERIVED' else 'USER-REPORTED' end;
  if found then
   dups:=dups+1;
   -- Preserve provider authority; all duplicates remain one earnings observation.
   if rec.source='screenshot' and r->>'source' in ('csv','manual') then
    update public.trip_rows set normalized=r,source=r->>'source',provenance=prov,completeness=coalesce(r->>'completeness','unknown'),confidence=coalesce((r->>'confidence')::numeric,.5),duration_minutes=round((r->>'trip_time')::numeric),distance_miles=(r->>'trip_distance')::numeric,gross_earnings=fare+coalesce((r->>'tip')::numeric,0)+coalesce((r->>'bonus')::numeric,0) where id=rec.id;
   end if;
  else
   insert into public.trip_rows(user_id,record_id,market,platform,started_at,duration_minutes,gross_earnings,distance_miles,source,completeness,confidence,provenance,dedup_key,normalized)
   values(u,r->>'record_id',coalesce(r->>'market','Unknown'),r->>'platform',stamp,round((r->>'trip_time')::numeric),fare+coalesce((r->>'tip')::numeric,0)+coalesce((r->>'bonus')::numeric,0),(r->>'trip_distance')::numeric,r->>'source',coalesce(r->>'completeness','unknown'),coalesce((r->>'confidence')::numeric,.5),prov,k,r);
   added:=added+1;
  end if;
 end loop;
 return jsonb_build_object('added',added,'duplicates',dups);
end;$$;
revoke all on function public.ingest_dispatch_trips(jsonb) from public,anon;
grant execute on function public.ingest_dispatch_trips(jsonb) to authenticated;

-- Extend the existing deletion path. Precise base destinations stay on-device.
alter function public.delete_my_home_base_data() rename to delete_my_home_base_pre_dispatch;
revoke all on function public.delete_my_home_base_pre_dispatch() from public,anon;
create function public.delete_my_home_base_data() returns void language plpgsql security invoker set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'Sign in first' using errcode='42501';end if;
 perform public.delete_my_home_base_pre_dispatch();
 delete from public.driver_dispatch_state where user_id=(select auth.uid());
 delete from public.dispatch_recommendations where user_id=(select auth.uid());
end;$$;
revoke all on function public.delete_my_home_base_data() from public,anon;
grant execute on function public.delete_my_home_base_data() to authenticated;
