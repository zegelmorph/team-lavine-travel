// Refreshes destination weather from Open-Meteo (free, no key) and fills in each destination's time zone.
// Dates inside the 16-day forecast window get the forecast, past dates get what was recorded, and later dates get
// "typical" weather, averaged from the same calendar days over the last three years.
//
// Signed-in app: POST { "tripId": "<uuid>", "destinationId"?: "<uuid>", "force"?: boolean }. Runs with the caller's
//   token, so RLS limits it to their own trips. Destinations refreshed in the last few hours are skipped unless forced.
// pg_cron: POST { "mode": "cron" } with header x-travel-cron-token (see the travel_automation migration). Refreshes
//   every upcoming or in-progress destination using the service role.
//
// Deployed with verify_jwt off because the cron call has no user JWT; both paths authenticate themselves below.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const FORECAST_DAYS = 16
const TYPICAL_YEARS = 3
const MAX_DAYS = 60
const RECENT_PAST_DAYS = 60
const STALE_MS = 3 * 60 * 60 * 1000

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

// Projects on the newer API keys expose SUPABASE_SECRET_KEYS; older ones only have the service role JWT.
function serviceKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
    if (keys.default) return keys.default
  } catch {
    // fall through to the legacy key
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
}

interface Destination {
  id: string
  lat: number | null
  lng: number | null
  start_date: string | null
  end_date: string | null
  timezone: string | null
  weather_refreshed_at: string | null
}

interface WeatherRow {
  destination_id: string
  date: string
  temp_max_c: number | null
  temp_min_c: number | null
  precip_prob: number | null
  precip_mm: number | null
  weather_code: number | null
  source: 'forecast' | 'typical'
  fetched_at: string
}

interface Daily {
  time: string[]
  weather_code?: (number | null)[]
  temperature_2m_max?: (number | null)[]
  temperature_2m_min?: (number | null)[]
  precipitation_probability_max?: (number | null)[]
  precipitation_sum?: (number | null)[]
}

// ---- Date-only helpers on yyyy-MM-dd strings (UTC math, no local-time drift) ----

const toDate = (s: string) => new Date(`${s}T00:00:00Z`)
const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (s: string, n: number) => {
  const d = toDate(s)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}
const shiftYears = (s: string, n: number) => `${Number(s.slice(0, 4)) + n}${s.slice(4)}`.replace(/-02-29$/, '-02-28')
const todayIn = (tz: string | null) => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz ?? 'UTC' }).format(new Date())
  } catch {
    return iso(new Date())
  }
}

function eachDay(start: string, end: string): string[] {
  const days: string[] = []
  for (let d = start; d <= end && days.length < MAX_DAYS; d = addDays(d, 1)) days.push(d)
  return days
}

async function openMeteo(url: string): Promise<{ timezone?: string; daily?: Daily }> {
  const res = await fetch(url)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.reason ?? `Open-Meteo request failed (${res.status})`)
  return body
}

const round1 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 10) / 10)

function mode(values: number[]): number | null {
  if (values.length === 0) return null
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]
}

async function weatherFor(d: Destination): Promise<{ timezone: string | null; rows: WeatherRow[] }> {
  const fetchedAt = new Date().toISOString()
  const today = todayIn(d.timezone)
  const lastForecast = addDays(today, FORECAST_DAYS - 1)
  // The forecast API also returns the recent past; older days come from the archive. Both are stored as 'forecast'
  // (weather for that exact day), as opposed to 'typical'.
  const recentStart = addDays(today, -RECENT_PAST_DAYS)
  const days = eachDay(d.start_date!, d.end_date!)
  const pastDays = days.filter((x) => x < recentStart)
  const forecastDays = days.filter((x) => x >= recentStart && x <= lastForecast)
  const typicalDays = days.filter((x) => x > lastForecast)
  const loc = `latitude=${d.lat}&longitude=${d.lng}&timezone=auto`
  const rows: WeatherRow[] = []

  if (pastDays.length) {
    const archive = await openMeteo(
      `https://archive-api.open-meteo.com/v1/archive?${loc}` +
        `&start_date=${pastDays[0]}&end_date=${pastDays[pastDays.length - 1]}` +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum',
    )
    const a = archive.daily
    a?.time.forEach((date, i) => {
      rows.push({
        destination_id: d.id,
        date,
        temp_max_c: round1(a.temperature_2m_max?.[i]),
        temp_min_c: round1(a.temperature_2m_min?.[i]),
        precip_prob: null,
        precip_mm: round1(a.precipitation_sum?.[i]),
        weather_code: a.weather_code?.[i] ?? null,
        source: 'forecast',
        fetched_at: fetchedAt,
      })
    })
  }

  // Always called, even with no forecast days, because it also resolves the time zone.
  const range = forecastDays.length
    ? `start_date=${forecastDays[0]}&end_date=${forecastDays[forecastDays.length - 1]}`
    : 'forecast_days=1'
  const forecast = await openMeteo(
    `https://api.open-meteo.com/v1/forecast?${loc}&${range}` +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum',
  )
  if (forecastDays.length && forecast.daily) {
    const f = forecast.daily
    f.time.forEach((date, i) => {
      if (!forecastDays.includes(date)) return
      rows.push({
        destination_id: d.id,
        date,
        temp_max_c: round1(f.temperature_2m_max?.[i]),
        temp_min_c: round1(f.temperature_2m_min?.[i]),
        precip_prob: f.precipitation_probability_max?.[i] ?? null,
        precip_mm: round1(f.precipitation_sum?.[i]),
        weather_code: f.weather_code?.[i] ?? null,
        source: 'forecast',
        fetched_at: fetchedAt,
      })
    })
  }

  if (typicalDays.length) {
    // Keyed by MM-DD so a span crossing Feb 29 still lines up year to year.
    const samples = new Map<string, { max: number[]; min: number[]; rain: number[]; code: number[] }>()
    const first = typicalDays[0]
    const last = typicalDays[typicalDays.length - 1]
    const thisYear = Number(today.slice(0, 4))
    const yearsBack = Array.from({ length: TYPICAL_YEARS }, (_, i) => i + 1 + (Number(first.slice(0, 4)) - thisYear))
    for (const back of yearsBack) {
      const archive = await openMeteo(
        `https://archive-api.open-meteo.com/v1/archive?${loc}` +
          `&start_date=${shiftYears(first, -back)}&end_date=${shiftYears(last, -back)}` +
          '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum',
      )
      const a = archive.daily
      a?.time.forEach((date, i) => {
        const key = date.slice(5)
        const s = samples.get(key) ?? { max: [], min: [], rain: [], code: [] }
        const push = (arr: number[], v: number | null | undefined) => v != null && arr.push(v)
        push(s.max, a.temperature_2m_max?.[i])
        push(s.min, a.temperature_2m_min?.[i])
        push(s.rain, a.precipitation_sum?.[i])
        push(s.code, a.weather_code?.[i])
        samples.set(key, s)
      })
    }
    const avg = (arr: number[]) => (arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : null)
    for (const date of typicalDays) {
      const s = samples.get(date.slice(5)) ?? samples.get('02-28')
      if (!s) continue
      rows.push({
        destination_id: d.id,
        date,
        temp_max_c: round1(avg(s.max)),
        temp_min_c: round1(avg(s.min)),
        // Share of past years with at least 1 mm of rain that day.
        precip_prob: s.rain.length ? Math.round((s.rain.filter((r) => r >= 1).length / s.rain.length) * 100) : null,
        precip_mm: round1(avg(s.rain)),
        weather_code: mode(s.code),
        source: 'typical',
        fetched_at: fetchedAt,
      })
    }
  }

  return { timezone: forecast.timezone ?? d.timezone, rows }
}

async function refresh(db: SupabaseClient, destinations: Destination[]) {
  let refreshed = 0
  const errors: string[] = []
  for (const d of destinations) {
    if (d.lat == null || d.lng == null || !d.start_date || !d.end_date) continue
    try {
      const { timezone, rows } = await weatherFor(d)
      if (rows.length) {
        const { error } = await db.from('travel_weather').upsert(rows, { onConflict: 'destination_id,date' })
        if (error) throw error
      }
      // Dates that fell out of the destination's range.
      const { error: delError } = await db
        .from('travel_weather')
        .delete()
        .eq('destination_id', d.id)
        .or(`date.lt.${d.start_date},date.gt.${d.end_date}`)
      if (delError) throw delError
      const { error: updError } = await db
        .from('travel_destinations')
        .update({ timezone, weather_refreshed_at: new Date().toISOString() })
        .eq('id', d.id)
      if (updError) throw updError
      refreshed++
    } catch (e) {
      errors.push(`${d.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { refreshed, errors }
}

const COLUMNS = 'id, lat, lng, start_date, end_date, timezone, weather_refreshed_at'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>

  try {
    const cronToken = req.headers.get('x-travel-cron-token')
    if (cronToken) {
      const admin = createClient(SUPABASE_URL, serviceKey(), { auth: { persistSession: false } })
      const { data: valid } = await admin.rpc('travel_cron_token_valid', { p_token: cronToken })
      if (valid !== true) return json({ error: 'Invalid token' }, 401)
      const today = iso(new Date())
      const { data, error } = await admin
        .from('travel_destinations')
        .select(COLUMNS)
        .not('lat', 'is', null)
        .gte('end_date', addDays(today, -2))
        .lte('start_date', addDays(today, 400))
      if (error) throw error
      return json(await refresh(admin, (data ?? []) as Destination[]))
    }

    const auth = req.headers.get('Authorization') ?? ''
    if (!auth.startsWith('Bearer ')) return json({ error: 'Sign in required' }, 401)
    const db = createClient(SUPABASE_URL, req.headers.get('apikey') ?? ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: auth } },
    })
    const { data: user } = await db.auth.getUser(auth.slice('Bearer '.length))
    if (!user?.user) return json({ error: 'Sign in required' }, 401)

    const uuid = /^[0-9a-f-]{36}$/i
    const tripId = typeof body.tripId === 'string' && uuid.test(body.tripId) ? body.tripId : null
    if (!tripId) return json({ error: 'tripId is required' }, 400)
    let q = db.from('travel_destinations').select(COLUMNS).eq('trip_id', tripId)
    if (typeof body.destinationId === 'string' && uuid.test(body.destinationId)) q = q.eq('id', body.destinationId)
    const { data, error } = await q
    if (error) throw error
    const cutoff = Date.now() - STALE_MS
    const due = ((data ?? []) as Destination[]).filter(
      (d) => body.force === true || !d.weather_refreshed_at || Date.parse(d.weather_refreshed_at) < cutoff,
    )
    return json(await refresh(db, due))
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Weather refresh failed' }, 500)
  }
})
