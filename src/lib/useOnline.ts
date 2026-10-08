import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** False while the device reports no connection; the app then shows its saved copy read-only. */
export function useOnline() {
  return useSyncExternalStore(subscribe, () => navigator.onLine)
}

export function offlineError() {
  return new Error("You're offline. Changes can be made once you're back online.")
}
