import { useMemo, useState } from 'react'
import { Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { useDeleteTripRow, usePeople, useSaveTripRow, type TripBundle } from '@/lib/queries'
import { TRIP_ROLES, TRIP_ROLE_LABELS, type Participant, type Person, type TripRole } from '@/lib/types'
import { CardSubheader } from '@/components/ui/card'
import { Combobox, type ComboOption } from '@/components/ui/combobox'
import { useOnline } from '@/lib/useOnline'
import { useHousehold } from '@/features/auth/HouseholdProvider'
import { InviteEmailDialog } from '@/features/people/InviteEmailDialog'
import { PersonDialog } from '@/features/people/PersonDialog'
import { useSendInvite } from '@/features/people/useSendInvite'
import { useCanManage } from '../access'

/**
 * Who's going, one row per traveller. Travellers are picked from the household's people; typing a new name saves that
 * person first. All of this is for whoever manages the trip (its owner and the admins); editors and viewers see the
 * list and each traveller's role, and change nothing here.
 *
 * A traveller who can sign in, or has been invited to, is a viewer or an editor of the trip, set from their row. The
 * owner and the admins are labelled instead, since they manage the trip whatever their row says. The role is kept
 * when someone loses their access, and applies again if they are invited back.
 *
 * A traveller who can't sign in yet can be invited from their row; signing in lets them see this trip. Someone saved
 * without an email is asked for one first, which only an admin can do, since only admins may change someone else's
 * details.
 */
export function TravelersPanel({ trip }: { trip: TripBundle }) {
  const canManage = useCanManage()
  const online = useOnline()
  const isAdmin = useHousehold().household.role === 'admin'
  const { data: people = [] } = usePeople()
  const save = useSaveTripRow<Participant>('travel_participants', trip.id)
  const remove = useDeleteTripRow('travel_participants', trip.id)
  const { send, sendingTo } = useSendInvite()
  const [addingName, setAddingName] = useState<string | null>(null)
  const [askingEmailOf, setAskingEmailOf] = useState<Person | null>(null)

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
          <p className="text-slate-400">{canManage ? "Who's coming along?" : 'No travelers yet.'}</p>
        ) : (
          <ul className="@container space-y-1.5">
            {trip.participants.map((p) => {
              const person = peopleById.get(p.person_id)
              // Someone who can't sign in yet can be sent an invite, or sent it again. Without an email they're asked
              // for one first, which takes an admin.
              const invitable =
                canManage && person && (person.access === 'none' || person.access === 'invited') && (person.email || isAdmin)
              return (
                <li key={p.id} className="flex items-center gap-1.5 rounded-full bg-brand-50 py-1 pl-1 pr-2 text-sm text-brand-800">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold uppercase">
                    {p.person.name.charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={p.person.name}>
                    {p.person.name}
                  </span>
                  {person && (
                    <TripRoleControl
                      name={p.person.name}
                      role={p.role}
                      fixed={person.user_id && person.user_id === trip.owner_id ? 'Owner' : person.access === 'admin' ? 'Admin' : null}
                      // Without an invite there's nobody to give a role to yet. An editor who lost their access keeps
                      // the role and gets it back with a new invite, so theirs stays in view.
                      hidden={person.access === 'none' && p.role !== 'editor'}
                      editable={canManage}
                      disabled={!online}
                      onChange={(role) => save.mutate({ id: p.id, role }, { onError: (e) => toast.error(e.message) })}
                    />
                  )}
                  {invitable && (
                    <InviteButton
                      person={person}
                      disabled={!online || sendingTo === person.id}
                      onSend={() => (person.email ? send(person) : setAskingEmailOf(person))}
                    />
                  )}
                  {canManage && online && (
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
        {canManage && online && (
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
      {askingEmailOf && <InviteEmailDialog person={askingEmailOf} onClose={() => setAskingEmailOf(null)} onInvite={send} />}
    </section>
  )
}

/**
 * A traveller's role on the trip, inside their chip: a picker for whoever manages the trip, plain text for everyone
 * else. `fixed` names someone whose access doesn't come from a role (the owner, an admin) and is shown in its place.
 */
function TripRoleControl({
  name,
  role,
  fixed,
  hidden,
  editable,
  disabled,
  onChange,
}: {
  name: string
  role: TripRole
  fixed: string | null
  hidden: boolean
  editable: boolean
  disabled: boolean
  onChange: (role: TripRole) => void
}) {
  if (fixed) return <span className="shrink-0 text-xs text-brand-700/70">{fixed}</span>
  if (hidden) return null
  if (!editable) return <span className="shrink-0 text-xs text-brand-700/70">{TRIP_ROLE_LABELS[role]}</span>
  return (
    <select
      aria-label={`${name}'s role`}
      value={role}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as TripRole)}
      className="select-chevron h-6 shrink-0 cursor-pointer rounded-full bg-brand-100 bg-position-[right_0.375rem_center] bg-size-[0.75rem] pl-2 pr-5.5 text-xs font-medium text-brand-800 outline-none transition-colors hover:bg-brand-200 focus-visible:ring-2 focus-visible:ring-brand-500/30 disabled:cursor-default disabled:opacity-50 max-md:-my-1 max-md:h-8 max-md:pl-2.5"
    >
      {TRIP_ROLES.map((r) => (
        <option key={r} value={r}>
          {TRIP_ROLE_LABELS[r]}
        </option>
      ))}
    </select>
  )
}

/**
 * Sits inside a traveller's chip. Its presence is the cue that they can't see the trip yet; the tooltip spells it out.
 * When the list is narrow the label is dropped and only the icon shows, so the name keeps its room. On touch layouts
 * the pill stays the same size and an invisible ::after makes the tap target taller. For someone with no email saved,
 * `onSend` asks for one before anything is sent.
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
          : person.email
            ? `${person.name} can't see this trip yet. Email them a link to sign in.`
            : `${person.name} can't see this trip yet. Add their email to invite them.`
      }
      aria-label={invited ? `Resend invite to ${person.name}` : `Invite ${person.name}`}
      className="relative flex h-6 shrink-0 items-center gap-1 rounded-full bg-brand-100 px-2 text-xs font-medium text-brand-800 transition-colors enabled:hover:bg-brand-fill enabled:hover:text-on-brand disabled:opacity-50 max-md:px-2.5 max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-1.5"
    >
      <Send className="h-3 w-3" />
      {/* Someone invited also has the role picker in their chip, so their label gives way sooner. */}
      <span className={invited ? '@max-[22rem]:hidden' : '@max-[15rem]:hidden'}>{invited ? 'Resend' : 'Invite'}</span>
    </button>
  )
}
