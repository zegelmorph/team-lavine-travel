-- Trip status automation, the default packing catalog, and the travel_ cron jobs.

-- ---------------------------------------------------------------------------------------------------------------
-- Status: dated trips move to happening on their first day and complete after their last, judged in each
-- destination's own time zone. Manual status changes turn status_auto off so the trip stays where it was put.
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
        -- Dates moved back into the future.
        when t.status in ('happening', 'complete') then 'planning'
        else t.status
      end as status
    from public.travel_trips t
    join dates dt on dt.trip_id = t.id
    where t.status_auto
  )
  update public.travel_trips t
  set status = target.status
  from target
  where t.id = target.id and t.status <> target.status;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.travel_refresh_statuses(uuid) from public, anon;
grant execute on function public.travel_refresh_statuses(uuid) to authenticated;

create or replace function public.travel_destinations_refresh_status()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_trip uuid := coalesce(new.trip_id, old.trip_id);
begin
  -- Skipped while the trip itself is being deleted (the cascade removes its destinations).
  if exists (select 1 from public.travel_trips t where t.id = v_trip) then
    perform public.travel_refresh_statuses(v_trip);
  end if;
  return null;
end;
$$;

create trigger travel_destinations_status
  after insert or delete or update of start_date, end_date, timezone on public.travel_destinations
  for each row execute function public.travel_destinations_refresh_status();

create or replace function public.travel_trips_refresh_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.travel_refresh_statuses(new.id);
  return null;
end;
$$;

create trigger travel_trips_status_auto
  after update of status_auto on public.travel_trips
  for each row when (new.status_auto and not old.status_auto)
  execute function public.travel_trips_refresh_status();

revoke execute on function public.travel_destinations_refresh_status() from public, anon;
grant execute on function public.travel_destinations_refresh_status() to authenticated;
revoke execute on function public.travel_trips_refresh_status() from public, anon;
grant execute on function public.travel_trips_refresh_status() to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Default packing catalog. Runs as the caller, so RLS limits it to the caller's own households. Safe to re-run:
-- names that already exist (case-insensitive) are left alone.
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.travel_seed_pack_catalog(p_household_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.travel_pack_categories (household_id, name, sort_order)
  select p_household_id, c.name, c.sort_order
  from (values
    ('Clothing', 1), ('Toiletries', 2), ('Electronics', 3), ('Documents', 4),
    ('Health', 5), ('Kids', 6), ('Gear', 7), ('Snacks', 8)
  ) as c (name, sort_order)
  on conflict do nothing;

  insert into public.travel_pack_catalog (household_id, category_id, name, default_qty)
  select p_household_id, c.id, i.name, i.qty
  from (values
    ('Clothing', 'T-shirts', 5), ('Clothing', 'Pants', 2), ('Clothing', 'Shorts', 2), ('Clothing', 'Underwear', 5),
    ('Clothing', 'Socks', 5), ('Clothing', 'Pajamas', 1), ('Clothing', 'Sweater', 1), ('Clothing', 'Jacket', 1),
    ('Clothing', 'Rain jacket', 1), ('Clothing', 'Swimsuit', 1), ('Clothing', 'Hat', 1), ('Clothing', 'Shoes', 1),
    ('Clothing', 'Sandals', 1),
    ('Toiletries', 'Toothbrush', 1), ('Toiletries', 'Toothpaste', 1), ('Toiletries', 'Deodorant', 1),
    ('Toiletries', 'Shampoo', 1), ('Toiletries', 'Conditioner', 1), ('Toiletries', 'Sunscreen', 1),
    ('Toiletries', 'Razor', 1), ('Toiletries', 'Hairbrush', 1), ('Toiletries', 'Contact lenses', 1),
    ('Electronics', 'Phone charger', 1), ('Electronics', 'Laptop', 1), ('Electronics', 'Laptop charger', 1),
    ('Electronics', 'Headphones', 1), ('Electronics', 'Power bank', 1), ('Electronics', 'Travel adapter', 1),
    ('Electronics', 'Camera', 1),
    ('Documents', 'Passport', 1), ('Documents', 'Driver''s license', 1), ('Documents', 'Boarding passes', 1),
    ('Documents', 'Travel insurance', 1), ('Documents', 'Credit cards', 1), ('Documents', 'Cash', 1),
    ('Health', 'Medications', 1), ('Health', 'First aid kit', 1), ('Health', 'Pain reliever', 1),
    ('Health', 'Hand sanitizer', 1),
    ('Kids', 'Diapers', 10), ('Kids', 'Wipes', 1), ('Kids', 'Toys', 1), ('Kids', 'Car seat', 1),
    ('Kids', 'Stroller', 1), ('Kids', 'Tablet', 1),
    ('Gear', 'Backpack', 1), ('Gear', 'Water bottle', 1), ('Gear', 'Sunglasses', 1), ('Gear', 'Umbrella', 1),
    ('Gear', 'Beach towel', 1), ('Gear', 'Travel pillow', 1),
    ('Snacks', 'Granola bars', 4), ('Snacks', 'Fruit', 1), ('Snacks', 'Chips', 1)
  ) as i (category, name, qty)
  join public.travel_pack_categories c on c.household_id = p_household_id and lower(c.name) = lower(i.category)
  on conflict do nothing;
end;
$$;

revoke execute on function public.travel_seed_pack_catalog(uuid) from public, anon;
grant execute on function public.travel_seed_pack_catalog(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Cron. The weather job calls the travel-weather edge function over HTTP with a random token kept in Vault; the
-- function checks it with travel_cron_token_valid(), which only the service role may call.
-- ---------------------------------------------------------------------------------------------------------------

create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'travel_cron_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'travel_cron_token',
      'Authenticates pg_cron calls to the travel-weather edge function'
    );
  end if;
end;
$$;

create or replace function public.travel_cron_token_valid(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets s where s.name = 'travel_cron_token' and s.decrypted_secret = p_token
  );
$$;

revoke execute on function public.travel_cron_token_valid(text) from public, anon, authenticated;
grant execute on function public.travel_cron_token_valid(text) to service_role;

select cron.schedule('travel_status', '5 * * * *', $$select public.travel_refresh_statuses(null)$$);

select cron.schedule(
  'travel_weather',
  '15 11 * * *',
  $$
  select net.http_post(
    url := 'https://bkehjssluczhindlyeme.supabase.co/functions/v1/travel-weather',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-travel-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'travel_cron_token')
    ),
    body := '{"mode":"cron"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
