-- Per-trip to-do checklist. Same shape as the other trip child tables: household_id is copied from the trip by trigger,
-- and RLS limits every row to members of that household.

create table public.travel_todos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  trip_id uuid not null references public.travel_trips (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  notes text,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index travel_todos_household_idx on public.travel_todos (household_id);
create index travel_todos_trip_idx on public.travel_todos (trip_id);
create trigger travel_todos_household before insert or update of trip_id on public.travel_todos
  for each row execute function public.travel_set_household_from_trip();

alter table public.travel_todos enable row level security;
revoke all on public.travel_todos from anon, public;
grant select, insert, update, delete on public.travel_todos to authenticated;
create policy travel_todos_all on public.travel_todos for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
