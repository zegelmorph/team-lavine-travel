/** Link that opens a place in Google Maps: the stored Maps URL, else a search by name/address (and place id). */
export function googleMapsUrl(p: {
  google_maps_url?: string | null
  name?: string | null
  address?: string | null
  place_id?: string | null
  lat?: number | null
  lng?: number | null
}): string | null {
  if (p.google_maps_url) return p.google_maps_url
  const query = [p.name, p.address].filter(Boolean).join(', ') || (p.lat != null ? `${p.lat},${p.lng}` : '')
  if (!query) return null
  const params = new URLSearchParams({ api: '1', query })
  if (p.place_id) params.set('query_place_id', p.place_id)
  return `https://www.google.com/maps/search/?${params}`
}

/**
 * Keyless embeddable map for an iframe. Searches by name plus address (or the destination, so a bare hotel name
 * resolves to the right town); coordinates alone are a last resort since they drop the place label.
 */
export function googleMapsEmbedUrl(
  p: { name: string; address?: string | null; lat?: number | null; lng?: number | null },
  near?: string,
  /** 15 frames a building; ~11 a whole town. */
  zoom = 15,
): string {
  const query = [p.name, p.address || near].filter(Boolean).join(', ') || `${p.lat},${p.lng}`
  return `https://www.google.com/maps?${new URLSearchParams({ q: query, z: String(zoom), output: 'embed' })}`
}
