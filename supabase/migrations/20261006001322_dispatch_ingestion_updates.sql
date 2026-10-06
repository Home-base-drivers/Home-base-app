-- Stable identities and final-fare corrections without creating another trip ledger.
create or replace function public.dispatch_trip_fingerprint(r jsonb) returns text
language plpgsql stable set search_path='' as $$
declare origin text;dest text;stamp timestamptz;fare numeric;
begin
 stamp:=nullif(r->>'request_time','')::timestamptz;fare:=(r->>'fare')::numeric;
 origin:=lower(trim(regexp_replace(coalesce(r->>'origin',''),'\s+',' ','g')));
 dest:=lower(trim(regexp_replace(coalesce(r->>'destination',''),'\s+',' ','g')));
 if origin='' and jsonb_typeof(r->'pickup_location')='array' then
  origin:=round((r#>>'{pickup_location,0}')::numeric,4)::text||','||round((r#>>'{pickup_location,1}')::numeric,4)::text;
 end if;
 if dest='' and jsonb_typeof(r->'dropoff_location')='array' then
  dest:=round((r#>>'{dropoff_location,0}')::numeric,4)::text||','||round((r#>>'{dropoff_location,1}')::numeric,4)::text;
 end if;
 if stamp is null or fare is null or origin='' or dest='' then return null;end if;
 return md5(lower(trim(r->>'platform'))||'|'||to_char(stamp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')||'|'||round(fare,2)::text||'|'||origin||'|'||dest);
end;$$;
revoke all on function public.dispatch_trip_fingerprint(jsonb) from public,anon;
grant execute on function public.dispatch_trip_fingerprint(jsonb) to authenticated,service_role;

create or replace function public.ingest_dispatch_trips(p_records jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare u uuid:=(select auth.uid());r jsonb;k text;rec public.trip_rows%rowtype;merged jsonb;
 added integer:=0;dups integer:=0;updates integer:=0;key text;amount numeric;prov text;incoming_rank integer;old_rank integer;
begin
 if u is null then raise exception 'Sign in first' using errcode='42501';end if;
 if jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records)>500 then raise exception 'Import at most 500 trips' using errcode='22023';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,0));
 for r in select value from jsonb_array_elements(p_records) loop
  if jsonb_typeof(r)<>'object' or coalesce(r->>'source','') not in ('screenshot','manual','csv') or coalesce(r->>'record_id','')='' or length(r->>'record_id')>128 or trim(coalesce(r->>'platform',''))='' or length(r->>'platform')>60 then raise exception 'Invalid client trip' using errcode='22023';end if;
  if r->>'status' is not null and r->>'status' not in ('offer','completed','historical_example') then raise exception 'Invalid trip status' using errcode='22023';end if;
  foreach key in array array['fare','tip','bonus','toll','pickup_time','pickup_distance','trip_time','trip_distance','online_time','dead_miles','unreimbursed_tolls'] loop
   amount:=(r->>key)::numeric;
   if (key='fare' and amount is null) or amount<0 or amount>100000 then raise exception 'Invalid trip amount or duration' using errcode='22023';end if;
  end loop;
  foreach key in array array['pickup_location','dropoff_location'] loop
   if r->key is not null and r->key<>'null'::jsonb then
    if jsonb_typeof(r->key)<>'array' or jsonb_array_length(r->key)<>2 then raise exception 'Invalid trip coordinates' using errcode='22023';end if;
    if jsonb_typeof(r->key->0)<>'number' or jsonb_typeof(r->key->1)<>'number' or abs((r->key->>0)::numeric)>90 or abs((r->key->>1)::numeric)>180 then raise exception 'Invalid trip coordinates' using errcode='22023';end if;
   end if;
  end loop;
  k:=public.dispatch_trip_fingerprint(r);
  -- The fallback recognizes records created before the canonical fingerprint was introduced.
  select * into rec from public.trip_rows where user_id=u and
   (record_id=r->>'record_id' or (k is not null and (dedup_key=k or public.dispatch_trip_fingerprint(normalized)=k)))
   order by (record_id=r->>'record_id') desc limit 1;
  prov:=case when r->>'source'='screenshot' then 'SCREENSHOT-DERIVED' else 'USER-REPORTED' end;
  if found then
   dups:=dups+1;
   if lower(trim(rec.platform))<>lower(trim(r->>'platform')) then raise exception 'Trip identity belongs to another platform' using errcode='22023';end if;
   incoming_rank:=case r->>'source' when 'csv' then 2 when 'manual' then 1 else 0 end;
   old_rank:=case rec.source when 'provider' then 3 when 'csv' then 2 when 'manual' then 1 else 0 end;
   if rec.source<>'provider' and (incoming_rank>old_rank or (incoming_rank=old_rank and rec.record_id=r->>'record_id'))
      and not (coalesce(rec.normalized->>'status','')='completed' and coalesce(r->>'status','')='offer') then
    merged:=(rec.normalized||jsonb_strip_nulls(r))||jsonb_build_object('record_id',rec.record_id);
    update public.trip_rows set normalized=merged,source=r->>'source',provenance=prov,
     completeness=coalesce(merged->>'completeness','unknown'),confidence=coalesce((merged->>'confidence')::numeric,.5),
     started_at=nullif(merged->>'request_time','')::timestamptz,dedup_key=public.dispatch_trip_fingerprint(merged),
     duration_minutes=round((merged->>'trip_time')::numeric),distance_miles=(merged->>'trip_distance')::numeric,
     gross_earnings=(merged->>'fare')::numeric+coalesce((merged->>'tip')::numeric,0)+coalesce((merged->>'bonus')::numeric,0) where id=rec.id;
    updates:=updates+1;
   end if;
  else
   insert into public.trip_rows(user_id,record_id,market,platform,started_at,duration_minutes,gross_earnings,distance_miles,source,completeness,confidence,provenance,dedup_key,normalized)
   values(u,r->>'record_id',coalesce(r->>'market','Unknown'),trim(r->>'platform'),nullif(r->>'request_time','')::timestamptz,
    round((r->>'trip_time')::numeric),(r->>'fare')::numeric+coalesce((r->>'tip')::numeric,0)+coalesce((r->>'bonus')::numeric,0),
    (r->>'trip_distance')::numeric,r->>'source',coalesce(r->>'completeness','unknown'),coalesce((r->>'confidence')::numeric,.5),prov,k,r);
   added:=added+1;
  end if;
 end loop;
 return jsonb_build_object('added',added,'duplicates',dups,'updated',updates);
end;$$;
revoke all on function public.ingest_dispatch_trips(jsonb) from public,anon;
grant execute on function public.ingest_dispatch_trips(jsonb) to authenticated;
