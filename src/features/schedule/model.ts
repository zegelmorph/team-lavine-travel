import { addDaysISO, eachDayISO, minutesOf } from '@/lib/dates'
import {
  TRANSPORT_MODE_LABELS,
  type Destination,
  type EventKind,
  type Lodging,
  type Transport,
  type TransportMode,
  type TripEvent,
} from '@/lib/types'
import { googleMapsEmbedUrl, googleMapsUrl } from '@/lib/mapLinks'

export type ItemKind = 'destination' | 'lodging' | 'checkin' | 'checkout' | 'transport' | 'event'

export interface ScheduleItem {
  /** Unique within the schedule (one source row can produce several items). */
  key: string
  kind: ItemKind
  /** Id of the row this came from: destination, lodging, transport or event. */
  sourceId: string
  mode?: TransportMode
  eventKind?: EventKind
  /** An event that isn't booked yet. Undated ones aren't on the schedule at all. */
  tentative?: boolean
  /** Google Maps link for an event's location. */
  mapUrl?: string
  date: string
  title: string
  subtitle?: string
  /** Minutes since midnight; absent for all-day items. */
  start?: number
  end?: number
}

export interface PlacedItem extends ScheduleItem {
  start: number
  end: number
  /** Column within its overlap group, and how many columns that group needs. */
  lane: number
  lanes: number
}

export interface ScheduleDay {
  date: string
  allDay: ScheduleItem[]
  timed: PlacedItem[]
}

export interface ScheduleInput {
  destinations: Destination[]
  lodging: Lodging[]
  transport: Transport[]
  events: TripEvent[]
}

/** Blocks shorter than this are drawn at this height so they stay readable and clickable. */
export const MIN_BLOCK_MINUTES = 30
const STAY_TIME_MINUTES = 60
const DEFAULT_MINUTES = 60
const DAY_END = 24 * 60

/** Every day touched by anything on the trip, first to last. */
export function scheduleDays(input: ScheduleInput): string[] {
  const dates: string[] = []
  for (const d of input.destinations) {
    if (d.start_date) dates.push(d.start_date)
    if (d.end_date) dates.push(d.end_date)
  }
  for (const l of input.lodging) dates.push(l.check_in, l.check_out)
  for (const t of input.transport) {
    if (t.depart_date) dates.push(t.depart_date)
    if (t.arrive_date) dates.push(t.arrive_date)
  }
  for (const e of input.events) if (e.date) dates.push(e.date)
  if (dates.length === 0) return []
  dates.sort()
  return eachDayISO(dates[0], dates[dates.length - 1])
}

/**
 * Embed and link for an event's place, or null when it has none. A typed name is searched near that day's
 * destination; with no destination to anchor it ("Home", "TBD"), it gets no map rather than a wrong pin.
 */
export function eventMap(
  e: Pick<TripEvent, 'date' | 'location' | 'address' | 'place_id' | 'lat' | 'lng' | 'google_maps_url'>,
  destinations: Destination[],
): { embed: string; link: string | null } | null {
  const lookedUp = Boolean(e.address || e.lat != null)
  if (!e.location?.trim() && !lookedUp) return null
  const day = e.date
  const near = day ? destinations.find((d) => d.start_date && d.start_date <= day && (d.end_date ?? d.start_date) >= day) : undefined
  const town = near?.name ?? (destinations.length === 1 ? destinations[0].name : undefined)
  if (!lookedUp && !town) return null
  const place = { name: e.location ?? '', address: e.address, lat: e.lat, lng: e.lng }
  return {
    embed: googleMapsEmbedUrl(place, town),
    link: googleMapsUrl({ ...place, address: e.address || town, google_maps_url: e.google_maps_url, place_id: e.place_id }),
  }
}

function transportTitle(t: Transport): string {
  const name = [t.carrier, t.number].filter(Boolean).join(' ') || TRANSPORT_MODE_LABELS[t.mode]
  const from = t.depart_location
  const to = t.arrive_location
  const route = from && to ? `${from} → ${to}` : from ? `from ${from}` : to ? `to ${to}` : ''
  return route ? `${name} · ${route}` : name
}

function block(start: number, end?: number): { start: number; end: number } {
  const e = end != null && end > start ? end : start + DEFAULT_MINUTES
  return { start, end: Math.min(DAY_END, e) }
}

/** Flattens the trip into dated items: all-day bars and timed blocks. */
export function scheduleItems(input: ScheduleInput): ScheduleItem[] {
  const items: ScheduleItem[] = []

  for (const d of input.destinations) {
    for (const date of eachDayISO(d.start_date, d.end_date)) {
      items.push({ key: `dest-${d.id}-${date}`, kind: 'destination', sourceId: d.id, date, title: d.name })
    }
  }

  for (const l of input.lodging) {
    // One bar per night, from check-in up to (not including) check-out.
    for (let date = l.check_in; date < l.check_out; date = addDaysISO(date, 1)) {
      items.push({
        key: `stay-${l.id}-${date}`,
        kind: 'lodging',
        sourceId: l.id,
        date,
        title: l.name,
        subtitle: date === l.check_in ? 'Check in' : undefined,
      })
    }
    if (l.check_in_time) {
      items.push({
        key: `in-${l.id}`,
        kind: 'checkin',
        sourceId: l.id,
        date: l.check_in,
        title: `Check in · ${l.name}`,
        ...block(minutesOf(l.check_in_time), minutesOf(l.check_in_time) + STAY_TIME_MINUTES),
      })
    }
    items.push({
      key: `out-${l.id}`,
      kind: 'checkout',
      sourceId: l.id,
      date: l.check_out,
      title: `Check out · ${l.name}`,
      ...(l.check_out_time ? block(minutesOf(l.check_out_time), minutesOf(l.check_out_time) + STAY_TIME_MINUTES) : {}),
    })
  }

  for (const t of input.transport) {
    const dep = { date: t.depart_date, time: t.depart_date ? t.depart_time : null }
    const arr = { date: t.arrive_date, time: t.arrive_date ? t.arrive_time : null }
    const title = transportTitle(t)
    if (dep.date && arr.date && dep.date === arr.date && dep.time && arr.time) {
      items.push({
        key: `tr-${t.id}`,
        kind: 'transport',
        mode: t.mode,
        sourceId: t.id,
        date: dep.date,
        title,
        ...block(minutesOf(dep.time), minutesOf(arr.time)),
      })
      continue
    }
    if (dep.date) {
      items.push({
        key: `tr-${t.id}-dep`,
        kind: 'transport',
        mode: t.mode,
        sourceId: t.id,
        date: dep.date,
        title,
        subtitle: arr.date && arr.date !== dep.date ? 'Departs' : undefined,
        ...(dep.time ? block(minutesOf(dep.time)) : {}),
      })
    }
    if (arr.date && arr.date !== dep.date) {
      items.push({
        key: `tr-${t.id}-arr`,
        kind: 'transport',
        mode: t.mode,
        sourceId: t.id,
        date: arr.date,
        title,
        subtitle: 'Arrives',
        ...(arr.time ? block(Math.max(0, minutesOf(arr.time) - MIN_BLOCK_MINUTES), minutesOf(arr.time)) : {}),
      })
    }
  }

  for (const e of input.events) {
    if (!e.date) continue
    items.push({
      key: `ev-${e.id}`,
      kind: 'event',
      sourceId: e.id,
      eventKind: e.kind,
      tentative: !e.booked,
      mapUrl: eventMap(e, input.destinations)?.link ?? undefined,
      date: e.date,
      title: e.title,
      subtitle: e.location ?? undefined,
      ...(e.start_time ? block(minutesOf(e.start_time), e.end_time ? minutesOf(e.end_time) : undefined) : {}),
    })
  }

  return items
}

/**
 * Side-by-side columns for overlapping timed items, like a calendar's day view. Items that overlap (directly or
 * through a chain) form a group; each gets the first free lane, and the whole group shares the lane count.
 */
export function layoutTimed(items: ScheduleItem[]): PlacedItem[] {
  const sorted = items
    .filter((i): i is ScheduleItem & { start: number; end: number } => i.start != null && i.end != null)
    .map((i) => ({ ...i, end: Math.max(i.end, i.start + MIN_BLOCK_MINUTES) }))
    .sort((a, b) => a.start - b.start || b.end - a.end)

  const placed: PlacedItem[] = []
  let group: PlacedItem[] = []
  let laneEnds: number[] = []
  let groupEnd = -1

  const closeGroup = () => {
    for (const p of group) p.lanes = laneEnds.length
    group = []
    laneEnds = []
  }

  for (const item of sorted) {
    if (item.start >= groupEnd) closeGroup()
    let lane = laneEnds.findIndex((end) => end <= item.start)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = item.end
    const p: PlacedItem = { ...item, lane, lanes: 1 }
    group.push(p)
    placed.push(p)
    groupEnd = Math.max(groupEnd, item.end)
  }
  closeGroup()
  return placed
}

/** Lodging and destination bars first, then the rest by title, so the all-day lane reads consistently. Travel legs keep trip order. */
const ALL_DAY_ORDER: Record<ItemKind, number> = {
  destination: 0,
  lodging: 1,
  checkout: 2,
  checkin: 3,
  transport: 4,
  event: 5,
}

export function buildSchedule(input: ScheduleInput): ScheduleDay[] {
  const items = scheduleItems(input)
  return scheduleDays(input).map((date) => {
    const today = items.filter((i) => i.date === date)
    return {
      date,
      allDay: today
        .filter((i) => i.start == null)
        .sort((a, b) => ALL_DAY_ORDER[a.kind] - ALL_DAY_ORDER[b.kind] || (a.kind === 'transport' ? 0 : a.title.localeCompare(b.title))),
      timed: layoutTimed(today),
    }
  })
}

/** `HH:mm` for minutes since midnight; the end of the day is written as 23:59. */
export function clockTime(minutes: number): string {
  if (minutes >= DAY_END) return '23:59'
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export const SNAP_MINUTES = 15

/** Where a block `length` minutes long lands when dropped at `minutes`: snapped, and kept within the day. */
export function dropStart(minutes: number, length: number): number {
  return Math.max(0, Math.min(DAY_END - length, Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES))
}

/** 23:59 is how the end of the day is stored, so it counts as midnight. */
function endMinutes(time: string): number {
  const m = minutesOf(time)
  return m >= DAY_END - 1 ? DAY_END : m
}

/**
 * New times for an event dragged to start at `start`. It keeps its length and is pulled earlier if it would run past
 * midnight. An event with no end (or one that ends before it starts) keeps no end.
 */
export function movedTimes(e: Pick<TripEvent, 'start_time' | 'end_time'>, start: number): { start_time: string; end_time: string | null } {
  const from = e.start_time ? minutesOf(e.start_time) : 0
  const length = e.end_time && endMinutes(e.end_time) >= from ? endMinutes(e.end_time) - from : null
  const begin = Math.max(0, Math.min(start, DAY_END - (length ?? 0)))
  return { start_time: clockTime(begin), end_time: length == null ? null : clockTime(begin + length) }
}

/** Minutes from start to end, or null when either is missing or the end isn't after the start. */
export function spanMinutes(start: string | null, end: string | null): number | null {
  if (!start || !end) return null
  const span = endMinutes(end) - minutesOf(start)
  return span > 0 ? span : null
}

/** A show's run time: the adjusted value if there is one, otherwise its start-end span. */
export function runTime(e: Pick<TripEvent, 'start_time' | 'end_time' | 'run_time_minutes'>): number | null {
  return e.run_time_minutes ?? spanMinutes(e.start_time, e.end_time)
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return [h && `${h} hr`, m && `${m} min`].filter(Boolean).join(' ')
}

const HOURS_MINUTES = /^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*(?:m(?:ins?|inutes?)?)?)?$/

/** What to store for a run time: nothing when it matches the span, so it keeps following the times. */
export function runTimeToSave(own: number | null, span: number | null): number | null {
  return own === span ? null : own
}

/** Reads "2:30", "2h 30m", "2 hr 30 min", "2.5h" or plain minutes like "150". Null if unreadable or out of range. */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase()
  let minutes: number | null = null
  const clock = /^(\d+):([0-5]\d)$/.exec(t)
  const parts = HOURS_MINUTES.exec(t)
  if (clock) minutes = Number(clock[1]) * 60 + Number(clock[2])
  else if (/^\d+$/.test(t)) minutes = Number(t)
  else if (parts && (parts[1] || parts[2])) minutes = Math.round(Number(parts[1] ?? 0) * 60) + Number(parts[2] ?? 0)
  return minutes != null && minutes >= 1 && minutes <= DAY_END ? minutes : null
}

/** Earliest hour worth scrolling to: the first timed item across the trip, capped to a sensible morning. */
export function firstHour(days: ScheduleDay[]): number {
  const starts = days.flatMap((d) => d.timed.map((t) => t.start))
  if (starts.length === 0) return 8
  return Math.max(0, Math.min(8, Math.floor(Math.min(...starts) / 60)))
}
