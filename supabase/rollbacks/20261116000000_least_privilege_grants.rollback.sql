-- Rollback for 20261116000000_least_privilege_grants.sql.
-- Restores the grants and policies exactly as they were on the live project on
-- 2026-11-15 (read from information_schema.role_table_grants and pg_policies).
-- Run only if the hardening breaks something; it re-opens the gaps the migration closed.
-- Deliberately outside supabase/migrations so it is never replayed by accident.

-- Default privileges for new tables (Supabase's original setting).
alter default privileges for role postgres in schema public grant truncate, trigger, references on tables to anon, authenticated;

-- authenticated had every privilege on these 11 tables.
grant select, insert, update, delete, truncate, trigger, references on table
  public.dispatch_recommendations, public.driver_dispatch_state, public.homebase_agent_memory,
  public.homebase_agent_turns, public.platform_capabilities, public.platform_service_areas,
  public.profiles, public.progress_events, public.trip_rows, public.trip_uploads, public.user_state
  to authenticated;

-- anon had every privilege on these 4 tables.
grant select, insert, update, delete, truncate, trigger, references on table
  public.homebase_agent_memory, public.homebase_agent_turns,
  public.platform_capabilities, public.platform_service_areas
  to anon;

-- AI memory policies as they were (role PUBLIC, all commands, own rows).
drop policy if exists agent_memory_own_read on public.homebase_agent_memory;
drop policy if exists agent_turns_own_read on public.homebase_agent_turns;
drop policy if exists "agent memory own rows" on public.homebase_agent_memory;
drop policy if exists "agent turns own rows" on public.homebase_agent_turns;
create policy "agent memory own rows" on public.homebase_agent_memory for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "agent turns own rows" on public.homebase_agent_turns for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
