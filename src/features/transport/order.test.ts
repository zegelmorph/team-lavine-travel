import { describe, expect, it } from 'vitest'
import { orderLegs } from './order'

const leg = (id: string, depart_date: string | null, depart_time: string | null, n: number, arrive?: { date: string; time?: string }) => ({
  id,
  depart_date,
  depart_time,
  arrive_date: arrive?.date ?? depart_date,
  arrive_time: arrive?.time ?? null,
  created_at: `2026-10-01T00:00:0${n}Z`,
})

const ids = (legs: { id: string }[]) => orderLegs(legs as ReturnType<typeof leg>[]).map((l) => l.id)

describe('orderLegs', () => {
  it('keeps untimed legs where they were added and sorts timed legs among their slots', () => {
    expect(
      ids([
        leg('late flight', '2026-10-30', '18:00:00', 1),
        leg('shuttle', '2026-10-30', null, 2),
        leg('early flight', '2026-10-30', '06:00:00', 3),
        leg('undated', null, null, 0),
        leg('day before', '2026-10-29', null, 4),
      ]),
    ).toEqual(['day before', 'early flight', 'shuttle', 'late flight', 'undated'])
  })

  it('sorts a day of only timed legs by time and keeps a day of untimed legs as added', () => {
    expect(
      ids([
        leg('b', '2026-10-30', '12:00:00', 1),
        leg('a', '2026-10-30', '08:00:00', 2),
        leg('second', '2026-10-31', null, 4),
        leg('first', '2026-10-31', null, 3),
      ]),
    ).toEqual(['a', 'b', 'first', 'second'])
  })

  it('places a leg with only an arrival on its arrival day', () => {
    expect(
      ids([
        leg('undated', null, null, 1),
        leg('arrival only', null, null, 2, { date: '2026-10-30', time: '09:00:00' }),
        leg('later', '2026-10-31', null, 0),
      ]),
    ).toEqual(['arrival only', 'later', 'undated'])
  })
})
