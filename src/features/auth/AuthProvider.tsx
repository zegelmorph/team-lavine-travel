import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { pendingPasswordReason, setPendingPasswordReason, supabase, type PasswordReason } from '@/lib/supabase'

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
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) require(null)
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') require('recovery')
      if (event === 'SIGNED_OUT') {
        // The next person to sign in on this browser must not see the previous user's cached data.
        queryClient.clear()
        require(null)
      }
      setSession(session)
      setLoading(false)
    })
    return () => data.subscription.unsubscribe()
  }, [queryClient, require])

  const value = useMemo(
    () => ({ session, loading, needsPassword, passwordSet: () => require(null) }),
    [session, loading, needsPassword, require],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
