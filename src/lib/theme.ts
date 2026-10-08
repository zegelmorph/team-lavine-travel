import { useSyncExternalStore } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

/** Must match the inline script in index.html, which applies the theme before first paint. */
const KEY = 'theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

/** Storage can throw when blocked by the browser; the theme then just isn't remembered. */
function readPref(): ThemePref {
  try {
    const stored = localStorage.getItem(KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

function writePref(next: ThemePref) {
  try {
    if (next === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, next)
  } catch {
    // Not persisted; still applies for this session.
  }
}

let pref = readPref()

const resolve = (): Theme => (pref === 'system' ? (media.matches ? 'dark' : 'light') : pref)

function apply() {
  const theme = resolve()
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
  listeners.forEach((l) => l())
}

media.addEventListener('change', () => pref === 'system' && apply())

// Keep other open tabs in step when the preference changes.
window.addEventListener('storage', (e) => {
  if (e.key !== KEY && e.key !== null) return
  pref = readPref()
  apply()
})

export function setThemePref(next: ThemePref) {
  pref = next
  writePref(next)
  apply()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useTheme() {
  const snapshot = useSyncExternalStore(subscribe, () => `${pref}:${resolve()}`)
  const [p, theme] = snapshot.split(':') as [ThemePref, Theme]
  return { pref: p, theme, setPref: setThemePref }
}
