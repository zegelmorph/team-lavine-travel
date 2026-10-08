-- Events get a type (dinner, show, ...) and an optional looked-up place, like lodging. `location` stays the place
-- name shown on the schedule; the rest is filled in when a Google place is picked.

alter table public.travel_events
  add column kind text not null default 'other'
    check (kind in ('show', 'dinner', 'lunch', 'breakfast', 'drinks', 'tour', 'museum', 'activity', 'shopping', 'appointment', 'other')),
  add column address text,
  add column place_id text,
  add column lat double precision check (lat between -90 and 90),
  add column lng double precision check (lng between -180 and 180),
  add column google_maps_url text;

-- Everything entered so far was a show.
update public.travel_events set kind = 'show' where location = 'Oregon Shakespeare Festival';
