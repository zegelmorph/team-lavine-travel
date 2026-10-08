import { useState } from 'react'
import { toast } from 'sonner'
import type { TripBundle } from '@/lib/queries'
import { useUpdateTrip } from '@/lib/queries'
import { Card, CardHeader } from '@/components/ui/card'
import { DestinationsCard } from './DestinationsCard'
import { ParticipantsCard } from './ParticipantsCard'

export function OverviewTab({ trip }: { trip: TripBundle }) {
  return (
    <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <DestinationsCard trip={trip} />
      </div>
      <div className="space-y-4 md:space-y-6">
        <ParticipantsCard trip={trip} />
        <NotesCard key={trip.notes ?? ''} trip={trip} />
      </div>
    </div>
  )
}

function NotesCard({ trip }: { trip: TripBundle }) {
  const update = useUpdateTrip(trip.id)
  const [notes, setNotes] = useState(trip.notes ?? '')

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
          rows={5}
          placeholder="Ideas, must-sees, reminders..."
          className="w-full resize-y rounded-lg border border-slate-200 bg-field px-3 py-2 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
      </div>
    </Card>
  )
}
