-- Brings travel_todos in line with 20261008043212_travel_review_fixes.sql: household_id follows the parent trip on every
-- update (not only when trip_id changes), and the privileges Supabase grants by default beyond plain DML are dropped.

drop trigger travel_todos_household on public.travel_todos;
create trigger travel_todos_household before insert or update on public.travel_todos
  for each row execute function public.travel_set_household_from_trip();

revoke truncate, references, trigger on public.travel_todos from authenticated;
