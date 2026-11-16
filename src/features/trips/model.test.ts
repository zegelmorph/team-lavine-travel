import { describe, expect, it } from 'vitest'
import { activeTrips, countdown, groupTrips, myTripRole, tripAccess } from './model'
import type { TripStatus, TripSummary } from '@/lib/types'

function trip(name: string, status: TripStatus, start: string | null = null, end: string | null = null): TripSummary {
  return {
    id: name,
    household_id: 'h',
    name,
    status,
    status_auto: true,
    notes: null,
    owner_id: null,
    created_at: `2026-01-01T00:00:0${name.length % 10}Z`,
    updated_at: '2026-01-01T00:00:00Z',
    start_date: start,
    end_date: end,
    destinations: [],
    destination_ids: [],
    participant_count: 0,
    participants: [],
    my_role: null,
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

describe('tripAccess', () => {
  it('lets admins manage every trip', () => {
    expect(tripAccess({ owner_id: 'someone-else' }, 'admin', 'me', null)).toBe('manage')
    expect(tripAccess({ owner_id: null }, 'admin', 'me', null)).toBe('manage')
  })
  it('lets users manage only the trips they own', () => {
    expect(tripAccess({ owner_id: 'me' }, 'user', 'me', null)).toBe('manage')
    expect(tripAccess({ owner_id: 'someone-else' }, 'user', 'me', null)).toBe('view')
  })
  it('leaves a trip without an owner to the admins', () => {
    expect(tripAccess({ owner_id: null }, 'user', 'me', null)).toBe('view')
    expect(tripAccess({ owner_id: null }, 'user', undefined, null)).toBe('view')
  })
  it('lets an editor edit, and leaves a viewer viewing', () => {
    expect(tripAccess({ owner_id: 'someone-else' }, 'user', 'me', 'editor')).toBe('edit')
    expect(tripAccess({ owner_id: null }, 'user', 'me', 'editor')).toBe('edit')
    expect(tripAccess({ owner_id: 'someone-else' }, 'user', 'me', 'viewer')).toBe('view')
  })
  it('keeps managing above a role on the trip', () => {
    expect(tripAccess({ owner_id: 'me' }, 'user', 'me', 'viewer')).toBe('manage')
    expect(tripAccess({ owner_id: 'someone-else' }, 'admin', 'me', 'viewer')).toBe('manage')
  })
})

describe('myTripRole', () => {
  const travellers = [
    { role: 'viewer' as const, person: { name: 'Kid', user_id: null } },
    { role: 'editor' as const, person: { name: 'Me', user_id: 'me' } },
    { role: 'viewer' as const, person: { name: 'Them', user_id: 'them' } },
  ]
  it('finds the signed-in user among the travellers', () => {
    expect(myTripRole(travellers, 'me')).toBe('editor')
    expect(myTripRole(travellers, 'them')).toBe('viewer')
  })
  it('is empty for someone who is not travelling', () => {
    expect(myTripRole(travellers, 'stranger')).toBeNull()
    expect(myTripRole([], 'me')).toBeNull()
  })
  it('never matches a traveller without an account when nobody is signed in', () => {
    expect(myTripRole(travellers, undefined)).toBeNull()
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
