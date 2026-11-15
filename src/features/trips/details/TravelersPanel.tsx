import { useMemo, useState } from 'react'
import { Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { useDeleteTripRow, usePeople, useSaveTripRow, type TripBundle } from '@/lib/queries'
import type { Participant, Person } from '@/lib/types'
import { CardSubheader } from '@/components/ui/card'
import { Combobox, type ComboOption } from '@/components/ui/combobox'
import { useOnline } from '@/lib/useOnline'
import { PersonDialog } from '@/features/people/PersonDialog'
import { useSendInvite } from '@/features/people/useSendInvite'
import { useCanEdit } from '../access'

/**
 * Who's going, one row per traveller. Travellers are picked from the household's people; typing a new name saves that
 * person first. Whoever manages the trip can also invite a traveller who has an email but can't sign in yet, from
 * that traveller's row; signing in lets them see this trip.
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
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])

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
          <ul className="@container space-y-1.5">
            {trip.participants.map((p) => {
              const person = peopleById.get(p.person_id)
              // Someone with an email who can't sign in yet can be sent an invite, or sent it again.
              const invitable = canEdit && person?.email && (person.access === 'none' || person.access === 'invited')
              return (
                <li key={p.id} className="flex items-center gap-1.5 rounded-full bg-brand-50 py-1 pl-1 pr-2 text-sm text-brand-800">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold uppercase">
                    {p.person.name.charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={p.person.name}>
                    {p.person.name}
                  </span>
                  {invitable && <InviteButton person={person} disabled={!online || sendingTo === person.id} onSend={() => send(person)} />}
                  {canEdit && online && (
                    <button
                      type="button"
                      onClick={() => remove.mutate(p.id, { onError: (e) => toast.error(e.message) })}
                      className="-my-1 -mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-brand-700/60 hover:bg-brand-100 hover:text-brand-900 max-md:-my-2 max-md:h-9 max-md:w-9"
                      aria-label={`Remove ${p.person.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {canEdit && online && (
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
        )}
      </div>
      {addingName !== null && <PersonDialog initialName={addingName} onClose={() => setAddingName(null)} onAdded={add} />}
    </section>
  )
}

/**
 * Sits inside a traveller's chip. Its presence is the cue that they can't see the trip yet; the tooltip spells it out.
 * When the list is narrow the label is dropped and only the icon shows, so the name keeps its room. On touch layouts
 * the pill stays the same size and an invisible ::after makes the tap target taller.
 */
function InviteButton({ person, disabled, onSend }: { person: Person; disabled: boolean; onSend: () => void }) {
  const invited = person.access === 'invited'
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSend}
      title={
        invited
          ? `${person.name} hasn't signed in yet. Send the invite email again.`
          : `${person.name} can't see this trip yet. Email them a link to sign in.`
      }
      aria-label={invited ? `Resend invite to ${person.name}` : `Invite ${person.name}`}
      className="relative flex h-6 shrink-0 items-center gap-1 rounded-full bg-brand-100 px-2 text-xs font-medium text-brand-800 transition-colors enabled:hover:bg-brand-fill enabled:hover:text-on-brand disabled:opacity-50 max-md:px-2.5 max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-1.5"
    >
      <Send className="h-3 w-3" />
      <span className="@max-[15rem]:hidden">{invited ? 'Resend' : 'Invite'}</span>
    </button>
  )
}
