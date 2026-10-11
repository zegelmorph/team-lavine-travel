-- Saved items kept in the household's travel cabinet, offered as a checklist on each trip.
alter table public.travel_pack_catalog add column in_cabinet boolean not null default false;
