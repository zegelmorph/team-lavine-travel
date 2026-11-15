// Sends (or resends) the invite email for a saved person, giving them travel-only access to the household.
// POST { "personId": "<uuid>", "redirectTo"?: "https://..." }
//
// The travel_invite_person database function does the deciding, called with the caller's own token: it checks they
// may invite this person (an admin, or the owner of a trip the person is on), lets the email past the sign-up gate,
// records the invite and returns the address. This function then has Supabase send the invite email, which needs the
// service key.
// Responds { status: 'invited' }, or { status: 'added' } when that email already has an account. Supabase won't invite
// an address that's already registered, so they're emailed a sign-in link instead; they get access when they next
// open the app.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''

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

function serviceHeaders(): Record<string, string> {
  const key = serviceKey()
  return key.startsWith('ey') ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key }
}

function callerHeaders(req: Request): Record<string, string> {
  return {
    Authorization: req.headers.get('Authorization') ?? '',
    apikey: req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  }
}

async function signedIn(req: Request): Promise<boolean> {
  if (!(req.headers.get('Authorization') ?? '').startsWith('Bearer ')) return false
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: callerHeaders(req) })
  return res.ok
}

type AuthError = { msg?: string; message?: string; error_code?: string } | null

/** Has Supabase Auth email this address: the invite, or (`otp`) a sign-in link for an account that already exists. */
function sendAuthEmail(kind: 'invite' | 'otp', email: string, redirect: string): Promise<Response> {
  return fetch(`${SUPABASE_URL}/auth/v1/${kind}${redirect ? `?redirect_to=${encodeURIComponent(redirect)}` : ''}`, {
    method: 'POST',
    headers: { ...serviceHeaders(), 'Content-Type': 'application/json' },
    // create_user: a sign-in link must never make an account, which would skip the invite.
    body: JSON.stringify(kind === 'otp' ? { email, create_user: false } : { email }),
  })
}

/** The response for an email Supabase Auth wouldn't send. The invite itself is recorded by now, so say so. */
function emailNotSent(res: Response, err: AuthError) {
  if (res.status === 429) {
    return json({ error: 'The invite is saved, but too many emails were sent recently. Resend it later.' }, 429)
  }
  const why = err?.msg ?? err?.message ?? `error ${res.status}`
  return json({ error: `The invite is saved, but the email couldn't be sent (${why}). Try Resend.` }, 502)
}

/** A refusal from travel_invite_person, worded for the person inviting. */
class Refused extends Error {}

/** Runs travel_invite_person as the caller, so its permission checks apply to them. Returns the email to invite. */
async function recordInvite(req: Request, personId: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/travel_invite_person`, {
    method: 'POST',
    headers: { ...callerHeaders(req), 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_person_id: personId }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    // P0001 is a message raised by the function itself; anything else is a fault.
    if (body?.code === 'P0001' && typeof body.message === 'string') throw new Refused(body.message)
    throw new Error(body?.message ?? 'Could not record the invite')
  }
  return body as string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!(await signedIn(req))) return json({ error: 'Sign in required' }, 401)

  try {
    const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    const personId = str(body.personId)
    const redirectTo = str(body.redirectTo)
    if (!/^[0-9a-f-]{36}$/i.test(personId)) return json({ error: 'personId is required' }, 400)

    const email = await recordInvite(req, personId)

    const redirect = /^https?:\/\//.test(redirectTo) ? redirectTo : ''
    const invite = await sendAuthEmail('invite', email, redirect)
    if (invite.ok) return json({ status: 'invited' })

    const err = (await invite.json().catch(() => null)) as AuthError
    const registered = err?.error_code === 'email_exists' || /already been registered/i.test(err?.msg ?? err?.message ?? '')
    if (!registered) return emailNotSent(invite, err)

    // They already have an account (the finance app, or an earlier invite), which Supabase won't invite again.
    // Email them a link that signs them in here instead.
    const link = await sendAuthEmail('otp', email, redirect)
    if (link.ok) return json({ status: 'added' })
    return emailNotSent(link, (await link.json().catch(() => null)) as AuthError)
  } catch (e) {
    if (e instanceof Refused) return json({ error: e.message }, 400)
    return json({ error: e instanceof Error ? e.message : 'Invite failed' }, 500)
  }
})
