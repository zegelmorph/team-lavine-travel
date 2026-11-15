# Team Lavine Travel

Trip planning for the Lavine households: destinations with dates and automatic weather, travellers who can be invited to follow along, transport, lodging (with Google Places lookup and Maps links), a day-by-day schedule, packing lists, and a to-do checklist.

Companion to [Team Lavine Finances](../personal-finance), sharing its stack, design system, Supabase project, and sign-in. Production: <https://travel.teamlavine.app>.

## Stack

Vite + React 19 + TypeScript, TanStack Query, Tailwind 4, Radix primitives (`src/components/ui`), Supabase (Postgres + RLS, Auth, pg_cron, edge functions). Weather comes from [Open-Meteo](https://open-meteo.com) (no key); hotel and place lookup from the Google Places API (New) via an edge function.

## Local development

```sh
npm install
cp .env.example .env.local   # VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (same values as the finance app)
npm run dev                  # http://localhost:5174 (finance runs on 5173)
```

| Script | |
| --- | --- |
| `npm run dev` | Dev server on port 5174 |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run typecheck` | TypeScript only |
| `npm test` | Vitest unit tests (`src/**/model.test.ts`) |

## Shared Supabase project (read this before touching the database)

This app lives in the **Team Lavine** Supabase project (`bkehjssluczhindlyeme`) alongside the finance app.

- **Reused, never modified:** `auth.users`, `households`, `household_members`, `signup_allowlist`, `is_household_member()`, `is_household_owner()`, `accept_invites()` and `create_household()`. Their definitions, policies and triggers are never changed. The finance app's other objects (`household_invites`, `my_households()`, `household_member_list()`, the `admin-invite-user` edge function, …) are not used here and are left alone. The only rows this app writes in the reused tables are:
  - a new household and its first member, through the finance app's `create_household()`, when someone with no household creates one;
  - `households.name`, when an admin renames the household in Settings (under the finance app's own policy);
  - `household_members.role`, set by `travel_set_admin()` when an admin makes a household member an admin or a regular user;
  - `household_members` deletes, when an admin removes a household member in Settings (this removes them from the finance app too);
  - `signup_allowlist` inserts, made by `travel_invite_person()` so an invited person can create an account. An existing row is left as it is.
- **Owned by this app:** everything prefixed `travel_` (tables, the `travel_trip_summaries` view, functions, triggers, the `travel_status` / `travel_weather` cron jobs, the `travel_cron_token` Vault secret) and the `travel-places` / `travel-weather` / `travel-invite-user` edge functions.
- **Applying migrations:** write a new file in `supabase/migrations/`, apply it with the Supabase MCP `apply_migration` tool (or paste it into the SQL editor), then rename the local file to the version Supabase assigned. **Never run `supabase db push` or `supabase db reset` against the remote project** — the migration history is shared with the finance repo and the CLI would try to reconcile it.
- **Deploying functions:** `npx supabase functions deploy travel-places travel-weather travel-invite-user --project-ref bkehjssluczhindlyeme` (the `verify_jwt` settings come from `supabase/config.toml`).

## People and access

Everyone who can be put on a trip is a row in `travel_people` (a name, an optional email, and the account it belongs to once there is one). A person's access to a household's trips is one of:

| Access | Who | Can |
| --- | --- | --- |
| **Admin** | An owner of the household (`household_members.role = 'owner'`) | See and change every trip, manage people, send invites, make members admins, reassign a trip's owner |
| **User** | Any other household member, or someone invited from this app who has signed in | Create trips and fully manage the ones they own; see trips they're a traveller on |
| **Invited** | Has an email and an invite, but hasn't signed in yet | Nothing until they sign in |
| **No account** | A saved name, used as a traveller | Nothing |

- A **trip's owner** (`travel_trips.owner_id`, the person who created it unless an admin reassigns it) and the admins manage the trip. Its **travellers** can see all of it, and can tick packing items and to-dos off, but change nothing else.
- Invites sent from this app are **travel-only**: the person gets an account and a `travel_people` row, not a `household_members` row, so they see nothing in the finance app. Full household membership is still granted from the finance app, and only household members can be made admins.
- Admins invite from **Settings → Household → People**. A trip's owner can add a person (always a regular user) from the trip's Travellers panel and send their invite there.
- Inviting is two steps in `travel-invite-user`: `travel_invite_person()` runs as the caller, checks they may invite that person, and records the invite and the sign-up allowlist row; then the function sends the Supabase invite email with the service role. A person who already has an account is given access straight away.
- On sign-in the app calls `travel_sync_me()`, which accepts any pending finance invites and links the account to the `travel_people` rows carrying its confirmed email, and then `travel_my_households()` for the households it can use and its role in each.

Every travel table carries `household_id` (copied from the parent trip by trigger) and has RLS enabled. Policies are built on three helpers rather than on `is_household_member()`:

- `travel_is_user(household_id)`: has any access to the household's travel data (people list, packing catalog and categories, creating a trip).
- `travel_can_view_trip(trip_id)`: an admin, the trip's owner, or one of its travellers.
- `travel_can_edit_trip(trip_id)`: an admin or the trip's owner.

Two triggers hold what policies can't express: `travel_checklist_guard` lets a traveller change only `packed` on a packing item and `done` on a to-do, and `travel_trips_guard_owner` lets only admins change a trip's owner. `travel_people` has no write policies; it changes only through the `travel_*_person` functions, which check the caller.

`supabase/tests/travel_access.sql` checks all of this as each kind of person (admin, member, travel-only user, traveller, revoked, never invited, another household). It builds its own households and users, and always ends by raising an exception that carries the result, so everything it did is rolled back. Run it after changing a policy, helper or trigger, and add a check for any new rule:

```
npx supabase db query --linked --project-ref bkehjssluczhindlyeme -f supabase/tests/travel_access.sql
```

The "error" it prints is the result, and should end in `0 failed` (`TRAVEL ACCESS TESTS (rolled back): 153 passed, 0 failed`); failed checks are listed by name after the counts. The flags are those of the Supabase CLI v2 this repo uses.

## Automations

- **Status** (`travel_status`, hourly at :05 UTC): `travel_refresh_statuses()` moves trips to *Happening* once the first destination starts and to *Complete* after the last one ends, using each destination's local date. It also runs immediately when destination dates change. Picking a status by hand turns off "Auto status" for that trip.
- **Weather** (`travel_weather`, daily at 11:15 UTC): pg_net calls `travel-weather` with the `x-travel-cron-token` header. Days within the 16-day forecast window get the forecast, past days get what was recorded, and later days get a "typical" value averaged from the previous three years. The app also refreshes a trip's weather when it's opened (at most every 3 hours) and after a destination is edited. That path reads the destinations as the signed-in caller, so RLS decides which ones they may refresh, and writes the weather with the service role, so travellers who can't edit a trip still get fresh weather.

## Deploying (one-time setup)

1. **Vercel:** import this repo as a new project (framework Vite; `vercel.json` handles the SPA rewrite). Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then add the domain `travel.teamlavine.app` and create the DNS record Vercel shows.
2. **Supabase Auth → URL Configuration:** add `https://travel.teamlavine.app/**` and `http://localhost:5174/**` to the redirect URLs. Leave the Site URL pointing at the finance app; this app passes its own `redirectTo` for invites, magic links, and password resets.
3. **Google Places:** in Google Cloud, enable **Places API (New)**, create an API key restricted to that API, and set it as an edge function secret:
   `npx supabase secrets set GOOGLE_PLACES_API_KEY=... --project-ref bkehjssluczhindlyeme`.
   Until then, lodging and transport are entered by hand and destinations are geocoded through Open-Meteo.
4. **Invite email (optional):** the project's invite template is shared with finance. If it mentions "Finances", change the subject and body to something neutral such as "You're invited to Team Lavine".

Sign-in sessions are stored per site, so users sign in once on each of the finance and travel subdomains with the same account.
