import { useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { useDeleteTripRow, useMembers, useSaveTripRow, type TripBundle } from '@/lib/queries'
import type { HouseholdMember, Participant } from '@/lib/types'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** "jane.doe@x.com" -> "Jane Doe" */
export function nameFromEmail(email: string): string {
  return email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function ParticipantsCard({ trip }: { trip: TripBundle }) {
  const { data: members } = useMembers()
  const save = useSaveTripRow<Participant>('travel_participants', trip.id)
  const remove = useDeleteTripRow('travel_participants', trip.id)
  const [name, setName] = useState('')

  const joined = new Set(trip.participants.map((p) => p.user_id).filter(Boolean))
  const suggestions = (members ?? []).filter((m) => !joined.has(m.user_id))

  function add(fields: Partial<Participant>) {
    save.mutate({ ...fields, sort_order: trip.participants.length }, { onError: (e) => toast.error(e.message) })
  }

  function addMember(m: HouseholdMember) {
    add({ user_id: m.user_id, display_name: nameFromEmail(m.email) })
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    add({ display_name: name.trim() })
    setName('')
  }

  return (
    <Card>
      <CardHeader title="Travelers" />
      <div className="space-y-3 p-4">
        {trip.participants.length === 0 ? (
          <p className="text-slate-400">Who's coming along?</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {trip.participants.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-1.5 rounded-full bg-brand-50 py-1 pl-1 pr-2 text-sm text-brand-800"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold uppercase">
                  {p.display_name.charAt(0)}
                </span>
                {p.display_name}
                <button
                  type="button"
                  onClick={() => remove.mutate(p.id, { onError: (e) => toast.error(e.message) })}
                  className="rounded-full p-0.5 text-brand-700/60 hover:bg-brand-100 hover:text-brand-900"
                  aria-label={`Remove ${p.display_name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((m) => (
              <button
                key={m.user_id}
                type="button"
                onClick={() => addMember(m)}
                className="flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:border-brand-400 hover:text-brand-800"
              >
                <Plus className="h-3 w-3" /> {nameFromEmail(m.email)}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={onSubmit} className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add someone by name" />
          <Button type="submit" variant="outline" disabled={!name.trim() || save.isPending}>
            Add
          </Button>
        </form>
      </div>
    </Card>
  )
}
