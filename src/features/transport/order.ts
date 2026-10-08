import type { Transport } from '@/lib/types'

type Leg = Pick<Transport, 'depart_date' | 'depart_time' | 'arrive_date' | 'arrive_time' | 'created_at'>

const day = (l: Leg) => l.depart_date ?? l.arrive_date
const time = (l: Leg) => (l.depart_date ? l.depart_time : l.arrive_time)

/**
 * Day by day. Legs without a time can't be placed against timed ones, so each day keeps the order legs were added in
 * and the timed legs are rearranged by time among the positions they hold.
 */
export function orderLegs<T extends Leg>(legs: T[]): T[] {
  const added = [...legs].sort((a, b) => (day(a) ?? '9999').localeCompare(day(b) ?? '9999') || a.created_at.localeCompare(b.created_at))
  const out: T[] = []
  for (let i = 0; i < added.length;) {
    let end = i
    while (end < added.length && day(added[end]) === day(added[i])) end++
    const legsOnDay = added.slice(i, end)
    const timed = legsOnDay.filter(time).sort((a, b) => time(a)!.localeCompare(time(b)!))
    out.push(...legsOnDay.map((l) => (time(l) ? timed.shift()! : l)))
    i = end
  }
  return out
}
