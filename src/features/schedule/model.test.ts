import { describe, expect, it } from 'vitest'
import { buildSchedule, eventMap, layoutTimed, scheduleDays, scheduleItems, type ScheduleInput, type ScheduleItem } from './model'
import type { Destination, Lodging, Transport, TripEvent } from '@/lib/types'

const dest = (over: Partial<Destination>): Destination => ({
  id: 'd1',
  trip_id: 't',
  name: 'Paris',
  address: null,
  place_id: null,
  lat: null,
  lng: null,
  timezone: null,
  start_date: null,
  end_date: null,
  sort_order: 0,
  notes: null,
  weather_refreshed_at: null,
  ...over,
})

const stay = (over: Partial<Lodging>): Lodging => ({
  id: 'l1',
  trip_id: 't',
  destination_id: null,
  name: 'Hotel',
  address: null,
  place_id: null,
  lat: null,
  lng: null,
  phone: null,
  website: null,
  google_maps_url: null,
  rating: null,
  check_in: '2026-10-10',
  check_out: '2026-10-12',
  check_in_time: null,
  check_out_time: null,
  confirmation: null,
  notes: null,
  ...over,
})

const leg = (over: Partial<Transport>): Transport => ({
  id: 'tr1',
  trip_id: 't',
  mode: 'plane',
  carrier: 'AA',
  number: '100',
  confirmation: null,
  depart_location: 'SEA',
  depart_place_id: null,
  depart_date: null,
  depart_time: null,
  depart_tz: null,
  arrive_location: 'CDG',
  arrive_place_id: null,
  arrive_date: null,
  arrive_time: null,
  arrive_tz: null,
  notes: null,
  ...over,
})

const event = (over: Partial<TripEvent>): TripEvent => ({
  id: 'e1',
  trip_id: 't',
  date: '2026-10-10',
  start_time: null,
  end_time: null,
  kind: 'museum',
  title: 'Louvre',
  location: null,
  address: null,
  place_id: null,
  lat: null,
  lng: null,
  google_maps_url: null,
  notes: null,
  ...over,
})

const empty: ScheduleInput = { destinations: [], lodging: [], transport: [], events: [] }

describe('scheduleDays', () => {
  it('spans everything on the trip', () => {
    const days = scheduleDays({
      ...empty,
      destinations: [dest({ start_date: '2026-10-10', end_date: '2026-10-12' })],
      transport: [leg({ depart_date: '2026-10-09', arrive_date: '2026-10-10' })],
      events: [event({ date: '2026-10-13' })],
    })
    expect(days).toEqual(['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'])
  })

  it('is empty for an undated trip', () => {
    expect(scheduleDays({ ...empty, destinations: [dest({})] })).toEqual([])
  })
})

describe('scheduleItems', () => {
  it('shows a lodging bar per night and a check-out marker', () => {
    const items = scheduleItems({ ...empty, lodging: [stay({})] })
    const nights = items.filter((i) => i.kind === 'lodging').map((i) => i.date)
    expect(nights).toEqual(['2026-10-10', '2026-10-11'])
    const out = items.find((i) => i.kind === 'checkout')!
    expect(out.date).toBe('2026-10-12')
    expect(out.start).toBeUndefined()
  })

  it('times check-in and check-out when given', () => {
    const items = scheduleItems({ ...empty, lodging: [stay({ check_in_time: '15:00:00', check_out_time: '11:00:00' })] })
    expect(items.find((i) => i.kind === 'checkin')).toMatchObject({ date: '2026-10-10', start: 900, end: 960 })
    expect(items.find((i) => i.kind === 'checkout')).toMatchObject({ date: '2026-10-12', start: 660, end: 720 })
  })

  it('draws a same-day leg as one block from departure to arrival', () => {
    const [item] = scheduleItems({
      ...empty,
      transport: [
        leg({ depart_date: '2026-10-10', depart_time: '08:15:00', arrive_date: '2026-10-10', arrive_time: '10:45:00' }),
      ],
    })
    expect(item).toMatchObject({ date: '2026-10-10', start: 495, end: 645, title: 'AA 100 · SEA → CDG' })
  })

  it('splits an overnight leg into departure and arrival', () => {
    const items = scheduleItems({
      ...empty,
      transport: [
        leg({ depart_date: '2026-10-09', depart_time: '18:00:00', arrive_date: '2026-10-10', arrive_time: '11:00:00' }),
      ],
    })
    expect(items.map((i) => [i.date, i.subtitle, i.start, i.end])).toEqual([
      ['2026-10-09', 'Departs', 1080, 1140],
      ['2026-10-10', 'Arrives', 630, 660],
    ])
  })

  it('keeps an untimed leg all day', () => {
    const items = scheduleItems({
      ...empty,
      transport: [leg({ depart_date: '2026-10-10', arrive_date: '2026-10-10' })],
    })
    expect(items).toHaveLength(1)
    expect(items[0].start).toBeUndefined()
  })

  it('times only the end that has a time', () => {
    const items = scheduleItems({
      ...empty,
      transport: [leg({ depart_date: '2026-10-09', depart_time: '18:00:00', arrive_date: '2026-10-10' })],
    })
    expect(items.map((i) => [i.date, i.start])).toEqual([
      ['2026-10-09', 1080],
      ['2026-10-10', undefined],
    ])
  })

  it('gives events without an end an hour', () => {
    const [item] = scheduleItems({ ...empty, events: [event({ start_time: '13:30:00' })] })
    expect(item).toMatchObject({ start: 810, end: 870 })
  })
})

describe('layoutTimed', () => {
  const t = (key: string, start: number, end: number): ScheduleItem => ({
    key,
    kind: 'event',
    sourceId: key,
    date: '2026-10-10',
    title: key,
    start,
    end,
  })

  it('places overlapping items side by side and lone items full width', () => {
    const placed = layoutTimed([t('a', 540, 660), t('b', 600, 720), t('c', 780, 840), t('d', 630, 650)])
    const byKey = Object.fromEntries(placed.map((p) => [p.key, [p.lane, p.lanes]]))
    expect(byKey).toEqual({ a: [0, 3], b: [1, 3], d: [2, 3], c: [0, 1] })
  })

  it('reuses a lane once it frees up within a group', () => {
    const placed = layoutTimed([t('a', 540, 600), t('b', 550, 700), t('c', 600, 660)])
    const byKey = Object.fromEntries(placed.map((p) => [p.key, [p.lane, p.lanes]]))
    expect(byKey).toEqual({ a: [0, 2], b: [1, 2], c: [0, 2] })
  })
})

describe('event maps', () => {
  it('searches a typed location near that day’s destination, and skips events without one', () => {
    const items = scheduleItems({
      ...empty,
      destinations: [dest({ start_date: '2026-10-09', end_date: '2026-10-11' })],
      events: [event({ id: 'a', location: 'Le Jules Verne' }), event({ id: 'b' })],
    })
    const link = items.find((i) => i.sourceId === 'a')!.mapUrl!
    expect(new URL(link).searchParams.get('query')).toBe('Le Jules Verne, Paris')
    expect(items.find((i) => i.sourceId === 'b')!.mapUrl).toBeUndefined()
  })

  it('maps a typed location only when a destination anchors it', () => {
    expect(eventMap(event({ location: 'Home' }), [])).toBeNull()
    const picked = eventMap(event({ location: 'Louvre', address: 'Rue de Rivoli, Paris' }), [])!
    expect(new URL(picked.embed).searchParams.get('q')).toBe('Louvre, Rue de Rivoli, Paris')
  })
})

describe('buildSchedule', () => {
  it('orders all-day items destination, lodging, then the rest', () => {
    const [day] = buildSchedule({
      destinations: [dest({ start_date: '2026-10-10', end_date: '2026-10-10' })],
      lodging: [stay({ check_in: '2026-10-10', check_out: '2026-10-11' })],
      transport: [],
      events: [event({})],
    })
    expect(day.allDay.map((i) => i.kind)).toEqual(['destination', 'lodging', 'event'])
  })
})
