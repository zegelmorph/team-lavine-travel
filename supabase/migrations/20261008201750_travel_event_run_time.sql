-- A show's run time when it differs from its start-end span; null means use the span.
alter table public.travel_events
  add column run_time_minutes integer check (run_time_minutes between 1 and 1440);
