import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './features/auth/AuthProvider'
import { LoginPage } from './features/auth/LoginPage'
import { SetPasswordPage } from './features/auth/SetPasswordPage'
import { HouseholdProvider } from './features/auth/HouseholdProvider'
import { SettingsPage } from './features/auth/SettingsPage'
import { AppLayout } from './components/AppLayout'
import { ConfirmHost } from './components/ui/confirm'
import { TripsPage } from './features/trips/TripsPage'
import { TripPage } from './features/trips/TripPage'
import { supabaseConfigured } from './lib/supabase'

export function App() {
  const { session, loading, needsPassword } = useAuth()

  if (!supabaseConfigured) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-slate-600">
        Supabase is not configured. Copy <code className="mx-1">.env.example</code> to{' '}
        <code className="mx-1">.env.local</code> and fill in the project URL and publishable key.
      </div>
    )
  }
  if (loading) return null
  if (!session) {
    return (
      <>
        <Navigate to="/" replace />
        <LoginPage />
      </>
    )
  }
  if (needsPassword) return <SetPasswordPage />

  return (
    <>
      <HouseholdProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<TripsPage />} />
            <Route path="trips/:tripId" element={<TripPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HouseholdProvider>
      <ConfirmHost />
    </>
  )
}
