create table public.user_calendar_sources (
 user_id uuid not null references auth.users(id) on delete cascade,
 url text not null check(length(url)<=4096 and url like 'https://%'),
 lat numeric not null check(lat between -90 and 90),
 lon numeric not null check(lon between -180 and 180),
 definition jsonb not null check(jsonb_typeof(definition)='object' and octet_length(definition::text)<=20000),
 primary key(user_id,url)
);
create index user_calendar_sources_location on public.user_calendar_sources(user_id,lat,lon);
create table public.user_calendar_areas (
 user_id uuid not null references auth.users(id) on delete cascade,
 lat numeric not null check(lat between -90 and 90),
 lon numeric not null check(lon between -180 and 180),
 radius_km numeric not null check(radius_km between 10 and 65),
 discovered_at timestamptz not null,
 status text not null check(status in ('active','partial','unavailable')),
 primary key(user_id,lat,lon,radius_km)
);
alter table public.user_calendar_sources enable row level security;
alter table public.user_calendar_areas enable row level security;
revoke all on public.user_calendar_sources,public.user_calendar_areas from public,anon,authenticated;
grant select,insert,update,delete on public.user_calendar_sources,public.user_calendar_areas to authenticated;
create policy own_calendar_sources on public.user_calendar_sources to authenticated
 using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy own_calendar_areas on public.user_calendar_areas to authenticated
 using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
alter function public.delete_my_home_base_data() rename to delete_my_home_base_pre_calendars;
create function public.delete_my_home_base_data() returns void language plpgsql security invoker set search_path='' as $$
begin
 perform public.delete_my_home_base_pre_calendars();
 delete from public.user_calendar_sources where user_id=auth.uid();
 delete from public.user_calendar_areas where user_id=auth.uid();
end;$$;
revoke all on function public.delete_my_home_base_data() from public,anon;
grant execute on function public.delete_my_home_base_data() to authenticated;
