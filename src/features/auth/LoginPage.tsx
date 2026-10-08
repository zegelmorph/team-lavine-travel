import { useState, type FormEvent } from 'react'
import { authLinkError, supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { AuthShell } from '@/components/AuthShell'
import { PasswordInput } from './PasswordInput'

type Mode = 'signin' | 'signup' | 'magic' | 'reset'

const TITLES: Record<Mode, string> = {
  signin: 'Welcome back',
  signup: 'Create an account',
  magic: 'Email me a sign-in link',
  reset: 'Reset your password',
}
const SUBMIT: Record<Mode, string> = { signin: 'Sign in', signup: 'Sign up', magic: 'Send link', reset: 'Send reset link' }

const NOT_INVITED = "This email hasn't been invited yet. Ask the admin or your household owner to invite you."

/** The database rejects uninvited sign-ups, which Supabase reports generically. */
function friendlyError(message: string) {
  if (/signups not allowed for otp/i.test(message)) {
    return 'Sign-in links only work for existing accounts. If you were invited, use Create account instead.'
  }
  if (/database error saving new user|invitation only/i.test(message)) return NOT_INVITED
  return message
}

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(
    authLinkError ? { kind: 'error', text: `${authLinkError}. Ask for a new link, or reset your password below.` } : null,
  )

  function switchMode(next: Mode) {
    setMode(next)
    setMessage(null)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const redirect = window.location.origin
    if (mode === 'reset') {
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect })
      setBusy(false)
      // Same message either way so this can't be used to find out who has an account.
      setMessage({ kind: 'info', text: 'If that email has an account, a link to set a new password is on its way.' })
      return
    }
    const { error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : mode === 'signup'
          ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirect } })
          : await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: false } })
    setBusy(false)
    if (error) setMessage({ kind: 'error', text: friendlyError(error.message) })
    else if (mode === 'signup') setMessage({ kind: 'info', text: 'Check your email to confirm your account.' })
    else if (mode === 'magic') setMessage({ kind: 'info', text: 'Check your email for a sign-in link.' })
  }

  const needsPassword = mode === 'signin' || mode === 'signup'

  return (
    <AuthShell title={TITLES[mode]}>
      <form onSubmit={onSubmit} className="space-y-4">
        {mode === 'signup' && <p className="text-slate-500">You'll need an invitation from the admin or a household owner.</p>}
        {mode === 'reset' && <p className="text-slate-500">We'll email you a link to choose a new password.</p>}
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {needsPassword && (
          <div>
            <div className="flex items-baseline justify-between">
              <Label htmlFor="password">Password</Label>
              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => switchMode('reset')}
                  className="-my-2 mb-0 py-2 text-xs font-medium text-brand-700 max-md:text-sm"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <PasswordInput
              id="password"
              required
              minLength={mode === 'signup' ? 8 : undefined}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={setPassword}
            />
          </div>
        )}
        {message && (
          <p className={message.kind === 'error' ? 'rounded-lg bg-red-50 px-3 py-2 text-red-700' : 'rounded-lg bg-brand-50 px-3 py-2 text-brand-800'}>
            {message.text}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {SUBMIT[mode]}
        </Button>
        <div className="flex justify-between text-xs font-medium text-brand-700 max-md:text-sm [&>button]:py-2.5">
          <button type="button" onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}>
            {mode === 'signin' ? 'Create account' : 'Back to sign in'}
          </button>
          {mode !== 'reset' && (
            <button type="button" onClick={() => switchMode(mode === 'magic' ? 'signin' : 'magic')}>
              {mode === 'magic' ? 'Use password' : 'Email me a link'}
            </button>
          )}
        </div>
      </form>
    </AuthShell>
  )
}
