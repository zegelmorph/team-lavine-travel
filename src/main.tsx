import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MutationCache, QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import { App } from './App'
import { AuthProvider } from './features/auth/AuthProvider'
import { useTheme } from './lib/theme'
import { registerServiceWorker } from './lib/pwa'
import { PERSIST_BUSTER, PERSIST_MAX_AGE, queryPersister, shouldPersistQuery } from './lib/queryPersist'
import { offlineError } from './lib/useOnline'
import './index.css'

registerServiceWorker()

const queryClient = new QueryClient({
  // Runs before each mutation's own onMutate, so an offline edit fails before any optimistic change is applied
  // (and every caller's onError toast explains why) instead of queuing until a signal returns.
  mutationCache: new MutationCache({
    onMutate: () => {
      if (!navigator.onLine) throw offlineError()
    },
  }),
  defaultOptions: {
    // Keep unwatched queries (prefetched trips) for the saved copy. Not PERSIST_MAX_AGE: timers over ~24.8 days
    // overflow setTimeout and fire at once, which would drop them immediately.
    queries: { staleTime: 30_000, gcTime: Infinity, refetchOnWindowFocus: false, retry: 1 },
    mutations: { networkMode: 'always' },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: PERSIST_MAX_AGE,
        buster: PERSIST_BUSTER,
        dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
      }}
    >
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
        <ThemedToaster />
      </AuthProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
)

function ThemedToaster() {
  const { theme } = useTheme()
  return (
    <Toaster
      position="bottom-right"
      theme={theme}
      toastOptions={{
        classNames: {
          toast: '!rounded-xl !border-slate-200/80 !bg-white !text-slate-800 !shadow-pop !font-sans',
          success: '[&_[data-icon]]:!text-brand-600',
          error: '[&_[data-icon]]:!text-red-600',
        },
      }}
    />
  )
}
