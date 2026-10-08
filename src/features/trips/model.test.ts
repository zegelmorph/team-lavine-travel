import { describe, expect, it } from 'vitest'
import { activeTrips, countdown, groupTrips } from './model'
import type { TripStatus, TripSummary } from '@/lib/types'

function trip(name: string, status: TripStatus, start: string | null = null, end: string | null = null): TripSummary {
  return {
    id: name,
    household_id: 'h',
    name,
    status,
    status_auto: true,
    notes: null,
    created_at: `2026-01-01T00:00:0${name.length % 10}Z`,
    updated_at: '2026-01-01T00:00:00Z',
    start_date: start,
    end_date: end,
    destinations: [],
    participant_count: 0,
  }
}

describe('countdown', () => {
  const today = '2026-10-07'
  it('counts down to the start', () => {
    expect(countdown('2026-10-19', '2026-10-22', today)).toBe('In 12 days')
    expect(countdown('2026-10-08', '2026-10-09', today)).toBe('Tomorrow')
    expect(countdown('2026-10-07', '2026-10-09', today)).toBe('Starts today')
  })
  it('shows the day of the trip while it is on', () => {
    expect(countdown('2026-10-05', '2026-10-11', today)).toBe('Day 3 of 7')
    expect(countdown('2026-10-01', '2026-10-07', today)).toBe('Day 7 of 7')
  })
  it('says how long ago it ended', () => {
    expect(countdown('2026-10-01', '2026-10-06', today)).toBe('Ended yesterday')
    expect(countdown('2026-09-01', '2026-10-03', today)).toBe('Ended 4 days ago')
  })
  it('is empty without dates', () => {
    expect(countdown(null, '2026-10-03', today)).toBeNull()
  })
})

describe('groupTrips', () => {
  it('orders sections and sorts each one', () => {
    const groups = groupTrips([
      trip('Old', 'complete', '2025-01-01', '2025-01-05'),
      trip('Older', 'complete', '2024-01-01', '2024-01-05'),
      trip('Later', 'planning', '2027-03-01', '2027-03-05'),
      trip('Sooner', 'planning', '2026-12-01', '2026-12-05'),
      trip('Undated', 'planning'),
      trip('Now', 'happening', '2026-10-05', '2026-10-09'),
    ])
    expect(groups.map((g) => g.status)).toEqual(['happening', 'planning', 'complete'])
    expect(groups[1].trips.map((t) => t.name)).toEqual(['Sooner', 'Later', 'Undated'])
    expect(groups[2].trips.map((t) => t.name)).toEqual(['Old', 'Older'])
  })

  it('activeTrips keeps happening then planning', () => {
    const names = activeTrips([
      trip('Idea', 'dreaming'),
      trip('Plan', 'planning', '2026-12-01', '2026-12-02'),
      trip('Now', 'happening', '2026-10-05', '2026-10-09'),
    ]).map((t) => t.name)
    expect(names).toEqual(['Now', 'Plan'])
  })
})
