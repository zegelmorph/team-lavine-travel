import { addDays, differenceInCalendarDays, format, isValid, parse, parseISO } from 'date-fns'

// Trip dates are date-only `yyyy-MM-dd` strings and times are wall-clock `HH:mm[:ss]` strings. Parsing them with
// date-fns keeps them in local time; never pass them to `new Date()`, which reads date-only strings as UTC.

export const ISO_DAY = 'yyyy-MM-dd'

export function parseDay(day: string): Date {
  return parseISO(day)
}

export function todayISO(): string {
  return format(new Date(), ISO_DAY)
}

export function addDaysISO(day: string, n: number): string {
  return format(addDays(parseDay(day), n), ISO_DAY)
}

/** Inclusive list of days from `start` to `end`; empty when either is missing or end precedes start. */
export function eachDayISO(start: string | null, end: string | null, max = 120): string[] {
  if (!start || !end || end < start) return []
  const days: string[] = []
  for (let d = start; d <= end && days.length < max; d = addDaysISO(d, 1)) days.push(d)
  return days
}

export function nights(checkIn: string, checkOut: string): number {
  return differenceInCalendarDays(parseDay(checkOut), parseDay(checkIn))
}

/** "Oct 11", "Oct 11 – 15, 2026", "Oct 30 – Nov 2, 2026", "Dec 30, 2026 – Jan 2, 2027". */
export function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return 'No dates yet'
  if (!start || !end) return format(parseDay((start ?? end)!), 'MMM d, yyyy')
  const a = parseDay(start)
  const b = parseDay(end)
  if (start === end) return format(a, 'EEE, MMM d, yyyy')
  if (a.getFullYear() !== b.getFullYear()) return `${format(a, 'MMM d, yyyy')} – ${format(b, 'MMM d, yyyy')}`
  if (a.getMonth() !== b.getMonth()) return `${format(a, 'MMM d')} – ${format(b, 'MMM d, yyyy')}`
  return `${format(a, 'MMM d')} – ${format(b, 'd, yyyy')}`
}

export function formatDay(day: string, pattern = 'EEE, MMM d'): string {
  return format(parseDay(day), pattern)
}

/** "9:30 AM" from "09:30" or "09:30:00". */
export function formatTime(time: string | null): string {
  if (!time) return ''
  const t = parse(time.slice(0, 5), 'HH:mm', new Date())
  return isValid(t) ? format(t, 'h:mm a') : time
}

/** Minutes since midnight for "HH:mm[:ss]". */
export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** The browser's IANA time zone, e.g. "America/Los_Angeles". */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** "PDT", "CEST" etc. for a zone on a given day; falls back to the zone name. */
export function shortZone(tz: string | null, day?: string): string {
  if (!tz) return ''
  try {
    const at = day ? parseDay(day) : new Date()
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(at).find((p) => p.type === 'timeZoneName')
    return part?.value ?? tz
  } catch {
    return tz
  }
}
