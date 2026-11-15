import { useState, type FormEvent } from 'react'
import { Send } from 'lucide-react'
import { toast } from 'sonner'
import { useUpdatePerson } from '@/lib/queries'
import type { Person } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'

/**
 * Asks for the email of someone saved without one, so they can be invited. Saves the address, then hands the person
 * (now with their email) to `onInvite`, which sends the invite. Only an admin can save someone else's email, so this
 * is only offered to admins.
 */
export function InviteEmailDialog({
  person,
  onClose,
  onInvite,
}: {
  person: Person
  onClose: () => void
  onInvite: (person: Person) => void
}) {
  const update = useUpdatePerson()
  const [email, setEmail] = useState('')
  const address = email.trim().toLowerCase()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!address) return
    try {
      await update.mutateAsync({ id: person.id, name: person.name, email: address })
    } catch (err) {
      toast.error((err as Error).message)
      return
    }
    onInvite({ ...person, email: address })
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !update.isPending && onClose()}>
      <DialogContent title={`Invite ${person.name}`} className="max-w-md">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" type="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={update.isPending}>
              Cancel
            </Button>
            <Button type="submit" needsOnline disabled={!address || update.isPending}>
              <Send className="h-4 w-4" /> Invite
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
