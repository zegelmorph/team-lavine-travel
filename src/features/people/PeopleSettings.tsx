import { useState, type ReactNode } from 'react'
import { Pencil, Send, UserPlus } from 'lucide-react'
import { usePeople } from '@/lib/queries'
import { useAuth } from '@/features/auth/AuthProvider'
import { useHousehold } from '@/features/auth/HouseholdProvider'
import type { Person, PersonAccess } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { InviteEmailDialog } from './InviteEmailDialog'
import { PersonDialog } from './PersonDialog'
import { useSendInvite } from './useSendInvite'

const ACCESS_LABELS: Record<PersonAccess, string> = {
  admin: 'Admin',
  user: 'User',
  invited: 'Invited',
  none: 'No account',
}

/**
 * Everyone who can be put on a trip. Admins add people, invite them to sign in (someone saved without an email is
 * asked for one first), and manage their access; everyone else sees the list.
 */
export function PeopleSettings() {
  const { household } = useHousehold()
  const { session } = useAuth()
  const { data: people, isPending, error } = usePeople()
  const { send, sendingTo } = useSendInvite()
  const [editing, setEditing] = useState<Person | 'new' | null>(null)
  const [askingEmailOf, setAskingEmailOf] = useState<Person | null>(null)
  const isAdmin = household.role === 'admin'

  return (
    <Card>
      <CardHeader
        title="People"
        actions={
          isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
              <UserPlus className="h-4 w-4" /> Add person
            </Button>
          )
        }
      />
      {isPending ? (
        <p className="px-5 py-4 text-slate-400 max-md:px-4">Loading...</p>
      ) : error ? (
        <p className="px-5 py-4 text-red-700 max-md:px-4">{error.message}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {people.map((p) => {
            // Someone who can't sign in yet can be sent an invite, or sent it again. Without an email they're asked
            // for one first.
            const invitable = isAdmin && (p.access === 'none' || p.access === 'invited')
            return (
              <li key={p.id} className="flex items-center justify-between gap-2 px-5 py-3 max-md:px-4">
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar name={p.name} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-slate-800">{p.name}</span>
                      {p.user_id === session?.user.id && <span className="shrink-0 text-xs text-slate-400">You</span>}
                      {/* Someone removed from the household still has their account, just no access here. */}
                      <Pill active={p.access === 'admin'}>{p.access === 'none' && p.user_id ? 'No access' : ACCESS_LABELS[p.access]}</Pill>
                    </span>
                    {p.email && <span className="block truncate text-xs text-slate-500">{p.email}</span>}
                  </span>
                </span>
                {isAdmin && (
                  <span className="flex shrink-0 items-center gap-1">
                    {invitable && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={sendingTo === p.id}
                        onClick={() => (p.email ? send(p) : setAskingEmailOf(p))}
                        title={
                          p.access === 'invited'
                            ? 'Send the invite email again'
                            : p.email
                              ? 'Email them a link to sign in'
                              : 'Add their email to invite them'
                        }
                        aria-label={p.access === 'invited' ? `Resend invite to ${p.name}` : `Send invite to ${p.name}`}
                      >
                        <Send className="h-3.5 w-3.5" />
                        {/* Icon only on a phone, where the label would squeeze the name out of the row. */}
                        <span className="max-md:hidden">{p.access === 'invited' ? 'Resend' : 'Send invite'}</span>
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => setEditing(p)} title={`Edit ${p.name}`} aria-label={`Edit ${p.name}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500 max-md:px-4">
        {isAdmin
          ? `People you invite here can use the travel app only. To give someone the finance app as well, invite them to ${household.name} from there.`
          : 'Only admins can invite people or change their access. You can add people to your own trips from the trip.'}
      </p>
      {editing && <PersonDialog person={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {askingEmailOf && <InviteEmailDialog person={askingEmailOf} onClose={() => setAskingEmailOf(null)} onInvite={send} />}
    </Card>
  )
}

export function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold uppercase text-brand-800">
      {name.charAt(0)}
    </span>
  )
}

function Pill({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
        active ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-500',
      )}
    >
      {children}
    </span>
  )
}
