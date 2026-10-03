-- Only service-side review can manage release and sponsorship inventory.
grant usage on schema private to service_role;
create policy release_service_management on private.analytics_release_registry
  for all to service_role using (true) with check (true);
grant all on public.sponsor_campaigns to service_role;

-- Retention scans must not depend on user-leading indexes.
create index usage_retention_idx on public.usage_events(recorded_at);
create index observations_retention_idx on public.shift_observations(recorded_at);
create index predictions_retention_idx on public.model_predictions(recorded_at);

-- Automatic deletion is deliberately NOT scheduled. Retention windows require
-- explicit owner approval before deploying the separate operations script.
