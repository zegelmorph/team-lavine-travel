import { useState } from 'react'
import { Armchair, Hourglass, MapPin, Plus } from 'lucide-react'
import type { TripBundle } from '@/lib/queries'
import { formatDay, formatTime } from '@/lib/dates'
import { EVENT_KIND_LABELS, type TripEvent } from '@/lib/types'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MapEmbed } from '@/components/MapEmbed'
import { cn, plural } from '@/lib/utils'
import { tripRange } from '@/features/trips/tripRange'
import { EventDialog, type EventDraft } from './EventDialog'
import { EVENT_ICONS } from './eventKinds'
import { NotBooked } from './NotBooked'
import { eventMap, formatDuration, runTime } from './model'

/** Custom events, grouped by day, then ideas with no date yet. Travel and lodging are shown on the schedule instead. */
export function EventsSection({ trip }: { trip: TripBundle }) {
  const [editing, setEditing] = useState<{ event: TripEvent | null; initial?: EventDraft } | null>(null)
  const dates = [...new Set(trip.events.map((e) => e.date))].sort((a, b) => (a ?? '9999').localeCompare(b ?? '9999'))
  const groups = dates.map((date) => ({
    date,
    events: trip.events.filter((e) => e.date === date),
  }))
  const firstDay = tripRange(trip).start ?? ''

  return (
    <Card>
      <CardHeader
        title="Events"
        actions={
          <Button
            variant="outline"
            size="sm"
            needsOnline
            onClick={() => setEditing({ event: null, initial: { date: firstDay, start_time: '', end_time: '' } })}
          >
            <Plus className="h-4 w-4" /> Add
          </Button>
        }
      />
      {groups.length === 0 ? (
        <p className="px-5 py-8 text-center text-slate-500">Shows, tours, dinners... booked or just ideas.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {groups.map(({ date, events }) => (
            <section key={date ?? 'undated'} className="px-5 py-3 max-md:px-4">
              <h4 className="mb-1 text-xs font-semibold text-slate-500">
                {date ? formatDay(date, 'EEEE, MMM d') : `Not booked yet · ${plural(events.length, 'idea')}`}
              </h4>
              <ul className="space-y-1">
                {events.map((e) => (
                  <EventRow key={e.id} event={e} trip={trip} onEdit={() => setEditing({ event: e })} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {editing && (
        <EventDialog
          tripId={trip.id}
          destinations={trip.destinations}
          event={editing.event}
          initial={editing.initial}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  )
}

function EventRow({ event: e, trip, onEdit }: { event: TripEvent; trip: TripBundle; onEdit: () => void }) {
  const Icon = EVENT_ICONS[e.kind]
  const map = eventMap(e, trip.destinations)
  const length = e.kind === 'show' ? runTime(e) : null
  return (
    <li className="flex items-stretch gap-3">
      <button
        type="button"
        onClick={onEdit}
        className="-mx-2 flex min-w-0 flex-1 items-start gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"
      >
        <span className={cn('num w-16 shrink-0 pt-0.5 text-xs font-medium', e.booked ? 'text-brand-700' : 'text-slate-400')}>
          {e.start_time ? formatTime(e.start_time) : e.date ? 'All day' : 'No date'}
          {e.end_time && <span className="block font-normal text-slate-400">until {formatTime(e.end_time)}</span>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 font-medium text-slate-900">
            <Icon className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-label={EVENT_KIND_LABELS[e.kind]} />
            <span className="truncate">{e.title}</span>
            {!e.booked && e.date && <NotBooked />}
          </span>
          {e.location && (
            <span className="block truncate text-xs text-slate-500">
              <MapPin className="mr-0.5 inline h-3 w-3 align-[-2px]" />
              {e.location}
              {e.address && <span className="text-slate-400"> · {e.address}</span>}
            </span>
          )}
          {(e.seats || length) && (
            <span className="block truncate text-xs text-slate-500">
              {e.seats && (
                <>
                  <Armchair className="mr-0.5 inline h-3 w-3 align-[-2px]" aria-label="Seats" />
                  {e.seats}
                </>
              )}
              {e.seats && length && <span className="text-slate-400"> · </span>}
              {length && (
                <>
                  <Hourglass className="mr-0.5 inline h-3 w-3 align-[-2px]" aria-label="Run time" />
                  {formatDuration(length)}
                </>
              )}
            </span>
          )}
          {e.notes && <span className="block truncate text-xs text-slate-500">{e.notes}</span>}
        </span>
      </button>
      {map && (
        <a
          href={map.link ?? undefined}
          target="_blank"
          rel="noreferrer"
          title={`Open ${e.location ?? 'location'} in Google Maps`}
          className="my-1 block h-20 w-28 shrink-0 overflow-hidden rounded-lg sm:w-40"
        >
          <MapEmbed title={`Map of ${e.location ?? e.title}`} src={map.embed} className="h-full rounded-lg" />
        </a>
      )}
    </li>
  )
}
