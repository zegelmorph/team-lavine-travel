# Team Lavine Travel

Trip planning for the Lavine households: destinations with dates and automatic weather, participants, transport, lodging (with Google Places lookup and Maps links), a day-by-day schedule, and packing lists.

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

- **Reused, never modified:** `auth.users`, `households`, `household_members`, `household_invites`, `signup_allowlist`, `is_household_member()`, `my_households()`, `accept_invites()`, `create_household()`, `household_member_list()`, and the `admin-invite-user` edge function.
- **Owned by this app:** everything prefixed `travel_` (tables, the `travel_trip_summaries` view, functions, triggers, the `travel_status` / `travel_weather` cron jobs, the `travel_cron_token` Vault secret) and the `travel-places` / `travel-weather` edge functions.
- **Applying migrations:** write a new file in `supabase/migrations/`, apply it with the Supabase MCP `apply_migration` tool (or paste it into the SQL editor), then rename the local file to the version Supabase assigned. **Never run `supabase db push` or `supabase db reset` against the remote project** — the migration history is shared with the finance repo and the CLI would try to reconcile it.
- **Deploying functions:** `npx supabase functions deploy travel-places travel-weather --project-ref bkehjssluczhindlyeme` (the `verify_jwt` settings come from `supabase/config.toml`).

Trips belong to a household and are shared by all its members. Every travel table carries `household_id` (copied from the parent trip by trigger) and is protected by an RLS policy on `is_household_member(household_id)`.

## Automations

- **Status** (`travel_status`, hourly at :05 UTC): `travel_refresh_statuses()` moves trips to *Happening* once the first destination starts and to *Complete* after the last one ends, using each destination's local date. It also runs immediately when destination dates change. Picking a status by hand turns off "Auto status" for that trip.
- **Weather** (`travel_weather`, daily at 11:15 UTC): pg_net calls `travel-weather` with the `x-travel-cron-token` header. Days within the 16-day forecast window get the forecast, past days get what was recorded, and later days get a "typical" value averaged from the previous three years. The app also refreshes a trip's weather when it's opened (at most every 3 hours) and after a destination is edited.

## Deploying (one-time setup)

1. **Vercel:** import this repo as a new project (framework Vite; `vercel.json` handles the SPA rewrite). Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then add the domain `travel.teamlavine.app` and create the DNS record Vercel shows.
2. **Supabase Auth → URL Configuration:** add `https://travel.teamlavine.app/**` and `http://localhost:5174/**` to the redirect URLs. Leave the Site URL pointing at the finance app; this app passes its own `redirectTo` for invites, magic links, and password resets.
3. **Google Places:** in Google Cloud, enable **Places API (New)**, create an API key restricted to that API, and set it as an edge function secret:
   `npx supabase secrets set GOOGLE_PLACES_API_KEY=... --project-ref bkehjssluczhindlyeme`.
   Until then, lodging and transport are entered by hand and destinations are geocoded through Open-Meteo.
4. **Invite email (optional):** the project's invite template is shared with finance. If it mentions "Finances", change the subject and body to something neutral such as "You're invited to Team Lavine".

Sign-in sessions are stored per site, so users sign in once on each of the finance and travel subdomains with the same account.
