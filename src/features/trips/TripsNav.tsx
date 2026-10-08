import { NavLink } from 'react-router-dom'
import { eyebrow } from '@/components/ui/card'
import { useTrips } from '@/lib/queries'
import { formatDateRange } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { activeTrips } from './model'

/** Sidebar shortcuts to trips that are happening or being planned. */
export function TripsNav() {
  const { data } = useTrips()
  const trips = activeTrips(data ?? [])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3">
      <div className={cn(eyebrow, 'px-2.5 pb-1.5')}>Upcoming</div>
      {trips.length === 0 ? (
        <p className="px-2.5 text-xs text-slate-400">No trips being planned.</p>
      ) : (
        <ul className="space-y-0.5">
          {trips.map((t) => (
            <li key={t.id}>
              <NavLink
                to={`/trips/${t.id}`}
                className={({ isActive }) =>
                  cn(
                    'block rounded-lg px-2.5 py-1.5 transition-colors max-md:py-2.5',
                    isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  )
                }
              >
                <span className="flex items-center gap-2">
                  {t.status === 'happening' && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />}
                  <span className="truncate text-sm font-medium">{t.name}</span>
                </span>
                <span className="block truncate text-xs text-slate-400">{formatDateRange(t.start_date, t.end_date)}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
