import { useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, LogOut, Monitor, Moon, Send, Sun, Trash2, UserPlus, type LucideIcon } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { keys, unwrap, useMembers } from '@/lib/queries'
import { useTheme, type ThemePref } from '@/lib/theme'
import { setTempUnit, useTempUnit, type TempUnit } from '@/lib/weather'
import { useAuth } from './AuthProvider'
import { useHousehold } from './HouseholdProvider'
import { MIN_PASSWORD_LENGTH, PasswordInput, newPasswordProblem } from './PasswordInput'
import { useInviteUser } from '@/lib/householdQueries'
import { CatalogSettings } from '@/features/packing/CatalogSettings'
import { PillTabs } from '@/components/ui/pill-tabs'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'
import { Card, CardHeader, PageHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Invite {
  id: string
  email: string
  created_at: string
  accepted_at: string | null
}

const SETTINGS_TABS = [
  ['personal', 'Personal'],
  ['household', 'Household'],
  ['packing', 'Packing list'],
] as const
type Tab = (typeof SETTINGS_TABS)[number][0]

const TAB_HINTS: Record<Tab, (household: string) => string> = {
  personal: () => "Just for you; other household members aren't affected.",
  household: (name) => `Everyone in ${name} shares its trips. Members also share the Team Lavine finance app.`,
  packing: (name) => `Items and categories ${name} picks from when building a trip's packing list.`,
}

export function SettingsPage() {
  const { household } = useHousehold()
  const [params, setParams] = useSearchParams()
  const tab: Tab = SETTINGS_TABS.find(([id]) => id === params.get('tab'))?.[0] ?? 'personal'

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 md:space-y-6 md:p-6 lg:p-8">
      <div>
        <PageHeader title="Settings" />
        <PillTabs
          className="mt-3"
          value={tab}
          options={SETTINGS_TABS}
          onChange={(id) => setParams(id === 'personal' ? {} : { tab: id }, { replace: true })}
        />
        <p className="mt-3 text-slate-500">{TAB_HINTS[tab](household.name)}</p>
      </div>
      {tab === 'personal' && <PersonalSettings />}
      {tab === 'household' && <HouseholdSettings key={household.id} />}
      {tab === 'packing' && <CatalogSettings key={household.id} />}
    </div>
  )
}

function PersonalSettings() {
  const { session } = useAuth()
  const [changingPassword, setChangingPassword] = useState(false)
  return (
    <>
      <Card>
        <CardHeader title="Appearance" />
        <div className="space-y-2 p-5 max-md:p-4">
          <ThemePicker />
          <p className="text-xs text-slate-400">System follows your device's light or dark setting. Saved on this device.</p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Temperature" />
        <div className="p-5 max-md:p-4">
          <TempUnitPicker />
        </div>
      </Card>

      <Card>
        <CardHeader title="Account" />
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 max-md:px-4">
          <span className="flex min-w-0 items-center gap-3">
            <Avatar email={session?.user.email ?? '?'} />
            <span className="min-w-0">
              <span className="block truncate text-slate-800">{session?.user.email}</span>
              <span className="block text-xs text-slate-400">Signed in</span>
            </span>
          </span>
          <span className="flex shrink-0 gap-2 max-md:w-full max-md:[&>button]:flex-1">
            <Button variant="outline" onClick={() => setChangingPassword(true)}>
              <KeyRound className="h-4 w-4" />
              Reset password
            </Button>
            <Button variant="outline" onClick={() => supabase.auth.signOut()}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </span>
        </div>
      </Card>

      {changingPassword && (
        <PasswordDialog email={session?.user.email ?? ''} onClose={() => setChangingPassword(false)} />
      )}
    </>
  )
}

function PasswordDialog({ email, onClose }: { email: string; onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  const change = useMutation({
    mutationFn: async () => {
      const { error: wrong } = await supabase.auth.signInWithPassword({ email, password: current })
      if (wrong) throw new Error('Your current password is incorrect.')
      const { error } = await supabase.auth.updateUser({ password: next })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Password changed')
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  const reset = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(`Reset link sent to ${email}`)
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })
  const busy = change.isPending || reset.isPending

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const problem = newPasswordProblem(next, confirm)
    setError(problem)
    if (!problem) change.mutate()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent title="Reset password" className="max-w-sm">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="current-password">Current password</Label>
            <PasswordInput
              id="current-password"
              required
              autoFocus
              autoComplete="current-password"
              value={current}
              onChange={setCurrent}
            />
          </div>
          <div>
            <Label htmlFor="new-password">New password</Label>
            <PasswordInput
              id="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              value={next}
              onChange={setNext}
            />
          </div>
          <div>
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <PasswordInput
              id="confirm-password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={setConfirm}
            />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {change.isPending ? 'Saving...' : 'Save password'}
            </Button>
          </div>
          <p className="border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
            Forgot your current password?{' '}
            <button
              type="button"
              className="font-medium text-brand-700 disabled:opacity-50"
              disabled={busy}
              onClick={() => reset.mutate()}
            >
              Email me a reset link
            </button>
          </p>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function HouseholdSettings() {
  const { household } = useHousehold()
  const { session } = useAuth()
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [name, setName] = useState(household.name)
  const [inviting, setInviting] = useState(false)

  const members = useMembers()
  const invites = useQuery({
    queryKey: ['invites', household.id],
    queryFn: async () =>
      unwrap(
        await supabase.from('household_invites').select('*').eq('household_id', household.id).order('created_at'),
      ) as Invite[],
  })

  const isOwner = members.data?.some((m) => m.user_id === session?.user.id && m.role === 'owner')
  const pendingInvites = invites.data?.filter((i) => !i.accepted_at) ?? []

  const inviteUser = useInviteUser()
  function sendInvite(addr: string, onSent?: () => void) {
    const to = addr.trim().toLowerCase()
    inviteUser.mutate(
      { email: to, householdId: household.id },
      {
        onSuccess: (status) => {
          onSent?.()
          toast.success(
            status === 'added_to_household'
              ? `${to} already has an account. They'll join ${household.name} the next time they open the app.`
              : `Invite email sent to ${to}.`,
          )
          qc.invalidateQueries({ queryKey: ['invites', household.id] })
        },
        onError: (e: Error) => toast.error(e.message),
      },
    )
  }

  const removeInvite = useMutation({
    mutationFn: async (id: string) => {
      unwrap(await supabase.from('household_invites').delete().eq('id', id))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invites', household.id] }),
    onError: (e: Error) => toast.error(e.message),
  })

  function closeInvite() {
    setInviting(false)
    setEmail('')
  }

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      unwrap(
        await supabase.from('household_members').delete().eq('household_id', household.id).eq('user_id', userId),
      )
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.members(household.id) }),
    onError: (e: Error) => toast.error(e.message),
  })

  const rename = useMutation({
    mutationFn: async () => {
      unwrap(await supabase.from('households').update({ name }).eq('id', household.id))
    },
    onSuccess: () => {
      toast.success('Household renamed')
      qc.invalidateQueries({ queryKey: ['households'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function onInvite(e: FormEvent) {
    e.preventDefault()
    if (email.trim()) sendInvite(email, closeInvite)
  }

  return (
    <>
      <Card>
        <CardHeader title="Name" />
        <div className="flex gap-2 p-5 max-md:p-4">
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwner} />
          <Button onClick={() => rename.mutate()} disabled={!isOwner || !name.trim() || name === household.name}>
            Rename
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Members"
          actions={
            isOwner && (
              <Button variant="outline" size="sm" onClick={() => setInviting(true)}>
                <UserPlus className="h-4 w-4" /> Invite
              </Button>
            )
          }
        />
        <ul className="divide-y divide-slate-100">
          {members.data?.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between gap-2 px-5 py-3 max-md:px-4">
              <span className="flex min-w-0 items-center gap-3">
                <Avatar email={m.email} />
                <span className="truncate text-slate-800">{m.email}</span>
                <Pill active={m.role === 'owner'}>{m.role}</Pill>
              </span>
              {isOwner && m.user_id !== session?.user.id && (
                <Button variant="ghost" size="icon" onClick={() => removeMember.mutate(m.user_id)} title="Remove member">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
          {isOwner &&
            pendingInvites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 px-5 py-3 max-md:px-4">
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar email={i.email} />
                  <span className="truncate text-slate-500">{i.email}</span>
                  <Pill active={false}>invited</Pill>
                </span>
                <span className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={inviteUser.isPending}
                    onClick={() => sendInvite(i.email)}
                    title="Send the invite email again"
                  >
                    <Send className="h-3.5 w-3.5" /> <span className="max-md:hidden">Resend</span>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => removeInvite.mutate(i.id)} title="Delete invite">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </span>
              </li>
            ))}
        </ul>
        {inviting && (
          <Dialog open onOpenChange={(open) => !open && closeInvite()}>
            <DialogContent title="Invite a family member">
              <form onSubmit={onInvite} className="space-y-4">
                <div>
                  <Label htmlFor="invite">Email</Label>
                  <Input
                    id="invite"
                    type="email"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <p className="mt-2 text-xs text-slate-400">
                    We'll email them a link to set a password. They join {household.name} when they first sign in. If
                    they already have an account, they're added the next time they open the app.
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={closeInvite}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!email.trim() || inviteUser.isPending}>
                    Send invite
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </Card>

    </>
  )
}

const THEME_OPTIONS: { value: ThemePref; label: string; icon: LucideIcon }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

function ThemePicker() {
  const { pref, setPref } = useTheme()
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex gap-1 rounded-xl bg-slate-100 p-1">
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={pref === value}
          onClick={() => setPref(value)}
          className={cn(
            'flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm transition-colors',
            pref === value
              ? 'bg-white font-medium text-brand-800 shadow-card'
              : 'text-slate-500 hover:text-slate-800',
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  )
}

const UNIT_OPTIONS: { value: TempUnit; label: string }[] = [
  { value: 'F', label: '°F' },
  { value: 'C', label: '°C' },
]

function TempUnitPicker() {
  const unit = useTempUnit()
  return (
    <div role="radiogroup" aria-label="Temperature unit" className="inline-flex gap-1 rounded-xl bg-slate-100 p-1">
      {UNIT_OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={unit === value}
          onClick={() => setTempUnit(value)}
          className={cn(
            'rounded-lg px-4 py-1.5 text-sm transition-colors',
            unit === value ? 'bg-white font-medium text-brand-800 shadow-card' : 'text-slate-500 hover:text-slate-800',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function Avatar({ email }: { email: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold uppercase text-brand-800">
      {email.charAt(0)}
    </span>
  )
}

function Pill({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[11px] font-medium',
        active ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-500',
      )}
    >
      {children}
    </span>
  )
}
