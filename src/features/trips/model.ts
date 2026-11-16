import { differenceInCalendarDays } from 'date-fns'
import { parseDay } from '@/lib/dates'
import type { HouseholdRole, Participant, TripRole, TripStatus, TripSummary } from '@/lib/types'

/**
 * `manage` is the trip's owner or an admin: everything, including who is on the trip and deleting it. `edit` is a
 * traveller made an editor: the trip's contents, but not its travellers, its owner or deleting it. `view` is any
 * other traveller: they see all of it and can only tick packing items and to-dos.
 */
export type TripAccess = 'manage' | 'edit' | 'view'

/**
 * What the signed-in user can do with a trip they can see. `tripRole` is their own role on it as a traveller, if
 * they are one. Mirrors `travel_can_manage_trip` and `travel_can_edit_trip` in the database, which are what actually
 * enforce it; this only decides which controls to show.
 */
export function tripAccess(
  trip: { owner_id: string | null },
  role: HouseholdRole,
  userId: string | undefined,
  tripRole: TripRole | null,
): TripAccess {
  if (role === 'admin' || (userId !== undefined && trip.owner_id === userId)) return 'manage'
  return tripRole === 'editor' ? 'edit' : 'view'
}

/** The signed-in user's role on a trip, read off its travellers; null when they aren't one of them. */
export function myTripRole(participants: Pick<Participant, 'role' | 'person'>[], userId: string | undefined): TripRole | null {
  if (userId === undefined) return null
  return participants.find((p) => p.person.user_id === userId)?.role ?? null
}

/** Order of the sections on the trips page: what's on now, then what's next, then ideas, then memories. */
export const STATUS_SECTIONS: TripStatus[] = ['happening', 'planning', 'dreaming', 'complete']

export function groupTrips(trips: TripSummary[]): { status: TripStatus; trips: TripSummary[] }[] {
  return STATUS_SECTIONS.map((status) => {
    const inStatus = trips.filter((t) => t.status === status)
    inStatus.sort((a, b) => {
      if (status === 'complete') return (b.end_date ?? '').localeCompare(a.end_date ?? '')
      if (status === 'dreaming') return b.created_at.localeCompare(a.created_at)
      return (a.start_date ?? '9999').localeCompare(b.start_date ?? '9999') || a.name.localeCompare(b.name)
    })
    return { status, trips: inStatus }
  }).filter((s) => s.trips.length > 0)
}

/** "Starts today", "In 12 days", "Day 3 of 7", "Ended 4 days ago"; null without dates. */
export function countdown(start: string | null, end: string | null, today: string): string | null {
  if (!start || !end) return null
  const t = parseDay(today)
  const untilStart = differenceInCalendarDays(parseDay(start), t)
  if (untilStart > 1) return `In ${untilStart} days`
  if (untilStart === 1) return 'Tomorrow'
  if (untilStart === 0) return 'Starts today'
  const sinceEnd = differenceInCalendarDays(t, parseDay(end))
  if (sinceEnd > 0) return sinceEnd === 1 ? 'Ended yesterday' : `Ended ${sinceEnd} days ago`
  const total = differenceInCalendarDays(parseDay(end), parseDay(start)) + 1
  return `Day ${-untilStart + 1} of ${total}`
}

/** Trips worth a sidebar shortcut: anything happening or being planned, soonest first. */
export function activeTrips(trips: TripSummary[]): TripSummary[] {
  return groupTrips(trips)
    .filter((s) => s.status === 'happening' || s.status === 'planning')
    .flatMap((s) => s.trips)
}
