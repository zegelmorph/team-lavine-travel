import { useState } from 'react'
import { toast } from 'sonner'
import type { TripBundle } from '@/lib/queries'
import { useUpdateTrip } from '@/lib/queries'
import { useOnline } from '@/lib/useOnline'
import { Card, CardHeader } from '@/components/ui/card'
import { DestinationsCard } from './DestinationsCard'
import { ParticipantsCard } from './ParticipantsCard'
import { TransportSection } from '@/features/transport/TransportSection'
import { LodgingSection } from '@/features/lodging/LodgingSection'
import { EventsSection } from '@/features/schedule/EventsSection'
import { PackingSection } from '@/features/packing/PackingSection'

export function OverviewTab({ trip }: { trip: TripBundle }) {
  return (
    <div className="space-y-4 md:space-y-6">
      <NotesCard key={trip.notes ?? ''} trip={trip} />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 md:gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <DestinationsCard trip={trip} />
        <ParticipantsCard trip={trip} />
      </div>
      <TransportSection trip={trip} />
      <LodgingSection trip={trip} />
      <EventsSection trip={trip} />
      <PackingSection trip={trip} />
    </div>
  )
}

function NotesCard({ trip }: { trip: TripBundle }) {
  const update = useUpdateTrip(trip.id)
  const [notes, setNotes] = useState(trip.notes ?? '')
  const online = useOnline()

  function save() {
    if (notes === (trip.notes ?? '')) return
    update.mutate({ notes: notes.trim() || null }, { onError: (e) => toast.error(e.message) })
  }

  return (
    <Card>
      <CardHeader title="Notes" />
      <div className="p-4">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={save}
          readOnly={!online}
          rows={3}
          placeholder="Ideas, must-sees, reminders..."
          className="w-full resize-y rounded-lg border border-slate-200 bg-field px-3 py-2 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
      </div>
    </Card>
  )
}
