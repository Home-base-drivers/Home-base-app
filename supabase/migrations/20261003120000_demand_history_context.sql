-- Extend already-consented coarse observations; existing 90-day deletion applies.
-- No raw coordinates, screenshot images or event attendee data are collected.
alter table public.shift_observations
  add column modeled_score numeric(5,4) check(modeled_score between 0 and 1),
  add column event_arrivals integer check(event_arrivals between 0 and 100),
  add column event_exits integer check(event_exits between 0 and 100);
comment on column public.shift_observations.modeled_score is 'Model output only: never a ground-truth ride count or training label.';
