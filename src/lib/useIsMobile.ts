import { useSyncExternalStore } from 'react'

/** Must match Tailwind's `md` breakpoint, which the `max-md:` / `md:` classes use. */
const media = window.matchMedia('(width < 48rem)')

function subscribe(listener: () => void) {
  media.addEventListener('change', listener)
  return () => media.removeEventListener('change', listener)
}

/** True below the `md` breakpoint, for layouts that render different components rather than just restyling. */
export function useIsMobile() {
  return useSyncExternalStore(subscribe, () => media.matches)
}
