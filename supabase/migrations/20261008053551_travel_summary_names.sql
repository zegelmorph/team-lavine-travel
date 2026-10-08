-- The trip list shows traveler names and per-destination weather. New columns go last so the view can be replaced
-- in place (grants are kept); destination_ids lines up with destinations.

create or replace view public.travel_trip_summaries with (security_invoker = true) as
select
  t.id,
  t.household_id,
  t.name,
  t.status,
  t.status_auto,
  t.notes,
  t.created_at,
  t.updated_at,
  d.start_date,
  d.end_date,
  coalesce(d.destinations, '{}') as destinations,
  coalesce(p.participant_count, 0) as participant_count,
  coalesce(d.destination_ids, '{}') as destination_ids,
  coalesce(p.participants, '{}') as participants
from public.travel_trips t
left join lateral (
  select
    min(x.start_date) as start_date,
    max(x.end_date) as end_date,
    array_agg(x.name order by x.sort_order, x.start_date nulls last, x.created_at) as destinations,
    array_agg(x.id order by x.sort_order, x.start_date nulls last, x.created_at) as destination_ids
  from public.travel_destinations x
  where x.trip_id = t.id
) d on true
left join lateral (
  select
    count(*)::int as participant_count,
    array_agg(x.display_name order by x.sort_order, x.created_at) as participants
  from public.travel_participants x
  where x.trip_id = t.id
) p on true;
