import { useState } from 'react'
import { toast } from 'sonner'
import type { TripBundle } from '@/lib/queries'
import { useUpdateTrip } from '@/lib/queries'
import { useOnline } from '@/lib/useOnline'
import { Card, CardHeader, CardSubheader } from '@/components/ui/card'
import { DestinationsPanel } from './DestinationsPanel'
import { TravelersPanel } from './TravelersPanel'
import { TransportSection } from '@/features/transport/TransportSection'
import { LodgingSection } from '@/features/lodging/LodgingSection'
import { EventsSection } from '@/features/schedule/EventsSection'
import { PackingSection } from '@/features/packing/PackingSection'

export function OverviewTab({ trip }: { trip: TripBundle }) {
  return (
    <div className="space-y-4 md:space-y-6">
      <Card>
        <CardHeader title="Trip" />
        <div className="grid grid-cols-[minmax(0,1fr)] divide-y divide-slate-100 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:divide-x lg:divide-y-0">
          <DestinationsPanel trip={trip} />
          <TravelersPanel trip={trip} />
        </div>
        <NotesPanel key={trip.notes ?? ''} trip={trip} />
      </Card>
      <TransportSection trip={trip} />
      <LodgingSection trip={trip} />
      <EventsSection trip={trip} />
      <PackingSection trip={trip} />
    </div>
  )
}

function NotesPanel({ trip }: { trip: TripBundle }) {
  const update = useUpdateTrip(trip.id)
  const [notes, setNotes] = useState(trip.notes ?? '')
  const online = useOnline()

  function save() {
    if (notes === (trip.notes ?? '')) return
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
          readOnly={!online}
          rows={3}
          placeholder="Ideas, must-sees, reminders..."
          className="w-full resize-y rounded-lg border border-slate-200 bg-field px-3 py-2 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
      </div>
    </section>
  )
}
