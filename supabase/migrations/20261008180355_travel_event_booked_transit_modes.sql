-- Events can be ideas not yet booked (shows to consider). Those may have no date yet; booked events always do.
alter table public.travel_events
  add column booked boolean not null default true,
  alter column date drop not null,
  add constraint travel_events_booked_date_check check (date is not null or not booked),
  add constraint travel_events_time_needs_date_check check (date is not null or start_time is null);

-- Getting around a city on foot or by subway.
alter table public.travel_transport drop constraint travel_transport_mode_check;
alter table public.travel_transport add constraint travel_transport_mode_check
  check (mode in ('car', 'plane', 'train', 'subway', 'ferry', 'cruise', 'bus', 'rideshare', 'walk', 'other'));
