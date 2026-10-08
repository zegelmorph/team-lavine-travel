import { registerSW } from 'virtual:pwa-register'
import { toast } from 'sonner'

const UPDATE_CHECK_MS = 60 * 60 * 1000

/** Registers the service worker (app files for offline use) and offers a reload when a new version is ready. */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
  const update = registerSW({
    onNeedRefresh() {
      toast('A new version of Travel is ready', {
        duration: Infinity,
        action: { label: 'Reload', onClick: () => void update(true) },
      })
    },
    // A home-screen app can stay open for days without a page load, which is when the browser normally checks.
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => navigator.onLine && void registration.update(), UPDATE_CHECK_MS)
    },
  })
}
