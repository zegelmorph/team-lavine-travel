// Google Places (New) proxy for destination and hotel lookup, so the API key never reaches the browser.
// POST { "action": "autocomplete", "input": "...", "kind": "city" | "lodging" | "any", "sessionToken": "<uuid>" }
//   -> { suggestions: [{ placeId, primary, secondary }] }
// POST { "action": "details", "placeId": "...", "sessionToken": "<uuid>" }
//   -> { place: { placeId, name, address, lat, lng, phone, website, rating, googleMapsUri, country } }
// Responds 501 { error, code: "not_configured" } when GOOGLE_PLACES_API_KEY isn't set, so the app falls back to manual entry.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? ''
const PLACES = 'https://places.googleapis.com/v1'

// Billing is per field tier; these stay within Place Details Essentials/Pro plus contact info.
const DETAIL_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'addressComponents',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'rating',
  'googleMapsUri',
].join(',')

const KIND_TYPES: Record<string, string[] | undefined> = {
  city: ['(cities)'],
  lodging: ['lodging'],
  any: undefined,
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

async function signedIn(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return false
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '' },
  })
  return res.ok
}

async function google(path: string, init: RequestInit & { fieldMask?: string }) {
  const res = await fetch(`${PLACES}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      ...(init.fieldMask ? { 'X-Goog-FieldMask': init.fieldMask } : {}),
    },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error?.message ?? `Google Places request failed (${res.status})`)
  return body
}

interface AutocompleteResponse {
  suggestions?: {
    placePrediction?: {
      placeId: string
      structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } }
      text?: { text: string }
    }
  }[]
}

interface PlaceResponse {
  id: string
  displayName?: { text: string }
  formattedAddress?: string
  location?: { latitude: number; longitude: number }
  addressComponents?: { longText: string; shortText: string; types: string[] }[]
  nationalPhoneNumber?: string
  internationalPhoneNumber?: string
  websiteUri?: string
  rating?: number
  googleMapsUri?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!(await signedIn(req))) return json({ error: 'Sign in required' }, 401)
  if (!API_KEY) {
    return json({ error: 'Place lookup is not set up yet. Enter the details by hand.', code: 'not_configured' }, 501)
  }

  try {
    const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>
    const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
    const sessionToken = str(body.sessionToken, 64) || undefined

    if (body.action === 'autocomplete') {
      const input = str(body.input)
      if (input.length < 2) return json({ suggestions: [] })
      const types = KIND_TYPES[str(body.kind)] ?? undefined
      const data = (await google('/places:autocomplete', {
        method: 'POST',
        body: JSON.stringify({ input, sessionToken, ...(types ? { includedPrimaryTypes: types } : {}) }),
      })) as AutocompleteResponse
      const suggestions = (data.suggestions ?? [])
        .map((s) => s.placePrediction)
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map((p) => ({
          placeId: p.placeId,
          primary: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
          secondary: p.structuredFormat?.secondaryText?.text ?? '',
        }))
      return json({ suggestions })
    }

    if (body.action === 'details') {
      const placeId = str(body.placeId)
      if (!/^[\w-]+$/.test(placeId)) return json({ error: 'Invalid place' }, 400)
      const qs = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : ''
      const p = (await google(`/places/${placeId}${qs}`, { method: 'GET', fieldMask: DETAIL_FIELDS })) as PlaceResponse
      const country = p.addressComponents?.find((c) => c.types.includes('country'))?.longText ?? null
      return json({
        place: {
          placeId: p.id,
          name: p.displayName?.text ?? '',
          address: p.formattedAddress ?? null,
          lat: p.location?.latitude ?? null,
          lng: p.location?.longitude ?? null,
          phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
          website: p.websiteUri ?? null,
          rating: p.rating ?? null,
          googleMapsUri: p.googleMapsUri ?? null,
          country,
        },
      })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Place lookup failed' }, 502)
  }
})
