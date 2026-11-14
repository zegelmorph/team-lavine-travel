import { useState } from 'react'
import { toast } from 'sonner'
import type { TripBundle } from '@/lib/queries'
import { usePeople, useUpdateTrip } from '@/lib/queries'
import { useOnline } from '@/lib/useOnline'
import { useHousehold } from '@/features/auth/HouseholdProvider'
import { Card, CardHeader, CardSubheader } from '@/components/ui/card'
import { Select } from '@/components/ui/input'
import { useCanEdit } from '../access'
import { DestinationsPanel } from './DestinationsPanel'
import { TravelersPanel } from './TravelersPanel'

/** The Details tab: destinations, travelers, who owns the trip, and notes. */
export function DetailsTab({ trip }: { trip: TripBundle }) {
  return (
    <Card>
      <CardHeader title="Trip" />
      <div className="grid grid-cols-[minmax(0,1fr)] divide-y divide-slate-100 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:divide-x lg:divide-y-0">
        <DestinationsPanel trip={trip} />
        <div className="divide-y divide-slate-100">
          <TravelersPanel trip={trip} />
          <OwnerPanel trip={trip} />
        </div>
      </div>
      <NotesPanel key={trip.notes ?? ''} trip={trip} />
    </Card>
  )
}

/** Who manages the trip alongside the admins. Only admins can hand it to someone else. */
function OwnerPanel({ trip }: { trip: TripBundle }) {
  const { household } = useHousehold()
  const { data: people = [] } = usePeople()
  const update = useUpdateTrip(trip.id)
  const online = useOnline()
  // Only someone who can sign in can own a trip.
  const candidates = people.filter((p) => p.user_id && (p.access === 'admin' || p.access === 'user'))
  const owner = people.find((p) => p.user_id && p.user_id === trip.owner_id)

  return (
    <section>
      <CardSubheader title="Owner" />
      <div className="px-5 pb-4 pt-1 max-md:px-4">
        {household.role === 'admin' ? (
          <>
            <Select
              aria-label="Trip owner"
              value={trip.owner_id ?? ''}
              disabled={!online || update.isPending}
              onChange={(e) => update.mutate({ owner_id: e.target.value || null }, { onError: (err) => toast.error(err.message) })}
              className="w-full"
            >
              <option value="">No owner</option>
              {/* The current owner when they aren't a candidate: the people list is still loading, or they lost access. */}
              {trip.owner_id && !candidates.some((p) => p.user_id === trip.owner_id) && (
                <option value={trip.owner_id}>{owner ? `${owner.name} (no access)` : '...'}</option>
              )}
              {candidates.map((p) => (
                <option key={p.id} value={p.user_id!}>
                  {p.name}
                </option>
              ))}
            </Select>
            <p className="mt-1.5 text-xs text-slate-500">The owner manages this trip. Admins can manage every trip.</p>
          </>
        ) : (
          <p className="text-slate-600">{owner ? owner.name : 'Managed by the admins'}</p>
        )}
      </div>
    </section>
  )
}

function NotesPanel({ trip }: { trip: TripBundle }) {
  const update = useUpdateTrip(trip.id)
  const [notes, setNotes] = useState(trip.notes ?? '')
  const online = useOnline()
  const canEdit = useCanEdit()

  function save() {
    if (!canEdit || notes === (trip.notes ?? '')) return
    update.mutate({ notes: notes.trim() || null }, { onError: (e) => toast.error(e.message) })
  }

  return (
    <section className="border-t border-slate-100">
      <CardSubheader title="Notes" />
      <div className="px-5 pb-4 pt-1 max-md:px-4">
        <textarea
          aria-label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={save}
          readOnly={!online || !canEdit}
          rows={3}
          placeholder={canEdit ? 'Ideas, must-sees, reminders...' : 'No notes.'}
          className="w-full resize-y rounded-lg border border-slate-200 bg-field px-3 py-2 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
      </div>
    </section>
  )
}
