import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/input'
import { AuthShell } from '@/components/AuthShell'
import { useAuth } from './AuthProvider'
import { MIN_PASSWORD_LENGTH, PasswordInput, newPasswordProblem } from './PasswordInput'

/** Shown after following an invite or reset link: the user is signed in but must choose a password first. */
export function SetPasswordPage() {
  const { session, needsPassword, passwordSet } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const invited = needsPassword === 'invite'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const problem = newPasswordProblem(password, confirm)
    if (problem) return setError(problem)
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(error.message)
    else passwordSet()
  }

  return (
    <AuthShell
      title={invited ? 'Welcome! Choose a password' : 'Choose a new password'}
      subtitle={
        <>
          {invited ? "You'll use it with " : 'For '}
          <span className="font-medium text-slate-700">{session?.user.email}</span>
          {invited ? ' to sign in from now on.' : '.'}
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="new-password">New password</Label>
          <PasswordInput
            id="new-password"
            required
            autoFocus
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
          />
        </div>
        <div>
          <Label htmlFor="confirm-password">Confirm password</Label>
          <PasswordInput
            id="confirm-password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={setConfirm}
          />
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Saving...' : 'Save password'}
        </Button>
        <div className="pt-1 text-center text-xs font-medium text-brand-700">
          <button type="button" onClick={() => void supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </form>
    </AuthShell>
  )
}
