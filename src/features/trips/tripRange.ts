import type { Destination } from '@/lib/types'

/** First and last day across a trip's dated destinations. */
export function tripRange(trip: { destinations: Pick<Destination, 'start_date' | 'end_date'>[] }): {
  start: string | null
  end: string | null
} {
  let start: string | null = null
  let end: string | null = null
  for (const d of trip.destinations) {
    if (d.start_date && (!start || d.start_date < start)) start = d.start_date
    if (d.end_date && (!end || d.end_date > end)) end = d.end_date
  }
  return { start, end }
}
