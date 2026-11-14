import { useMemo, useState } from 'react'
import { Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { useDeleteTripRow, usePeople, useSaveTripRow, type TripBundle } from '@/lib/queries'
import type { Participant, Person } from '@/lib/types'
import { CardSubheader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Combobox, type ComboOption } from '@/components/ui/combobox'
import { useOnline } from '@/lib/useOnline'
import { PersonDialog } from '@/features/people/PersonDialog'
import { useSendInvite } from '@/features/people/useSendInvite'
import { useCanEdit } from '../access'

/**
 * Who's going. Travellers are picked from the household's people; typing a new name saves that person first. Whoever
 * manages the trip can also invite a traveller who has an email to sign in, which lets them see this trip.
 */
export function TravelersPanel({ trip }: { trip: TripBundle }) {
  const canEdit = useCanEdit()
  const online = useOnline()
  const { data: people = [] } = usePeople()
  const save = useSaveTripRow<Participant>('travel_participants', trip.id)
  const remove = useDeleteTripRow('travel_participants', trip.id)
  const { send, sendingTo } = useSendInvite()
  const [addingName, setAddingName] = useState<string | null>(null)

  const onTrip = useMemo(() => new Set(trip.participants.map((p) => p.person_id)), [trip.participants])
  const options: ComboOption[] = useMemo(
    () => people.filter((p) => !onTrip.has(p.id)).map((p) => ({ value: p.id, label: p.name, hint: p.email ?? undefined })),
    [people, onTrip],
  )
  // Travellers with an email who can't sign in yet.
  const toInvite = people.filter((p) => onTrip.has(p.id) && p.email && (p.access === 'none' || p.access === 'invited'))

  function add(personId: string) {
    save.mutate({ person_id: personId, sort_order: trip.participants.length }, { onError: (e) => toast.error(e.message) })
  }

  function addByName(text: string) {
    const name = text.trim()
    if (!name) return
    const known = people.find((p) => p.name.toLowerCase() === name.toLowerCase())
    if (!known) setAddingName(name)
    else if (onTrip.has(known.id)) toast.info(`${known.name} is already on this trip`)
    else add(known.id)
  }

  return (
    <section>
      <CardSubheader title="Travelers" />
      <div className="space-y-3 px-5 pb-4 pt-1 max-md:px-4">
        {trip.participants.length === 0 ? (
          <p className="text-slate-400">{canEdit ? "Who's coming along?" : 'No travelers yet.'}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {trip.participants.map((p) => (
              <li key={p.id} className="flex items-center gap-1.5 rounded-full bg-brand-50 py-1 pl-1 pr-2 text-sm text-brand-800">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold uppercase">
                  {p.person.name.charAt(0)}
                </span>
                {p.person.name}
                {canEdit && online && (
                  <button
                    type="button"
                    onClick={() => remove.mutate(p.id, { onError: (e) => toast.error(e.message) })}
                    className="-my-1 -mr-1.5 flex h-7 w-7 items-center justify-center rounded-full text-brand-700/60 hover:bg-brand-100 hover:text-brand-900 max-md:-my-2 max-md:h-9 max-md:w-9"
                    aria-label={`Remove ${p.person.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && online && (
          <div>
            <Combobox
              options={options}
              value={null}
              onChange={(id) => id && add(id)}
              onCreate={addByName}
              placeholder="Add someone"
              openOnFocus
              preferCreate
              stayOnPick
              commitOnLeave={false}
            />
            <p className="mt-1.5 text-xs text-slate-500">Pick someone, or type a new name to add them.</p>
          </div>
        )}
        {canEdit && toInvite.length > 0 && (
          <ul className="space-y-1 border-t border-slate-100 pt-3">
            {toInvite.map((p) => (
              <InviteRow key={p.id} person={p} sending={sendingTo === p.id} onSend={() => send(p)} />
            ))}
          </ul>
        )}
      </div>
      {addingName !== null && <PersonDialog initialName={addingName} onClose={() => setAddingName(null)} onAdded={add} />}
    </section>
  )
}

function InviteRow({ person, sending, onSend }: { person: Person; sending: boolean; onSend: () => void }) {
  const invited = person.access === 'invited'
  return (
    <li className="flex items-center justify-between gap-2 text-xs text-slate-500">
      <span className="min-w-0 truncate">
        {invited ? `${person.name} hasn't signed in yet.` : `${person.name} can't see this trip yet.`}
      </span>
      <Button variant="ghost" size="sm" needsOnline disabled={sending} onClick={onSend} className="shrink-0">
        <Send className="h-3.5 w-3.5" /> {invited ? 'Resend invite' : 'Send invite'}
      </Button>
    </li>
  )
}
