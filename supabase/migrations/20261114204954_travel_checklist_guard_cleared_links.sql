-- Deleting a saved packing item or a packing category clears the link on every trip's packing items (the foreign keys
-- are "on delete set null"), including items on trips the person deleting it doesn't manage. travel_checklist_guard
-- read that as a traveller editing the item and refused, so regular users couldn't delete saved items or categories
-- that were in use on someone else's trip.
--
-- The guard now lets a link go when what it pointed at no longer exists. Clearing a link by hand is still refused,
-- because the saved item or category is still there. Security definer so that "no longer exists" means exactly that,
-- and not "hidden from the caller"; like every trigger function it can't be called directly.

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
    raise exception 'You can only move this to a trip you manage';
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
    raise exception 'Only the trip''s owner can change this. You can still check it off.';
  end if;
  return new;
end;
$$;
