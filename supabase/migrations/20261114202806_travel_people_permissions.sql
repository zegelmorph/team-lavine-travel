-- People, travel-only access and trip permissions.
--
-- Until now every household member could read and write every trip. From here on:
--   admin     = household owner. Sees and manages every trip.
--   user      = any other household member, or someone who accepted a travel invite (no finance access). Manages the
--               trips they own.
--   traveller = a user on someone else's trip. Sees all of it, and can only tick packing items and to-dos.
-- Travellers become saved people (travel_people) instead of free text, so they can be invited later.
--
-- Finance objects are only called, with two row-level exceptions made by the functions below:
-- household_members.role (travel_set_admin, plus the one-off promotion at the end) and signup_allowlist
-- (travel_invite_person). No finance table, policy or function is altered.

-- ---------------------------------------------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------------------------------------------

create table public.travel_people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  -- Lowercase. Optional: kids and friends who will never sign in have none.
  email text check (email = lower(btrim(email)) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  -- The account this person signs in with, once they have one.
  user_id uuid references auth.users (id) on delete set null,
  -- Set when an invite is sent. Together with user_id it gives travel access to someone who isn't a household member.
  invited_at timestamptz,
  invited_by uuid references auth.users (id) on delete set null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  -- When this person last opened the household in the travel app; orders travel_my_households().
  last_accessed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, household_id),
  unique (household_id, email),
  unique (household_id, user_id)
);
create index travel_people_user_idx on public.travel_people (user_id);
create index travel_people_email_idx on public.travel_people (email);
create index travel_people_invited_by_idx on public.travel_people (invited_by);
create index travel_people_created_by_idx on public.travel_people (created_by);

-- email, user_id and invited_at decide who gets access, so clients only read this table. Every write goes through
-- the functions further down.
alter table public.travel_people enable row level security;
revoke all on public.travel_people from anon, public, authenticated;
grant select on public.travel_people to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Trip owner and travellers as people
-- ---------------------------------------------------------------------------------------------------------------

-- Null means nobody but admins manages the trip.
alter table public.travel_trips add column owner_id uuid references auth.users (id) on delete set null;
alter table public.travel_trips disable trigger travel_trips_touch;
update public.travel_trips set owner_id = created_by;
alter table public.travel_trips enable trigger travel_trips_touch;
alter table public.travel_trips alter column owner_id set default auth.uid();
create index travel_trips_owner_idx on public.travel_trips (owner_id);

alter table public.travel_participants add column person_id uuid;

-- One person per household member, named from their email, then the names the household confirmed.
insert into public.travel_people (household_id, name, email, user_id, created_by, last_accessed_at)
select
  m.household_id,
  initcap(regexp_replace(split_part(u.email, '@', 1), '[._-]+', ' ', 'g')),
  lower(u.email),
  m.user_id,
  null,
  m.last_accessed_at
from public.household_members m
join auth.users u on u.id = m.user_id
where u.email is not null;

update public.travel_people set name = 'Jesse' where email = 'jlavine@gmail.com';
update public.travel_people set name = 'Jolene' where email = 'jolenelavine@gmail.com';

-- Travellers linked to an account that isn't a household member any more keep the name they had.
insert into public.travel_people (household_id, name, email, user_id, created_by)
select distinct on (pt.household_id, pt.user_id) pt.household_id, btrim(pt.display_name), lower(u.email), pt.user_id, null
from public.travel_participants pt
join auth.users u on u.id = pt.user_id
where not exists (
  select 1 from public.travel_people pe where pe.household_id = pt.household_id and pe.user_id = pt.user_id
)
order by pt.household_id, pt.user_id, pt.created_at;

-- One person per name-only traveller; the same name on several trips (in any letter case) is the same person, and a
-- name that matches someone created above is that person.
insert into public.travel_people (household_id, name, created_by)
select distinct on (pt.household_id, lower(btrim(pt.display_name))) pt.household_id, btrim(pt.display_name), null
from public.travel_participants pt
where pt.user_id is null
  and not exists (
    select 1 from public.travel_people pe
    where pe.household_id = pt.household_id and lower(pe.name) = lower(btrim(pt.display_name))
  )
order by pt.household_id, lower(btrim(pt.display_name)), pt.created_at;

update public.travel_participants pt
set person_id = (
  select pe.id
  from public.travel_people pe
  where pe.household_id = pt.household_id
    and (
      (pt.user_id is not null and pe.user_id = pt.user_id)
      or (pt.user_id is null and lower(pe.name) = lower(btrim(pt.display_name)))
    )
  -- Two people with one name: the one without an account, then the older.
  order by pe.user_id is not null, pe.created_at, pe.id
  limit 1
);

-- The same person twice on one trip (two spellings of a name) keeps the earlier row.
delete from public.travel_participants a
using public.travel_participants b
where a.trip_id = b.trip_id and a.person_id = b.person_id and (a.created_at, a.id) > (b.created_at, b.id);

alter table public.travel_participants
  alter column person_id set not null,
  -- Same household only; deleting a person takes them off their trips.
  add constraint travel_participants_person_fkey
    foreign key (person_id, household_id) references public.travel_people (id, household_id) on delete cascade,
  add constraint travel_participants_trip_person_key unique (trip_id, person_id);
create index travel_participants_person_idx on public.travel_participants (person_id, household_id);

-- Names now come from travel_people. Columns keep their order so the view is replaced in place; owner_id goes last.
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
  coalesce(p.participants, '{}') as participants,
  t.owner_id
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
    array_agg(pe.name order by x.sort_order, x.created_at) as participants
  from public.travel_participants x
  join public.travel_people pe on pe.id = x.person_id
  where x.trip_id = t.id
) p on true;

-- Destructive: the names and account links now live in travel_people.
alter table public.travel_participants drop column display_name, drop column user_id;

-- ---------------------------------------------------------------------------------------------------------------
-- Access helpers. Every policy below goes through these.
-- ---------------------------------------------------------------------------------------------------------------

-- Whether an account may use the household's trips: a household member, or a person who was invited and has signed in.
-- Internal: takes any user id, so it is not callable by clients.
create function public.travel_has_access(p_household_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1 from public.households h
    where h.id = p_household_id
      and h.deleted_at is null
      and (
        exists (select 1 from public.household_members m where m.household_id = h.id and m.user_id = p_user_id)
        or exists (
          select 1 from public.travel_people p
          where p.household_id = h.id and p.user_id = p_user_id and p.invited_at is not null
        )
      )
  );
$$;

create function public.travel_is_user(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.travel_has_access(p_household_id, (select auth.uid()));
$$;

create function public.travel_is_admin(p_household_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.is_household_owner(p_household_id);
$$;

-- From a trip's own columns, so it also works on a row that is being inserted.
create function public.travel_can_edit(p_household_id uuid, p_owner_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.travel_is_admin(p_household_id)
    or (p_owner_id = (select auth.uid()) and public.travel_is_user(p_household_id));
$$;

create function public.travel_can_edit_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.travel_trips t where t.id = p_trip_id and public.travel_can_edit(t.household_id, t.owner_id)
  );
$$;

-- The caller is on the trip and still has access to its household.
create function public.travel_is_traveller(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.travel_participants pt
    join public.travel_people p on p.id = pt.person_id
    where pt.trip_id = p_trip_id
      and p.user_id = (select auth.uid())
      and public.travel_has_access(pt.household_id, p.user_id)
  );
$$;

create function public.travel_can_view_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.travel_can_edit_trip(p_trip_id) or public.travel_is_traveller(p_trip_id);
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Guards that policies can't express
-- ---------------------------------------------------------------------------------------------------------------

-- Only admins hand a trip to someone else, and only to someone with access. Security definer to read membership.
create function public.travel_trips_guard_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The owner's account was deleted: the foreign key is clearing the column.
  if new.owner_id is null and not exists (select 1 from auth.users u where u.id = old.owner_id) then
    return new;
  end if;
  if (select auth.uid()) is not null and not public.travel_is_admin(new.household_id) then
    raise exception 'Only an admin can change who owns a trip';
  end if;
  if new.owner_id is not null and not public.travel_has_access(new.household_id, new.owner_id) then
    raise exception 'The new owner needs access to this household first';
  end if;
  return new;
end;
$$;

create trigger travel_trips_guard_owner before update of owner_id on public.travel_trips
  for each row when (new.owner_id is distinct from old.owner_id)
  execute function public.travel_trips_guard_owner();

-- An invite is for the account that accepted it. When that account goes (deleted, or access removed) the invite goes
-- with it, so a new account under the same email isn't let straight back in.
create function public.travel_people_forget_invite()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.invited_at := null;
  new.invited_by := null;
  return new;
end;
$$;

create trigger travel_people_forget_invite before update of user_id on public.travel_people
  for each row when (old.user_id is not null and new.user_id is null)
  execute function public.travel_people_forget_invite();

-- Travellers may update packing items and to-dos, but only to tick them off. The column they may change is the
-- trigger's argument.
create function public.travel_checklist_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  -- The update policy only asks that the destination trip be visible, so moving a row needs this check as well.
  if new.trip_id is distinct from old.trip_id and not public.travel_can_edit_trip(new.trip_id) then
    raise exception 'You can only move this to a trip you manage';
  end if;
  if public.travel_can_edit_trip(old.trip_id) then
    return new;
  end if;
  if (to_jsonb(new) - tg_argv[0]) is distinct from (to_jsonb(old) - tg_argv[0]) then
    raise exception 'Only the trip''s owner can change this. You can still check it off.';
  end if;
  return new;
end;
$$;

create trigger travel_pack_items_checklist_guard before update on public.travel_pack_items
  for each row execute function public.travel_checklist_guard('packed');
create trigger travel_todos_checklist_guard before update on public.travel_todos
  for each row execute function public.travel_checklist_guard('done');

-- ---------------------------------------------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------------------------------------------

create policy travel_people_select on public.travel_people for select to authenticated
  using (public.travel_is_user(household_id));

drop policy travel_trips_all on public.travel_trips;
create policy travel_trips_select on public.travel_trips for select to authenticated
  using (public.travel_can_edit(household_id, owner_id) or public.travel_is_traveller(id));
-- A new trip belongs to whoever creates it; admins reassign it afterwards.
create policy travel_trips_insert on public.travel_trips for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.travel_is_user(household_id));
create policy travel_trips_update on public.travel_trips for update to authenticated
  using (public.travel_can_edit(household_id, owner_id)) with check (public.travel_can_edit(household_id, owner_id));
create policy travel_trips_delete on public.travel_trips for delete to authenticated
  using (public.travel_can_edit(household_id, owner_id));

-- Rows that belong to a trip: readable by whoever can see the trip, writable by whoever can edit it. Packing items and
-- to-dos also let travellers update, which the checklist guard above narrows to ticking them off.
do $$
declare
  t text;
  upd text;
begin
  foreach t in array array[
    'travel_destinations', 'travel_participants', 'travel_transport', 'travel_lodging', 'travel_events',
    'travel_pack_items', 'travel_pack_item_events', 'travel_todos'
  ]
  loop
    upd := case when t in ('travel_pack_items', 'travel_todos') then 'view' else 'edit' end;
    execute format('drop policy %I on public.%I', t || '_all', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.travel_can_view_trip(trip_id))',
      t || '_select', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.travel_can_edit_trip(trip_id))',
      t || '_insert', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated '
      'using (public.travel_can_%s_trip(trip_id)) with check (public.travel_can_%s_trip(trip_id))',
      t || '_update', t, upd, upd
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.travel_can_edit_trip(trip_id))',
      t || '_delete', t
    );
  end loop;
end;
$$;

-- Weather hangs off a destination. The travel-weather function writes it with the service role; editors still delete
-- it when they move a destination (travel_destinations_reset_weather runs as the caller).
drop policy travel_weather_all on public.travel_weather;
create policy travel_weather_select on public.travel_weather for select to authenticated
  using (exists (
    select 1 from public.travel_destinations d where d.id = destination_id and public.travel_can_view_trip(d.trip_id)
  ));
create policy travel_weather_insert on public.travel_weather for insert to authenticated
  with check (exists (
    select 1 from public.travel_destinations d where d.id = destination_id and public.travel_can_edit_trip(d.trip_id)
  ));
create policy travel_weather_update on public.travel_weather for update to authenticated
  using (exists (
    select 1 from public.travel_destinations d where d.id = destination_id and public.travel_can_edit_trip(d.trip_id)
  ))
  with check (exists (
    select 1 from public.travel_destinations d where d.id = destination_id and public.travel_can_edit_trip(d.trip_id)
  ));
create policy travel_weather_delete on public.travel_weather for delete to authenticated
  using (exists (
    select 1 from public.travel_destinations d where d.id = destination_id and public.travel_can_edit_trip(d.trip_id)
  ));

-- The packing lists stay shared by everyone with access, travel-only users included.
drop policy travel_pack_categories_all on public.travel_pack_categories;
create policy travel_pack_categories_all on public.travel_pack_categories for all to authenticated
  using (public.travel_is_user(household_id)) with check (public.travel_is_user(household_id));
drop policy travel_pack_catalog_all on public.travel_pack_catalog;
create policy travel_pack_catalog_all on public.travel_pack_catalog for all to authenticated
  using (public.travel_is_user(household_id)) with check (public.travel_is_user(household_id));

-- ---------------------------------------------------------------------------------------------------------------
-- Status refresh: same as before, except a signed-in caller needs to be able to see the trip under the new rules.
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
    if p_trip_id is null or not public.travel_can_view_trip(p_trip_id) then
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
-- Signing in: households and the people directory
-- ---------------------------------------------------------------------------------------------------------------

-- Run when the app opens. Accepts pending household invites, makes sure the caller is in the people directory of each
-- household they belong to, and links them to the people rows they were invited as.
create function public.travel_sync_me()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_confirmed boolean;
  v_hh uuid;
begin
  if v_uid is null then
    return;
  end if;
  perform public.accept_invites();

  select lower(u.email), u.email_confirmed_at is not null into v_email, v_confirmed
  from auth.users u where u.id = v_uid;
  if v_email is null then
    return;
  end if;

  for v_hh in
    select m.household_id
    from public.household_members m
    join public.households h on h.id = m.household_id and h.deleted_at is null
    where m.user_id = v_uid
      and not exists (
        select 1 from public.travel_people p where p.household_id = m.household_id and p.user_id = v_uid
      )
  loop
    -- Already saved as a traveller under this email: that row becomes theirs.
    update public.travel_people set user_id = v_uid
    where household_id = v_hh and email = v_email and user_id is null;
    if not found then
      insert into public.travel_people (household_id, name, email, user_id, created_by)
      values (
        v_hh,
        initcap(regexp_replace(split_part(v_email, '@', 1), '[._-]+', ' ', 'g')),
        -- Someone else's row already holds this email (it changed hands); go without rather than fail.
        case
          when exists (select 1 from public.travel_people p where p.household_id = v_hh and p.email = v_email) then null
          else v_email
        end,
        v_uid,
        v_uid
      )
      on conflict do nothing;
    end if;
  end loop;

  -- An invite only counts for an address its owner has proven is theirs.
  if v_confirmed then
    update public.travel_people p set user_id = v_uid
    where p.email = v_email
      and p.user_id is null
      and p.invited_at is not null
      and not exists (
        select 1 from public.travel_people q where q.household_id = p.household_id and q.user_id = v_uid
      );
  end if;
end;
$$;

-- my_households() for the travel app: also lists households the caller only has travel access to, and reports the
-- role as admin or user.
create function public.travel_my_households()
returns table (id uuid, name text, role text, last_accessed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id, h.name, case when m.role = 'owner' then 'admin' else 'user' end, p.last_accessed_at
  from public.households h
  left join public.household_members m on m.household_id = h.id and m.user_id = (select auth.uid())
  left join public.travel_people p on p.household_id = h.id and p.user_id = (select auth.uid())
  where h.deleted_at is null and (m.user_id is not null or p.invited_at is not null)
  order by p.last_accessed_at desc nulls last, h.created_at;
$$;

create function public.travel_touch_household(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.travel_people set last_accessed_at = now()
  where household_id = p_id and user_id = (select auth.uid());
$$;

-- The directory with each person's standing: admin, user (has access), invited (not signed in yet), or none.
-- is_member marks household members, the only people who can be made admin.
create function public.travel_people_list(p_household_id uuid)
returns table (
  id uuid,
  name text,
  email text,
  user_id uuid,
  access text,
  is_member boolean,
  invited_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.name,
    coalesce(lower(u.email), p.email),
    p.user_id,
    case
      when m.role = 'owner' then 'admin'
      when m.user_id is not null or (p.user_id is not null and p.invited_at is not null) then 'user'
      when p.user_id is null and p.invited_at is not null then 'invited'
      else 'none'
    end,
    m.user_id is not null,
    p.invited_at
  from public.travel_people p
  left join public.household_members m on m.household_id = p.household_id and m.user_id = p.user_id
  left join auth.users u on u.id = p.user_id
  where p.household_id = p_household_id and public.travel_is_user(p_household_id)
  order by lower(p.name), p.created_at;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Managing people
-- ---------------------------------------------------------------------------------------------------------------

-- Checks an email and that nobody else in the household has it, as a saved address or as their sign-in.
create function public.travel_check_person_email(p_household_id uuid, p_email text, p_except uuid default null)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_taken_by text;
begin
  if p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'Enter a valid email address';
  end if;
  select p.name into v_taken_by
  from public.travel_people p
  left join auth.users u on u.id = p.user_id
  where p.household_id = p_household_id
    and p.id is distinct from p_except
    and (p.email = p_email or lower(u.email) = p_email)
  limit 1;
  if v_taken_by is not null then
    raise exception '% already has that email address', v_taken_by;
  end if;
end;
$$;

-- Anyone with access can save a person, which is how travellers are added on the fly. It grants nothing by itself:
-- access comes from travel_invite_person.
create function public.travel_add_person(p_household_id uuid, p_name text, p_email text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_id uuid;
begin
  if not public.travel_is_user(p_household_id) then
    raise exception 'You don''t have access to this household';
  end if;
  if v_name = '' then
    raise exception 'Enter a name';
  end if;
  if v_email is not null then
    perform public.travel_check_person_email(p_household_id, v_email);
  end if;
  insert into public.travel_people (household_id, name, email, created_by)
  values (p_household_id, v_name, v_email, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

-- Admins edit anyone; everyone else only their own name. The email of someone with an account is the one they sign
-- in with, so p_email is ignored for them. Changing an invited person's email withdraws the invite.
create function public.travel_update_person(p_id uuid, p_name text, p_email text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.travel_people;
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  select * into v from public.travel_people p where p.id = p_id;
  if not found or not public.travel_is_user(v.household_id) then
    raise exception 'Person not found';
  end if;
  if not public.travel_is_admin(v.household_id) and v.user_id is distinct from (select auth.uid()) then
    raise exception 'Only an admin can edit other people';
  end if;
  if v_name = '' then
    raise exception 'Enter a name';
  end if;
  if v.user_id is not null then
    update public.travel_people set name = v_name where id = p_id;
    return;
  end if;
  if v_email is not null then
    perform public.travel_check_person_email(v.household_id, v_email, p_id);
  end if;
  update public.travel_people
  set name = v_name,
      email = v_email,
      invited_at = case when v_email is distinct from v.email then null else invited_at end,
      invited_by = case when v_email is distinct from v.email then null else invited_by end
  where id = p_id;
end;
$$;

-- Ends someone's travel access (or withdraws their invite). They stay in the directory and on their trips as a person
-- without an account, and the trips they owned are left to the admins.
create function public.travel_revoke_person(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.travel_people;
begin
  select * into v from public.travel_people p where p.id = p_id;
  if not found or not public.travel_is_admin(v.household_id) then
    raise exception 'Only an admin can remove someone''s access';
  end if;
  if v.user_id = (select auth.uid()) then
    raise exception 'You can''t remove your own access';
  end if;
  if exists (
    select 1 from public.household_members m where m.household_id = v.household_id and m.user_id = v.user_id
  ) then
    raise exception '% is a household member. Remove them from the household instead.', v.name;
  end if;
  if v.user_id is not null then
    update public.travel_trips set owner_id = null where household_id = v.household_id and owner_id = v.user_id;
  end if;
  update public.travel_people set user_id = null, invited_at = null, invited_by = null where id = p_id;
end;
$$;

-- Deletes a person and takes them off every trip. People with access have to lose it first.
create function public.travel_delete_person(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.travel_people;
begin
  select * into v from public.travel_people p where p.id = p_id;
  if not found or not public.travel_is_admin(v.household_id) then
    raise exception 'Only an admin can delete people';
  end if;
  if v.invited_at is not null or public.travel_has_access(v.household_id, v.user_id) then
    raise exception 'Remove %''s access first', v.name;
  end if;
  delete from public.travel_people where id = p_id;
end;
$$;

-- Admin is the household's owner role, which the finance app shares, so only household members qualify.
create function public.travel_set_admin(p_household_id uuid, p_user_id uuid, p_admin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.travel_is_admin(p_household_id) then
    raise exception 'Only an admin can change roles';
  end if;
  if not exists (
    select 1 from public.household_members m where m.household_id = p_household_id and m.user_id = p_user_id
  ) then
    raise exception 'Only household members can be admins';
  end if;
  if not p_admin and not exists (
    select 1 from public.household_members m
    where m.household_id = p_household_id and m.role = 'owner' and m.user_id <> p_user_id
  ) then
    raise exception 'A household needs at least one admin';
  end if;
  update public.household_members
  set role = case when p_admin then 'owner' else 'member' end
  where household_id = p_household_id and user_id = p_user_id;
end;
$$;

-- The database half of an invite, called by the travel-invite-user edge function as the inviter: checks they may
-- invite this person, lets the email past the sign-up gate, records the invite, and returns the address to email.
create function public.travel_invite_person(p_person_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.travel_people;
  v_uid uuid := (select auth.uid());
  v_email text;
begin
  select * into v from public.travel_people p where p.id = p_person_id;
  if not found or not public.travel_is_user(v.household_id) then
    raise exception 'Person not found';
  end if;
  -- Someone with an account is reached at the address they sign in with, whatever was saved for them.
  v_email := coalesce((select lower(u.email) from auth.users u where u.id = v.user_id), v.email);
  if not public.travel_is_admin(v.household_id) and not exists (
    select 1
    from public.travel_participants pt
    join public.travel_trips t on t.id = pt.trip_id
    where pt.person_id = v.id and t.owner_id = v_uid
  ) then
    raise exception 'Only an admin, or the owner of a trip they''re on, can invite %', v.name;
  end if;
  if v_email is null then
    raise exception 'Add an email address for % first', v.name;
  end if;
  if public.travel_has_access(v.household_id, v.user_id) then
    raise exception '% already has access', v.name;
  end if;

  -- An address the finance app already approved keeps its record of who approved it and when.
  insert into public.signup_allowlist (email, invited_by, invited_at)
  values (v_email, v_uid, now())
  on conflict (email) do nothing;

  update public.travel_people set invited_at = now(), invited_by = v_uid where id = v.id;
  return v_email;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.travel_is_user(uuid)',
    'public.travel_is_admin(uuid)',
    'public.travel_can_edit(uuid, uuid)',
    'public.travel_can_edit_trip(uuid)',
    'public.travel_is_traveller(uuid)',
    'public.travel_can_view_trip(uuid)',
    'public.travel_trips_guard_owner()',
    'public.travel_people_forget_invite()',
    'public.travel_checklist_guard()',
    'public.travel_sync_me()',
    'public.travel_my_households()',
    'public.travel_touch_household(uuid)',
    'public.travel_people_list(uuid)',
    'public.travel_add_person(uuid, text, text)',
    'public.travel_update_person(uuid, text, text)',
    'public.travel_revoke_person(uuid)',
    'public.travel_delete_person(uuid)',
    'public.travel_set_admin(uuid, uuid, boolean)',
    'public.travel_invite_person(uuid)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;

-- Internal helpers: they take any user id or household, so only the functions above call them.
revoke execute on function public.travel_has_access(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.travel_check_person_email(uuid, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- One-off: the household's other member could edit every trip until now, so they become an admin.
-- ---------------------------------------------------------------------------------------------------------------

update public.household_members m
set role = 'owner'
from auth.users u
where u.id = m.user_id
  and lower(u.email) = 'jolenelavine@gmail.com'
  and m.role = 'member'
  -- Only the household they share with its current admin.
  and exists (
    select 1
    from public.household_members o
    join auth.users ou on ou.id = o.user_id
    where o.household_id = m.household_id and o.role = 'owner' and lower(ou.email) = 'jlavine@gmail.com'
  );
