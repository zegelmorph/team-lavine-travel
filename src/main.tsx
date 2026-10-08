import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import { App } from './App'
import { AuthProvider } from './features/auth/AuthProvider'
import { useTheme } from './lib/theme'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
        <ThemedToaster />
      </AuthProvider>
    </QueryClientProvider>
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
