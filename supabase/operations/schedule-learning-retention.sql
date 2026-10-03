-- NOT DEPLOYED. Requires explicit approval for permanent recurring deletion:
-- usage and observations after 90 days; predictions after 180 days.
-- Do not execute as part of migration replay or automatic deployment.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('home-base-learning-retention','20 4 * * *',
  'select private.prune_home_base_learning();');
