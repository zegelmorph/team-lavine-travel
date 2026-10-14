-- Per-user preferences (not per household), starting with 12h/24h time display. A missing row means defaults, so rows
-- are only written when someone changes a setting.

create table public.travel_user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  time_format text not null default '12h' check (time_format in ('12h', '24h')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger travel_user_settings_touch before update on public.travel_user_settings
  for each row execute function public.travel_touch_updated_at();

alter table public.travel_user_settings enable row level security;
revoke all on public.travel_user_settings from anon, public;
grant select, insert, update on public.travel_user_settings to authenticated;

create policy travel_user_settings_own on public.travel_user_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
