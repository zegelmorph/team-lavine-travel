import { useState, type FormEvent } from 'react'
import { Trash2, UserX } from 'lucide-react'
import { toast } from 'sonner'
import { useAddPerson, useDeletePerson, useRemoveAccess, useSetAdmin, useUpdatePerson } from '@/lib/queries'
import { useAuth } from '@/features/auth/AuthProvider'
import { useHousehold } from '@/features/auth/HouseholdProvider'
import type { Person } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { confirmAction } from '@/components/ui/confirm'

/**
 * Adds a person, or (admins only) edits one. Adding is open to anyone with access and is how travellers are added on
 * the fly; it never makes someone an admin and sends nothing. Editing also covers the admin switch and removing them.
 */
export function PersonDialog({
  person,
  initialName = '',
  onClose,
  onAdded,
}: {
  /** Absent to add someone new. */
  person?: Person
  initialName?: string
  onClose: () => void
  onAdded?: (id: string) => void
}) {
  const { household } = useHousehold()
  const { session } = useAuth()
  const add = useAddPerson()
  const update = useUpdatePerson()
  const setAdmin = useSetAdmin()
  const removeAccess = useRemoveAccess()
  const remove = useDeletePerson()
  const [name, setName] = useState(person?.name ?? initialName)
  const [email, setEmail] = useState(person?.email ?? '')
  const [admin, setAdminChecked] = useState(person?.access === 'admin')
  const [saving, setSaving] = useState(false)

  const hasAccount = Boolean(person?.user_id)
  const isMe = hasAccount && person?.user_id === session?.user.id
  const busy = saving || removeAccess.isPending || remove.isPending

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      if (!person) {
        const id = await add.mutateAsync({ name, email })
        onAdded?.(id)
      } else {
        if (name.trim() !== person.name || (!hasAccount && email.trim().toLowerCase() !== (person.email ?? ''))) {
          await update.mutateAsync({ id: person.id, name, email })
        }
        if (person.user_id && admin !== (person.access === 'admin')) {
          await setAdmin.mutateAsync({ userId: person.user_id, admin })
        }
      }
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function onRemoveAccess(p: Person) {
    const invited = p.access === 'invited'
    const ok = await confirmAction({
      title: invited ? `Cancel ${p.name}'s invite?` : `Remove ${p.name}'s access?`,
      message: invited
        ? `They won't get access to ${household.name}'s trips. They stay on their trips as a name.`
        : p.is_member
          ? `${p.name} is removed from ${household.name}, which also ends their access to the finance app. They stay on their trips as a name, and the trips they own are left to the admins.`
          : `${p.name} won't be able to open ${household.name}'s trips. They stay on their trips as a name, and the trips they own are left to the admins.`,
      confirmLabel: invited ? 'Cancel invite' : 'Remove access',
    })
    if (!ok) return
    removeAccess.mutate(p, { onSuccess: onClose, onError: (e) => toast.error(e.message) })
  }

  async function onDelete(p: Person) {
    const ok = await confirmAction({ title: `Delete ${p.name}?`, message: 'They come off every trip they are on.' })
    if (!ok) return
    remove.mutate(p.id, { onSuccess: onClose, onError: (e) => toast.error(e.message) })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent title={person ? `Edit ${person.name}` : 'Add a person'} className="max-w-md">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="person-name">Name</Label>
            <Input id="person-name" autoFocus required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="person-email">{hasAccount ? 'Email' : 'Email (optional)'}</Label>
            <Input id="person-email" type="email" disabled={hasAccount} value={email} onChange={(e) => setEmail(e.target.value)} />
            <p className="mt-1.5 text-xs text-slate-500">
              {hasAccount
                ? 'The address they sign in with.'
                : person?.access === 'invited'
                  ? 'Changing the address cancels the invite sent to the old one.'
                  : 'Needed to invite them to sign in. Nothing is sent until you invite them.'}
            </p>
          </div>
          {person?.is_member && !isMe && (
            <Switch
              label="Admin"
              description={`Admins see and manage every trip and everyone here. They are also owners of ${household.name} in the finance app.`}
              checked={admin}
              onChange={setAdminChecked}
            />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {person && !isMe && person.access !== 'none' && (
              <Button type="button" variant="ghost" needsOnline disabled={busy} className="text-red-700" onClick={() => onRemoveAccess(person)}>
                <UserX className="h-4 w-4" /> {person.access === 'invited' ? 'Cancel invite' : 'Remove access'}
              </Button>
            )}
            {person?.access === 'none' && (
              <Button type="button" variant="ghost" needsOnline disabled={busy} className="text-red-700" onClick={() => onDelete(person)}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )}
            <span className="ml-auto flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" needsOnline disabled={!name.trim() || busy}>
                {person ? 'Save' : 'Add person'}
              </Button>
            </span>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
