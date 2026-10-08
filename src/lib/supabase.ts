import { createClient, type Session } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && key)

/** Why the signed-in user must choose a password before continuing. */
export type PasswordReason = 'invite' | 'recovery'

const PASSWORD_REASON_KEY = 'travel:password-reason'

// Invite and reset links land here with `#access_token=...&type=invite|recovery` (or `#error=...` when expired).
// The client strips the hash once it signs in, so read it first. Session storage keeps the reason across a reload.
const linkParams = new URLSearchParams(window.location.hash.slice(1))
const linkType = linkParams.get('type')
if (linkParams.has('access_token') && (linkType === 'invite' || linkType === 'recovery')) {
  sessionStorage.setItem(PASSWORD_REASON_KEY, linkType)
}

/** Message from an invite or sign-in link that couldn't be used, e.g. because it expired. */
export const authLinkError = linkParams.get('error_description')

export function pendingPasswordReason(): PasswordReason | null {
  const reason = sessionStorage.getItem(PASSWORD_REASON_KEY)
  return reason === 'invite' || reason === 'recovery' ? reason : null
}

export function setPendingPasswordReason(reason: PasswordReason | null) {
  if (reason) sessionStorage.setItem(PASSWORD_REASON_KEY, reason)
  else sessionStorage.removeItem(PASSWORD_REASON_KEY)
}

export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true },
})

/**
 * The stored session while the device is offline. supabase-js reports no session once the access token has expired
 * and can't be refreshed, but keeps it in storage and refreshes it when the connection returns; until then the app
 * shows its saved copy instead of the sign-in screen.
 */
export function offlineSession(): Session | null {
  return navigator.onLine ? null : storedSession()
}

/**
 * Who the saved session belongs to, read synchronously at startup. Null while a sign-in link is landing, since the
 * stored session is about to be replaced by the link's user.
 */
export function storedSessionUserId(): string | null {
  return linkParams.has('access_token') ? null : (storedSession()?.user.id ?? null)
}

function storedSession(): Session | null {
  if (!url) return null
  try {
    // Mirrors supabase-js's default storage key, `sb-<project ref>-auth-token`.
    const ref = new URL(url).hostname.split('.')[0]
    const stored = JSON.parse(localStorage.getItem(`sb-${ref}-auth-token`) ?? 'null') as Session | null
    return stored?.access_token && stored.user ? stored : null
  } catch {
    return null
  }
}

export function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data as T
}
