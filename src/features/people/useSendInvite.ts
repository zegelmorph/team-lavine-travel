import { toast } from 'sonner'
import { useInvitePerson } from '@/lib/queries'
import { useHousehold } from '@/features/auth/HouseholdProvider'
import type { Person } from '@/lib/types'

/** Sends (or resends) a person's invite and says what happened. `sendingTo` is the person being emailed right now. */
export function useSendInvite() {
  const { household } = useHousehold()
  const invite = useInvitePerson()
  return {
    sendingTo: invite.isPending ? invite.variables : null,
    send: (person: Pick<Person, 'id' | 'name' | 'email'>) =>
      invite.mutate(person.id, {
        onSuccess: (status) =>
          toast.success(
            status === 'added'
              ? `${person.name} already has an account. They'll see ${household.name}'s trips the next time they open the app.`
              : `Invite sent to ${person.email}.`,
          ),
        onError: (e) => toast.error(e.message),
      }),
  }
}
