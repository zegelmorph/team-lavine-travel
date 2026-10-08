import { useSyncExternalStore } from 'react'
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
  type LucideIcon,
} from 'lucide-react'

/** WMO weather interpretation codes, as returned by Open-Meteo. */
export function describeWeather(code: number | null): { label: string; icon: LucideIcon } {
  if (code == null) return { label: 'Unknown', icon: Cloud }
  if (code === 0) return { label: 'Clear', icon: Sun }
  if (code <= 2) return { label: 'Partly cloudy', icon: CloudSun }
  if (code === 3) return { label: 'Cloudy', icon: Cloud }
  if (code <= 48) return { label: 'Fog', icon: CloudFog }
  if (code <= 57) return { label: 'Drizzle', icon: CloudDrizzle }
  if (code <= 67) return { label: 'Rain', icon: CloudRain }
  if (code <= 77) return { label: 'Snow', icon: CloudSnow }
  if (code <= 82) return { label: 'Showers', icon: CloudRain }
  if (code <= 86) return { label: 'Snow showers', icon: CloudSnow }
  return { label: 'Thunderstorm', icon: CloudLightning }
}

export type TempUnit = 'F' | 'C'

const KEY = 'travel:temp-unit'
const listeners = new Set<() => void>()

function readUnit(): TempUnit {
  try {
    return localStorage.getItem(KEY) === 'C' ? 'C' : 'F'
  } catch {
    return 'F'
  }
}

export function setTempUnit(unit: TempUnit) {
  try {
    localStorage.setItem(KEY, unit)
  } catch {
    // Storage blocked; the choice just isn't remembered.
  }
  listeners.forEach((l) => l())
}

export function useTempUnit(): TempUnit {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    readUnit,
  )
}

/** Weather is stored in Celsius; "72°" or "22°". */
export function formatTemp(celsius: number | null, unit: TempUnit): string {
  if (celsius == null) return '–'
  const value = unit === 'F' ? (celsius * 9) / 5 + 32 : celsius
  return `${Math.round(value)}°`
}
