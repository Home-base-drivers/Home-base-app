-- DEPLOYED October 3, 2026 after explicit owner approval for recurring deletion:
-- usage and observations after 90 days; predictions after 180 days.
-- Applied as approved_learning_retention_schedule in hosted migration history.
-- Do not execute as part of ordinary migration replay or automatic deployment.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('home-base-learning-retention','20 4 * * *',
  'select private.prune_home_base_learning();');
