-- Links packing items to events (many to many): "dress shoes" can be for both the show and the dinner. A link row holds
-- the trip too, and composite foreign keys guarantee the item and the event are on that same trip. Deleting either side
-- removes its links. Follows the conventions of the other trip child tables, including the hardening in
-- 20261008043212_travel_review_fixes.sql (household_id follows the trip on every write, extra default privileges revoked).

alter table public.travel_events add constraint travel_events_id_trip_key unique (id, trip_id);
alter table public.travel_pack_items add constraint travel_pack_items_id_trip_key unique (id, trip_id);

create table public.travel_pack_item_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  trip_id uuid not null references public.travel_trips (id) on delete cascade,
  item_id uuid not null,
  event_id uuid not null,
  created_at timestamptz not null default now(),
  unique (item_id, event_id),
  foreign key (item_id, trip_id) references public.travel_pack_items (id, trip_id) on delete cascade,
  foreign key (event_id, trip_id) references public.travel_events (id, trip_id) on delete cascade
);
create index travel_pack_item_events_household_idx on public.travel_pack_item_events (household_id);
create index travel_pack_item_events_trip_idx on public.travel_pack_item_events (trip_id);
create index travel_pack_item_events_item_idx on public.travel_pack_item_events (item_id, trip_id);
create index travel_pack_item_events_event_idx on public.travel_pack_item_events (event_id, trip_id);
create trigger travel_pack_item_events_household before insert or update on public.travel_pack_item_events
  for each row execute function public.travel_set_household_from_trip();

alter table public.travel_pack_item_events enable row level security;
revoke all on public.travel_pack_item_events from anon, public;
revoke truncate, references, trigger on public.travel_pack_item_events from authenticated;
grant select, insert, update, delete on public.travel_pack_item_events to authenticated;
create policy travel_pack_item_events_all on public.travel_pack_item_events for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
