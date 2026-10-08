import { invokeFunction } from './householdQueries'
import type { PlaceDetails } from './types'

export type PlaceKind = 'city' | 'lodging' | 'any'

export interface PlaceSuggestion {
  placeId: string
  primary: string
  secondary: string
}

/** Thrown when the travel-places function has no Google API key yet; callers fall back to typing details by hand. */
export class PlacesNotConfigured extends Error {}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  try {
    return await invokeFunction<T>('travel-places', body)
  } catch (e) {
    if (e instanceof Error && /not set up/i.test(e.message)) throw new PlacesNotConfigured(e.message)
    throw e
  }
}

export async function searchPlaces(input: string, kind: PlaceKind, sessionToken: string): Promise<PlaceSuggestion[]> {
  return (await call<{ suggestions: PlaceSuggestion[] }>({ action: 'autocomplete', input, kind, sessionToken })).suggestions
}

export async function placeDetails(placeId: string, sessionToken: string): Promise<PlaceDetails> {
  return (await call<{ place: PlaceDetails }>({ action: 'details', placeId, sessionToken })).place
}

/**
 * Free fallback when a destination was typed rather than picked: Open-Meteo's geocoder (no key), good enough for
 * weather. Resolves null when nothing matches.
 */
export async function geocodeCity(name: string): Promise<{ lat: number; lng: number; address: string } | null> {
  const query = name.split(',')[0].trim()
  if (!query) return null
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=${encodeURIComponent(query)}`)
    const body = (await res.json()) as {
      results?: { latitude: number; longitude: number; name: string; admin1?: string; country?: string }[]
    }
    const r = body.results?.[0]
    if (!r) return null
    return { lat: r.latitude, lng: r.longitude, address: [r.name, r.admin1, r.country].filter(Boolean).join(', ') }
  } catch {
    return null
  }
}
