-- Follow-ups to the first two travel migrations. Touches travel_ objects only, plus moving pg_net (used only by the
-- travel_weather cron job) out of the public schema.

-- ---------------------------------------------------------------------------------------------------------------
-- Transport: separate date and time columns, so "no time yet" is distinguishable from midnight.
-- ---------------------------------------------------------------------------------------------------------------

alter table public.travel_transport
  add column depart_date date,
  add column depart_time time,
  add column arrive_date date,
  add column arrive_time time;

update public.travel_transport
set depart_date = depart_at::date, depart_time = depart_at::time,
    arrive_date = arrive_at::date, arrive_time = arrive_at::time;

alter table public.travel_transport drop column depart_at, drop column arrive_at;

-- ---------------------------------------------------------------------------------------------------------------
-- household_id always follows the parent row, on every update, and a trip can't move between households.
-- ---------------------------------------------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'travel_destinations', 'travel_participants', 'travel_transport', 'travel_lodging', 'travel_events',
    'travel_pack_items'
  ]
  loop
    execute format('drop trigger %I on public.%I', t || '_household', t);
    execute format(
      'create trigger %I before insert or update on public.%I '
      'for each row execute function public.travel_set_household_from_trip()',
      t || '_household', t
    );
  end loop;
end;
$$;

drop trigger travel_weather_household on public.travel_weather;
create trigger travel_weather_household before insert or update on public.travel_weather
  for each row execute function public.travel_set_household_from_destination();

create or replace function public.travel_trips_lock_household()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.household_id is distinct from old.household_id then
    raise exception 'A trip cannot be moved to another household';
  end if;
  return new;
end;
$$;

create trigger travel_trips_lock_household before update of household_id on public.travel_trips
  for each row execute function public.travel_trips_lock_household();

revoke execute on function public.travel_trips_lock_household() from public, anon;
grant execute on function public.travel_trips_lock_household() to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Status: a trip whose dates were all cleared (or whose last destination was removed) goes back to planning.
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.travel_refresh_statuses(p_trip_id uuid default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  -- Signed-in callers may refresh only a trip they can see; the hourly cron job (no user) refreshes every trip.
  if (select auth.uid()) is not null then
    if p_trip_id is null or not exists (
      select 1 from public.travel_trips t where t.id = p_trip_id and public.is_household_member(t.household_id)
    ) then
      raise exception 'Trip not found';
    end if;
  end if;

  with dates as (
    select
      d.trip_id,
      bool_or(d.start_date <= (now() at time zone coalesce(d.timezone, 'UTC'))::date) as started,
      bool_and(d.end_date < (now() at time zone coalesce(d.timezone, 'UTC'))::date) as ended
    from public.travel_destinations d
    where d.start_date is not null
      and d.end_date is not null
      and (p_trip_id is null or d.trip_id = p_trip_id)
    group by d.trip_id
  ),
  target as (
    select
      t.id,
      case
        when dt.ended then 'complete'
        when dt.started then 'happening'
        -- Dates moved back into the future, or no dated destinations are left.
        when t.status in ('happening', 'complete') then 'planning'
        else t.status
      end as status
    from public.travel_trips t
    left join dates dt on dt.trip_id = t.id
    where t.status_auto and (p_trip_id is null or t.id = p_trip_id)
  )
  update public.travel_trips t
  set status = target.status
  from target
  where t.id = target.id and t.status <> target.status;

  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Weather belongs to a place: moving or un-locating a destination drops its old weather.
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.travel_destinations_reset_weather()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.lat is distinct from old.lat or new.lng is distinct from old.lng then
    delete from public.travel_weather w where w.destination_id = new.id;
    new.weather_refreshed_at := null;
  end if;
  return new;
end;
$$;

create trigger travel_destinations_reset_weather before update of lat, lng on public.travel_destinations
  for each row execute function public.travel_destinations_reset_weather();

revoke execute on function public.travel_destinations_reset_weather() from public, anon;
grant execute on function public.travel_destinations_reset_weather() to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Privileges: drop the extras Supabase's default privileges granted (truncate, trigger, references, view writes).
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
    execute format('revoke truncate, references, trigger on public.%I from authenticated', t);
  end loop;
end;
$$;

revoke insert, update, delete, truncate, references, trigger on public.travel_trip_summaries from authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- pg_net lives in the extensions schema, not public. Its functions stay in the net schema, so the travel_weather
-- cron command (net.http_post) is unchanged.
-- ---------------------------------------------------------------------------------------------------------------

drop extension if exists pg_net;
create extension pg_net with schema extensions;
