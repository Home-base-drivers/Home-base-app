-- Which markets have drivers in the app right now. Only a market id and times are
-- kept (no user, device or location). The live-signals refresh reads the active
-- list and calls paid/rate-limited feeds only for those markets.
create table if not exists public.market_activity (
  market_id text primary key check (market_id ~ '^[a-z0-9_-]{2,40}$'),
  last_seen_at timestamptz,
  last_refresh_request_at timestamptz,
  pings bigint not null default 0
);
alter table public.market_activity enable row level security;
revoke all on public.market_activity from anon, authenticated;
grant all on public.market_activity to service_role;
-- Anyone may read which market ids were active and when (nothing else).
grant select (market_id, last_seen_at) on public.market_activity to anon, authenticated;
drop policy if exists "market activity is public" on public.market_activity;
create policy "market activity is public" on public.market_activity for select to anon, authenticated using (market_id <> '_any');

-- Written only by the market-activity Edge Function (service role).
create or replace function private.touch_markets(p_markets text[])
returns void language sql security definer set search_path = '' as $$
  insert into public.market_activity as m (market_id, last_seen_at, pings)
  select distinct x, now(), 1 from unnest(p_markets) as x where x ~ '^[a-z0-9_-]{2,40}$' and x <> '_any'
  on conflict (market_id) do update set last_seen_at = now(), pings = m.pings + 1;
$$;

-- Claims an on-demand refresh: at most one per market every p_market_minutes and
-- one overall every p_global_minutes. Returns true when the caller should start it.
create or replace function private.claim_market_refresh(p_market text, p_market_minutes int, p_global_minutes int)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  insert into public.market_activity (market_id) values ('_any') on conflict do nothing;
  insert into public.market_activity (market_id) values (p_market) on conflict do nothing;
  perform 1 from public.market_activity where market_id in ('_any', p_market) for update;
  if exists (select 1 from public.market_activity where market_id = '_any'
               and last_refresh_request_at > now() - make_interval(mins => p_global_minutes))
     or exists (select 1 from public.market_activity where market_id = p_market
               and last_refresh_request_at > now() - make_interval(mins => p_market_minutes)) then
    return false;
  end if;
  update public.market_activity set last_refresh_request_at = now() where market_id in ('_any', p_market);
  return true;
end;
$$;
revoke all on function private.touch_markets(text[]) from public, anon, authenticated;
revoke all on function private.claim_market_refresh(text, int, int) from public, anon, authenticated;
grant execute on function private.touch_markets(text[]) to service_role;
grant execute on function private.claim_market_refresh(text, int, int) to service_role;

create or replace function public.touch_markets(p_markets text[])
returns void language sql security invoker set search_path = '' as $$ select private.touch_markets(p_markets); $$;
create or replace function public.claim_market_refresh(p_market text, p_market_minutes int default 30, p_global_minutes int default 10)
returns boolean language sql security invoker set search_path = '' as $$ select private.claim_market_refresh(p_market, p_market_minutes, p_global_minutes); $$;
-- Market ids with a driver in the last p_minutes (reads the public columns above).
create or replace function public.active_markets(p_minutes int default 120)
returns setof text language sql stable security invoker set search_path = '' as $$
  select market_id from public.market_activity
  where market_id <> '_any' and last_seen_at > now() - make_interval(mins => least(greatest(p_minutes, 1), 1440))
  order by market_id;
$$;
revoke all on function public.touch_markets(text[]) from public, anon, authenticated;
revoke all on function public.claim_market_refresh(text, int, int) from public, anon, authenticated;
grant execute on function public.touch_markets(text[]) to service_role;
grant execute on function public.claim_market_refresh(text, int, int) to service_role;
revoke all on function public.active_markets(int) from public;
grant execute on function public.active_markets(int) to anon, authenticated, service_role;
