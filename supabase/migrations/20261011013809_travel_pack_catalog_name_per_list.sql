-- Packing items and the travel cabinet are separate lists, so a name only needs to be unique within its list.
drop index public.travel_pack_catalog_name_key;
create unique index travel_pack_catalog_name_key on public.travel_pack_catalog (household_id, in_cabinet, lower(name));
