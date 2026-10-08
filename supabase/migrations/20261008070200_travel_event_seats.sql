-- Seat numbers for shows ("Row F, 101-102"). Free text; only the event dialog's Show type offers it.
alter table public.travel_events add column seats text;
