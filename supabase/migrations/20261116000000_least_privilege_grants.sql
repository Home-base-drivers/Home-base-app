-- Least-privilege table grants (security review, 2026-11-15).
--
-- Supabase's default privileges give anon and authenticated every privilege on each new
-- public table, and Row Level Security then decides which rows they reach. RLS does not
-- cover TRUNCATE, TRIGGER or REFERENCES, and no browser or Edge Function path in Home Base
-- needs them, so they are removed everywhere for the two client roles. Tables whose
-- migrations already revoked the defaults are unchanged by this.
--
-- Rollback: supabase/rollbacks/20261116000000_least_privilege_grants.rollback.sql restores
-- the grants and policies exactly as they were on the live project on 2026-11-15.

-- 1. No client role may truncate, add triggers to, or reference any public table.
do $$
declare t record;
begin
  for t in select c.relname from pg_class c
           where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') loop
    execute format('revoke truncate, trigger, references on table public.%I from anon, authenticated', t.relname);
  end loop;
end $$;

-- ...and tables created later do not get them by default either.
alter default privileges for role postgres in schema public revoke truncate, trigger, references on tables from anon, authenticated;

-- 2. Platform reference data is read-only for everyone; only the server changes it.
--    (The read policies already allowed nothing else; the grants now say the same.)
revoke all on table public.platform_capabilities, public.platform_service_areas from anon, authenticated;
grant select on table public.platform_capabilities, public.platform_service_areas to anon, authenticated;
grant all on table public.platform_capabilities, public.platform_service_areas to service_role;

-- 3. Home Base AI memory and conversation turns are written only by the dispatch server
--    (service role) after it has verified the driver's sign-in. A driver can read their own
--    rows but can no longer plant memories or rewrite who said what, so what Claude is told
--    about a driver always comes from the server.
revoke all on table public.homebase_agent_memory, public.homebase_agent_turns from anon, authenticated;
grant select on table public.homebase_agent_memory, public.homebase_agent_turns to authenticated;
grant all on table public.homebase_agent_memory, public.homebase_agent_turns to service_role;
drop policy if exists "agent memory own rows" on public.homebase_agent_memory;
drop policy if exists "agent turns own rows" on public.homebase_agent_turns;
drop policy if exists agent_memory_own_read on public.homebase_agent_memory;
drop policy if exists agent_turns_own_read on public.homebase_agent_turns;
create policy agent_memory_own_read on public.homebase_agent_memory for select to authenticated using ((select auth.uid()) = user_id);
create policy agent_turns_own_read on public.homebase_agent_turns for select to authenticated using ((select auth.uid()) = user_id);
