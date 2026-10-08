-- Team Lavine Travel schema. Shares the Team Lavine project with the finance app, so every object here is prefixed
-- `travel_` and only *calls* the shared household helpers (public.households, public.is_household_member). Nothing in
-- this file alters a finance object.

-- ---------------------------------------------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.travel_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Child rows copy household_id from their trip. Runs as the caller, so RLS hides trips from other households and a
-- foreign trip_id leaves household_id null, which the not-null constraint rejects.
create or replace function public.travel_set_household_from_trip()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select t.household_id into new.household_id from public.travel_trips t where t.id = new.trip_id;
  return new;
end;
$$;

create or replace function public.travel_set_household_from_destination()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select d.household_id into new.household_id from public.travel_destinations d where d.id = new.destination_id;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Trips
-- ---------------------------------------------------------------------------------------------------------------

create table public.travel_trips (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  status text not null default 'dreaming' check (status in ('dreaming', 'planning', 'happening', 'complete')),
  -- When true, travel_refresh_statuses() moves the trip to happening/complete from its destination dates.
  status_auto boolean not null default true,
  notes text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index travel_trips_household_idx on public.travel_trips (household_id);
create index travel_trips_created_by_idx on public.travel_trips (created_by);
create trigger travel_trips_touch before update on public.travel_trips
  for each row execute function public.travel_touch_updated_at();

-- ---------------------------------------------------------------------------------------------------------------
-- Destinations and weather
-- ---------------------------------------------------------------------------------------------------------------

create table public.travel_destinations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  trip_id uuid not null references public.travel_trips (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  address text,
  place_id text,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  -- IANA zone, filled in by the travel-weather function from the coordinates.
  timezone text,
  start_date date,
  end_date date,
  sort_order int not null default 0,
  notes text,
  weather_refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, trip_id),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index travel_destinations_household_idx on public.travel_destinations (household_id);
create index travel_destinations_trip_idx on public.travel_destinations (trip_id);
create trigger travel_destinations_household before insert or update of trip_id on public.travel_destinations
  for each row execute function public.travel_set_household_from_trip();

create table public.travel_weather (
  destination_id uuid not null references public.travel_destinations (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  date date not null,
  temp_max_c numeric(4, 1),
  temp_min_c numeric(4, 1),
  precip_prob int check (precip_prob between 0 and 100),
  precip_mm numeric(6, 1),
  weather_code int,
  -- forecast: Open-Meteo forecast for that day. typical: average of the same dates in recent years.
  source text not null check (source in ('forecast', 'typical')),
  fetched_at timestamptz not null default now(),
  primary key (destination_id, date)
);
create index travel_weather_household_idx on public.travel_weather (household_id);
create trigger travel_weather_household before insert or update of destination_id on public.travel_weather
  for each row execute function public.travel_set_household_from_destination();

-- ---------------------------------------------------------------------------------------------------------------
-- Participants
-- ---------------------------------------------------------------------------------------------------------------

create table public.travel_participants (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  trip_id uuid not null references public.travel_trips (id) on delete cascade,
  -- Set when the participant is a signed-in household member; null for kids, friends, etc.
  user_id uuid references auth.users (id) on delete set null,
  display_name text not null check (length(btrim(display_name)) > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (trip_id, user_id)
);
create index travel_participants_household_idx on public.travel_participants (household_id);
create index travel_participants_user_idx on public.travel_participants (user_id);
create trigger travel_participants_household before insert or update of trip_id on public.travel_participants
  for each row execute function public.travel_set_household_from_trip();

-- ---------------------------------------------------------------------------------------------------------------
-- Transport. Times are local wall-clock times at each end, with that end's IANA zone alongside.
-- ---------------------------------------------------------------------------------------------------------------

create table public.travel_transport (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  trip_id uuid not null references public.travel_trips (id) on delete cascade,
  mode text not null check (mode in ('car', 'plane', 'train', 'ferry', 'cruise', 'bus', 'rideshare', 'other')),
  carrier text,
  number text,
  confirmation text,
  depart_location text,
  depart_place_id text,
  depart_at timestamp,
  depart_tz text,
  arrive_location text,
  arrive_place_id text,
  arrive_at timestamp,
  arrive_tz text,
  notes text,
  created_at timestamptz not null default now()
);
create index travel_transport_household_idx on public.travel_transport (household_id);
create index travel_transport_trip_idx on public.travel_transport (trip_id);
create trigger travel_transport_household before insert or update of trip_id on public.travel_transport
  for each row execute function public.travel_set_household_from_trip();

-- ---------------------------------------------------------------------------------------------------------------
-- Lodging
-- ---------------------------------------------------------------------------------------------------------------

create table public.travel_lodging (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  trip_id uuid not null references public.travel_trips (id) on delete cascade,
  destination_id uuid,
  name text not null check (length(btrim(name)) > 0),
  address text,
  place_id text,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  phone text,
  website text,
  google_maps_url text,
  rating numeric(2, 1),
  check_in date not null,
  check_out date not null,
  check_in_time time,
  check_out_time time,
  confirmation text,
  notes text,
  created_at timestamptz not null default now(),
  check (check_out >= check_in),
  -- Same-trip destination only; deleting the destination just unlinks the stay.
  foreign key (destination_id, trip_id) references public.travel_destinations (id, trip_id)
    on delete set null (destination_id)
);
create index travel_lodging_household_idx on public.travel_lodging (household_id);
create index travel_lodging_trip_idx on public.travel_lodging (trip_id);
create index travel_lodging_destination_idx on public.travel_lodging (destination_id, trip_id);
create trigger travel_lodging_household before insert or update of trip_id on public.travel_lodging
  for each row execute function public.travel_set_household_from_trip();

-- ---------------------------------------------------------------------------------------------------------------
-- Custom schedule events
-- ---------------------------------------------------------------------------------------------------------------

create table public.travel_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  trip_id uuid not null references public.travel_trips (id) on delete cascade,
  date date not null,
  -- Null start_time means an all-day event.
  start_time time,
  end_time time,
  title text not null check (length(btrim(title)) > 0),
  location text,
  notes text,
  created_at timestamptz not null default now(),
  check (end_time is null or (start_time is not null and end_time >= start_time))
);
create index travel_events_household_idx on public.travel_events (household_id);
create index travel_events_trip_idx on public.travel_events (trip_id, date);
create trigger travel_events_household before insert or update of trip_id on public.travel_events
  for each row execute function public.travel_set_household_from_trip();

-- ---------------------------------------------------------------------------------------------------------------
-- Packing: household-level lookup catalog plus per-trip lists
-- ---------------------------------------------------------------------------------------------------------------

create table public.travel_pack_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, household_id)
);
create unique index travel_pack_categories_name_key on public.travel_pack_categories (household_id, lower(name));

create table public.travel_pack_catalog (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  category_id uuid,
  name text not null check (length(btrim(name)) > 0),
  default_qty int not null default 1 check (default_qty > 0),
  created_at timestamptz not null default now(),
  unique (id, household_id),
  foreign key (category_id, household_id) references public.travel_pack_categories (id, household_id)
    on delete set null (category_id)
);
create unique index travel_pack_catalog_name_key on public.travel_pack_catalog (household_id, lower(name));
create index travel_pack_catalog_category_idx on public.travel_pack_catalog (category_id, household_id);

create table public.travel_pack_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  trip_id uuid not null references public.travel_trips (id) on delete cascade,
  category_id uuid,
  catalog_item_id uuid,
  name text not null check (length(btrim(name)) > 0),
  quantity int not null default 1 check (quantity > 0),
  packed boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (category_id, household_id) references public.travel_pack_categories (id, household_id)
    on delete set null (category_id),
  foreign key (catalog_item_id, household_id) references public.travel_pack_catalog (id, household_id)
    on delete set null (catalog_item_id)
);
create index travel_pack_items_household_idx on public.travel_pack_items (household_id);
create index travel_pack_items_trip_idx on public.travel_pack_items (trip_id);
create index travel_pack_items_category_idx on public.travel_pack_items (category_id, household_id);
create index travel_pack_items_catalog_idx on public.travel_pack_items (catalog_item_id, household_id);
create trigger travel_pack_items_household before insert or update of trip_id on public.travel_pack_items
  for each row execute function public.travel_set_household_from_trip();

-- ---------------------------------------------------------------------------------------------------------------
-- Row level security: every travel table is visible to members of its household only
-- ---------------------------------------------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'travel_trips', 'travel_destinations', 'travel_weather', 'travel_participants', 'travel_transport',
    'travel_lodging', 'travel_events', 'travel_pack_categories', 'travel_pack_catalog', 'travel_pack_items'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      'using (public.is_household_member(household_id)) with check (public.is_household_member(household_id))',
      t || '_all', t
    );
  end loop;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.travel_touch_updated_at()',
    'public.travel_set_household_from_trip()',
    'public.travel_set_household_from_destination()'
  ]
  loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Trip list view: trip dates come from its destinations
-- ---------------------------------------------------------------------------------------------------------------

create view public.travel_trip_summaries with (security_invoker = true) as
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
  coalesce(p.participant_count, 0) as participant_count
from public.travel_trips t
left join lateral (
  select
    min(x.start_date) as start_date,
    max(x.end_date) as end_date,
    array_agg(x.name order by x.sort_order, x.start_date nulls last, x.created_at) as destinations
  from public.travel_destinations x
  where x.trip_id = t.id
) d on true
left join lateral (
  select count(*)::int as participant_count from public.travel_participants x where x.trip_id = t.id
) p on true;

revoke all on public.travel_trip_summaries from anon, public;
grant select on public.travel_trip_summaries to authenticated;
