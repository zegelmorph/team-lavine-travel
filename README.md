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

- **Reused, never modified:** `auth.users`, `households`, `household_members`, `signup_allowlist`, `is_household_member()`, `is_household_owner()`, `accept_invites()` and `create_household()`. Their definitions, policies and triggers are never changed. The finance app's other objects (`household_invites`, `app_admins`, `my_households()`, `household_member_list()`, the `admin-invite-user` and `admin-delete-user` edge functions, …) are left alone; the only ones this app touches are read, never written, when a person is deleted (last item below). The only rows this app writes in the reused tables are:
  - a new household and its first member, through the finance app's `create_household()`, when someone with no household creates one;
  - `households.name`, when an admin renames the household in Settings (under the finance app's own policy);
  - `household_members.role`, set by `travel_set_admin()` when an admin makes a household member an admin or a regular user;
  - `household_members` deletes, when an admin removes a household member in Settings (this removes them from the finance app too);
  - `signup_allowlist` inserts, made by `travel_invite_person()` so an invited person can create an account. An existing row is left as it is;
  - `household_members` deletes made by `travel_delete_person()` when an admin deletes a person, and, only when that admin is a system admin of the finance app, the `auth.users` delete (or, before there is an account, the `signup_allowlist` delete) that goes with it. See "People and access" for which accounts it won't delete. Deleting the account fires the finance app's own `forget_deleted_user` trigger, which clears that email's allowlist row and pending household invites. To decide all this it reads, without writing, the finance app's `app_admins` (through `is_app_admin()` for the caller) and `household_invites`.
- **Owned by this app:** everything prefixed `travel_` (tables, the `travel_trip_summaries` view, functions, triggers, the `travel_status` / `travel_weather` cron jobs, the `travel_cron_token` Vault secret) and the `travel-places` / `travel-weather` / `travel-invite-user` edge functions.
- **Applying migrations:** write a new file in `supabase/migrations/`, apply it with the Supabase MCP `apply_migration` tool (or paste it into the SQL editor), then rename the local file to the version Supabase assigned. **Never run `supabase db push` or `supabase db reset` against the remote project** — the migration history is shared with the finance repo and the CLI would try to reconcile it.
- **Shared settings this app writes:** the project's invite and sign-in link email templates, which serve both apps. The copies in `supabase/templates/` here are the ones on the project (see "Emails" under Deploying). **Never run `supabase config push` from this repo's own `config.toml`**: it holds local-development values (Site URL, redirect URLs, MFA and more) that would overwrite the shared project's.
- **Deploying functions:** `npx supabase functions deploy travel-places travel-weather travel-invite-user --project-ref bkehjssluczhindlyeme` (the `verify_jwt` settings come from `supabase/config.toml`).

## People and access

Everyone who can be put on a trip is a row in `travel_people` (a name, an optional email, and the account it belongs to once there is one). A person's access to a household's trips is one of:

| Access | Who | Can |
| --- | --- | --- |
| **Admin** | An owner of the household (`household_members.role = 'owner'`) | See and change every trip, manage people, send invites, make members admins, reassign a trip's owner |
| **User** | Any other household member, or someone invited from this app who has signed in | Create trips and fully manage the ones they own; see trips they're a traveller on, and edit those where they've been made an editor |
| **Invited** | Has an email and an invite, but hasn't signed in yet | Nothing until they sign in |
| **No account** | A saved name, used as a traveller | Nothing |

- A **trip's owner** (`travel_trips.owner_id`, the person who created it unless an admin reassigns it) and the admins manage the trip. Each of its other **travellers** has a role on it (`travel_participants.role`), set by the owner or an admin from the trip's Travellers panel:
  - A **viewer** (the default) can see all of the trip, and can tick packing items and to-dos off, but change nothing else.
  - An **editor** can also change what's on the trip: its name, status and notes, destinations, travel, lodging, events, the packing list and the to-dos.
  - Neither can change who is on the trip or anyone's role, invite its travellers, delete it or hand it to another owner. A role does nothing for a traveller who can't sign in, but it is kept: someone who loses their access and is invited back returns with the role they had.
- Invites sent from this app are **travel-only**: the person gets an account and a `travel_people` row, not a `household_members` row, so they see nothing in the finance app. Full household membership is still granted from the finance app, and only household members can be made admins.
- Admins invite from **Settings → Household → People**. A trip's owner can add a person (always a regular user) from the trip's Travellers panel and send their invite there. For someone saved without an email, an admin is asked for the address first, in either place; other trip owners aren't offered that, because only admins can change someone else's details (`travel_update_person()`).
- Inviting is two steps in `travel-invite-user`: `travel_invite_person()` runs as the caller, checks they may invite that person, and records the invite and the sign-up allowlist row; then the function sends the Supabase invite email with the service role. A person who already has an account can't be invited again by Supabase, so they are emailed a sign-in link instead (the project's Magic Link template) and get access when they next open the app.
- An admin has two ways to take someone out, both in the person's edit dialog. **Remove access** (`travel_revoke_person()`, after the `household_members` row for a member) stops them signing in to this household but keeps them on their trips as a name, and keeps their account. **Delete** (`travel_delete_person()`) removes them altogether, whatever access they have: off every trip and out of the household (so, for a member, out of the finance app too). Nobody can delete themselves. Their **account** in the shared project is deleted as well only when the admin doing it is a system admin of the finance app (`app_admins`), which is the finance app's own rule for deleting accounts; for any other admin the account is left as it was and the app says so (`admin_only`); with the person gone, that account can then only be deleted from the finance app's Admin area. The account is the one the person is linked to, or else the one under their saved email (an invite they never followed, or access that was removed earlier). Even a system admin's delete leaves it in place (`kept`) when something else still uses it: it is a system admin itself, it belongs to or is invited to another household, it is linked to or invited as another person, or it only shares the person's email and is a household member. When there is no account yet, the approval to sign up (the allowlist row) is taken back instead, unless another household has invited that email.
- On sign-in the app calls `travel_sync_me()`, which accepts any pending finance invites and links the account to the `travel_people` rows carrying its confirmed email, and then `travel_my_households()` for the households it can use and its role in each.

Every travel table carries `household_id` (copied from the parent trip by trigger) and has RLS enabled. Policies are built on four helpers rather than on `is_household_member()`:

- `travel_is_user(household_id)`: has any access to the household's travel data (people list, packing catalog and categories, creating a trip).
- `travel_can_view_trip(trip_id)`: an admin, the trip's owner, or one of its travellers.
- `travel_can_edit_trip(trip_id)`: an admin, the trip's owner, or one of its editors. Guards the rows that belong to a trip.
- `travel_can_manage_trip(trip_id)`: an admin or the trip's owner. Guards `travel_participants`, and so who is on the trip and in what role.

Two triggers hold what policies can't express: `travel_checklist_guard` lets a viewer change only `packed` on a packing item and `done` on a to-do, and `travel_trips_guard_owner` lets only admins change a trip's owner. `travel_people` has no write policies; it changes only through the `travel_*_person` functions, which check the caller.

`supabase/tests/travel_access.sql` checks all of this as each kind of person (admin, member, travel-only user, viewer, editor, revoked, never invited, another household). It builds its own households and users, and always ends by raising an exception that carries the result, so everything it did is rolled back. Run it after changing a policy, helper or trigger, and add a check for any new rule:

```
npx supabase db query --linked --project-ref bkehjssluczhindlyeme -f supabase/tests/travel_access.sql
```

The "error" it prints is the result, and should end in `0 failed` (`TRAVEL ACCESS TESTS (rolled back): 247 passed, 0 failed`); failed checks are listed by name after the counts. The flags are those of the Supabase CLI v2 this repo uses.

## Automations

- **Status** (`travel_status`, hourly at :05 UTC): `travel_refresh_statuses()` moves trips to *Happening* once the first destination starts and to *Complete* after the last one ends, using each destination's local date. It also runs immediately when destination dates change. Picking a status by hand turns off "Auto status" for that trip.
- **Weather** (`travel_weather`, daily at 11:15 UTC): pg_net calls `travel-weather` with the `x-travel-cron-token` header. Days within the 16-day forecast window get the forecast, past days get what was recorded, and later days get a "typical" value averaged from the previous three years. The app also refreshes a trip's weather when it's opened (at most every 3 hours) and after a destination is edited. That path reads the destinations as the signed-in caller, so RLS decides which ones they may refresh, and writes the weather with the service role, so travellers who can't edit a trip still get fresh weather.

## Deploying (one-time setup)

1. **Vercel:** import this repo as a new project (framework Vite; `vercel.json` handles the SPA rewrite). Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then add the domain `travel.teamlavine.app` and create the DNS record Vercel shows.
2. **Supabase Auth → URL Configuration:** add `https://travel.teamlavine.app/**` and `http://localhost:5174/**` to the redirect URLs. Leave the Site URL pointing at the finance app; this app passes its own `redirectTo` for invites, magic links, and password resets.
3. **Google Places:** in Google Cloud, enable **Places API (New)**, create an API key restricted to that API, and set it as an edge function secret:
   `npx supabase secrets set GOOGLE_PLACES_API_KEY=... --project-ref bkehjssluczhindlyeme`.
   Until then, lodging and transport are entered by hand and destinations are geocoded through Open-Meteo.
4. **Emails:** `supabase/templates/invite.html` and `magic_link.html` are the invite and sign-in link emails (the second is also what an invited person who already has an account receives). The project shares both with finance, so each one shows Travel or Finances depending on the `redirectTo` its link was requested with: this app's origin means Travel, anything else Finances. The logo comes from that site's `/email-logo.png`, so this app must be deployed before its logo shows. To change them, edit the files and push only those two templates:
   - Make an empty folder with a `supabase/` directory holding a copy of `templates/` and a `config.toml` that contains nothing but `project_id` and the two `[auth.email.template.*]` sections from this repo's `config.toml`.
   - Run `npx supabase config push --project-ref bkehjssluczhindlyeme --workdir <that folder>`. Answer yes only if it lists just the template subjects and contents, and no to anything else.

Sign-in sessions are stored per site, so users sign in once on each of the finance and travel subdomains with the same account.
