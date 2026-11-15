import { toast } from 'sonner'
import { useInvitePerson } from '@/lib/queries'
import type { Person } from '@/lib/types'

/** Sends (or resends) a person's invite and says what happened. `sendingTo` is the person being emailed right now. */
export function useSendInvite() {
  const invite = useInvitePerson()
  return {
    sendingTo: invite.isPending ? invite.variables : null,
    send: (person: Pick<Person, 'id' | 'name' | 'email'>) =>
      invite.mutate(person.id, {
        onSuccess: (status) =>
          toast.success(
            status === 'added'
              ? `${person.name} already has an account, so a sign-in link was sent to ${person.email}.`
              : `Invite sent to ${person.email}.`,
          ),
        onError: (e) => toast.error(e.message),
      }),
  }
}
