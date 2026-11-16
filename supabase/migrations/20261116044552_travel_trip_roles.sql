-- Trip roles. A trip already has an owner, who manages it alongside the admins. Each of its other travellers is now
-- either a viewer (the default, and what every traveller was until now) or an editor:
--
--   viewer   sees the whole trip and ticks packing items and to-dos off.
--   editor   also changes the trip's contents: its name, status and notes, destinations, travel, lodging, events,
--            the packing list and the to-dos.
--
-- Who is on the trip, what role each traveller has, inviting them, deleting the trip and handing it to another owner
-- stay with the owner and the admins. A role only does anything for a traveller who can sign in; it is kept when
-- they lose their access, and applies again if they are invited back.
--
-- Nothing changes for the app as deployed before this: it never sends a role, so travellers it adds are viewers.

alter table public.travel_participants
  add column role text not null default 'viewer' check (role in ('viewer', 'editor'));

-- ---------------------------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------------------------

-- What travel_can_edit_trip meant until now: an admin or the trip's owner.
create function public.travel_can_manage_trip(p_trip_id uuid)
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

-- The caller is on the trip as an editor and still has access to its household.
create function public.travel_is_editor(p_trip_id uuid)
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
      and pt.role = 'editor'
      and p.user_id = (select auth.uid())
      and public.travel_has_access(pt.household_id, p.user_id)
  );
$$;

-- Editors join the people who can edit a trip. Every policy on a trip's rows, the weather policies and the checklist
-- guard ask this function, so they all follow.
create or replace function public.travel_can_edit_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.travel_can_manage_trip(p_trip_id) or public.travel_is_editor(p_trip_id);
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array['public.travel_can_manage_trip(uuid)', 'public.travel_is_editor(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------------------------------------------

-- Editors change the trip itself too. travel_trips_guard_owner still keeps its owner to the admins, and deleting it
-- (travel_trips_delete) stays with the owner and the admins.
drop policy travel_trips_update on public.travel_trips;
create policy travel_trips_update on public.travel_trips for update to authenticated
  using (public.travel_can_edit(household_id, owner_id) or public.travel_is_editor(id))
  with check (public.travel_can_edit(household_id, owner_id) or public.travel_is_editor(id));

-- Who is on a trip, and in what role, is not an editor's to change: otherwise an editor could let anyone in, or make
-- themselves the only one left.
drop policy travel_participants_insert on public.travel_participants;
drop policy travel_participants_update on public.travel_participants;
drop policy travel_participants_delete on public.travel_participants;
create policy travel_participants_insert on public.travel_participants for insert to authenticated
  with check (public.travel_can_manage_trip(trip_id));
create policy travel_participants_update on public.travel_participants for update to authenticated
  using (public.travel_can_manage_trip(trip_id)) with check (public.travel_can_manage_trip(trip_id));
create policy travel_participants_delete on public.travel_participants for delete to authenticated
  using (public.travel_can_manage_trip(trip_id));

-- ---------------------------------------------------------------------------------------------------------------
-- The checklist guard: the same rule, now worded for editors as well
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.travel_checklist_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb;
  v_old jsonb;
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  -- The update policy only asks that the destination trip be visible, so moving a row needs this check as well.
  if new.trip_id is distinct from old.trip_id and not public.travel_can_edit_trip(new.trip_id) then
    raise exception 'You can only move this to a trip you can edit';
  end if;
  if public.travel_can_edit_trip(old.trip_id) then
    return new;
  end if;

  v_new := to_jsonb(new) - tg_argv[0];
  v_old := to_jsonb(old) - tg_argv[0];

  -- The saved item or category was deleted: the foreign key is clearing the column.
  if tg_table_name = 'travel_pack_items' then
    if v_old->>'catalog_item_id' is not null and v_new->>'catalog_item_id' is null and not exists (
      select 1 from public.travel_pack_catalog c where c.id = (v_old->>'catalog_item_id')::uuid
    ) then
      v_new := v_new - 'catalog_item_id';
      v_old := v_old - 'catalog_item_id';
    end if;
    if v_old->>'category_id' is not null and v_new->>'category_id' is null and not exists (
      select 1 from public.travel_pack_categories c where c.id = (v_old->>'category_id')::uuid
    ) then
      v_new := v_new - 'category_id';
      v_old := v_old - 'category_id';
    end if;
  end if;

  if v_new is distinct from v_old then
    raise exception 'Only the trip''s owner and editors can change this. You can still check it off.';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Trip summaries: the caller's own role on each trip, for the trips list. Null when they aren't travelling on it.
-- Columns can only be added at the end of a view that is replaced in place.
-- ---------------------------------------------------------------------------------------------------------------

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
  t.owner_id,
  p.my_role
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
    array_agg(pe.name order by x.sort_order, x.created_at) as participants,
    -- 'viewer' sorts after 'editor', so the lesser role wins if the caller were ever on a trip twice.
    max(x.role) filter (where pe.user_id = (select auth.uid())) as my_role
  from public.travel_participants x
  join public.travel_people pe on pe.id = x.person_id
  where x.trip_id = t.id
) p on true;
