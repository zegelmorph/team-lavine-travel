import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { offlineSession, pendingPasswordReason, setPendingPasswordReason, supabase, type PasswordReason } from '@/lib/supabase'
import { claimCache } from '@/lib/queryPersist'

interface AuthState {
  session: Session | null
  loading: boolean
  /** Set after following an invite or password-reset link, until the user picks a password. */
  needsPassword: PasswordReason | null
  passwordSet: () => void
}

const AuthContext = createContext<AuthState>({ session: null, loading: true, needsPassword: null, passwordSet: () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsPassword, setNeedsPassword] = useState<PasswordReason | null>(pendingPasswordReason)
  const queryClient = useQueryClient()

  const require = useCallback((reason: PasswordReason | null) => {
    setPendingPasswordReason(reason)
    setNeedsPassword(reason)
  }, [])

  useEffect(() => {
    // Signing out, or a different user signing in on this browser (an invite link opened on a shared phone), must
    // not show the previous user's cached data.
    const apply = (next: Session | null) => {
      if (claimCache(next?.user.id ?? null)) queryClient.clear()
      setSession(next)
      setLoading(false)
    }
    supabase.auth.getSession().then(({ data }) => {
      const current = data.session ?? offlineSession()
      if (!current) require(null)
      apply(current)
    })
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') require('recovery')
      if (event === 'SIGNED_OUT') require(null)
      apply(event === 'SIGNED_OUT' ? null : (session ?? offlineSession()))
    })
    return () => data.subscription.unsubscribe()
  }, [queryClient, require])

  const value = useMemo(() => ({ session, loading, needsPassword, passwordSet: () => require(null) }), [session, loading, needsPassword, require])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
