import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound, LogOut, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { unwrap, usePeople, useUpdatePerson } from '@/lib/queries'
import { useTheme, type ThemePref } from '@/lib/theme'
import { setTempUnit, useTempUnit, type TempUnit } from '@/lib/weather'
import { useSetTimeFormat, useTimeFormat } from '@/lib/userSettings'
import type { TimeFormat } from '@/lib/dates'
import { useAuth } from './AuthProvider'
import { useHousehold } from './HouseholdProvider'
import { MIN_PASSWORD_LENGTH, PasswordInput, newPasswordProblem } from './PasswordInput'
import { householdKeys } from '@/lib/householdQueries'
import { CatalogSettings } from '@/features/packing/CatalogSettings'
import { Avatar, PeopleSettings } from '@/features/people/PeopleSettings'
import { PillTabs } from '@/components/ui/pill-tabs'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'
import { Card, CardHeader, PageHeader } from '@/components/ui/card'
import { useOnline } from '@/lib/useOnline'
import { cn } from '@/lib/utils'

const SETTINGS_TABS = [
  ['personal', 'Personal'],
  ['household', 'Household'],
  ['packing', 'Packing items'],
  ['cabinet', 'Travel cabinet'],
] as const
type Tab = (typeof SETTINGS_TABS)[number][0]

const TAB_HINTS: Record<Tab, (household: string) => string> = {
  personal: () => "Just for you; other household members aren't affected.",
  household: (name) => `Who can use ${name}'s trips. Admins manage every trip; everyone else manages their own and sees the ones they're travelling on.`,
  packing: (name) => `Items ${name} picks from when building a trip's packing list. Set how many to bring on each trip.`,
  cabinet: (name) => `What ${name} keeps in the travel cabinet. When packing for a trip, check off what you're taking and it moves to the list.`,
}

export function SettingsPage() {
  const { household } = useHousehold()
  const [params, setParams] = useSearchParams()
  const tab: Tab = SETTINGS_TABS.find(([id]) => id === params.get('tab'))?.[0] ?? 'personal'

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 pb-10 md:space-y-6 md:p-6 lg:p-8">
      <div>
        <PageHeader title="Settings" />
        <div className="-mx-3 mt-3 overflow-x-auto px-3 md:mx-0 md:px-0">
          <PillTabs value={tab} options={SETTINGS_TABS} onChange={(id) => setParams(id === 'personal' ? {} : { tab: id }, { replace: true })} />
        </div>
        <p className="mt-3 text-slate-500">{TAB_HINTS[tab](household.name)}</p>
      </div>
      {tab === 'personal' && <PersonalSettings />}
      {tab === 'household' && <HouseholdSettings key={household.id} />}
      {tab === 'packing' && <CatalogSettings key={`packing-${household.id}`} list="packing" />}
      {tab === 'cabinet' && <CatalogSettings key={`cabinet-${household.id}`} list="cabinet" />}
    </div>
  )
}

function PersonalSettings() {
  const { session } = useAuth()
  const [changingPassword, setChangingPassword] = useState(false)
  return (
    <>
      <YourName />

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
        <CardHeader title="Time format" />
        <div className="space-y-2 p-5 max-md:p-4">
          <TimeFormatPicker />
          <p className="text-xs text-slate-400">Saved to your account, so it follows you to other devices.</p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Account" />
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 max-md:px-4">
          <span className="flex min-w-0 items-center gap-3">
            <Avatar name={session?.user.email ?? '?'} />
            <span className="min-w-0">
              <span className="block truncate text-slate-800">{session?.user.email}</span>
              <span className="block text-xs text-slate-400">Signed in</span>
            </span>
          </span>
          <span className="flex shrink-0 gap-2 max-md:w-full max-md:[&>button]:flex-1">
            <Button variant="outline" needsOnline onClick={() => setChangingPassword(true)}>
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
            <Button type="submit" needsOnline disabled={busy}>
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
  const qc = useQueryClient()
  const [name, setName] = useState(household.name)
  const online = useOnline()
  const isAdmin = household.role === 'admin'

  const rename = useMutation({
    mutationFn: async () => {
      unwrap(await supabase.from('households').update({ name }).eq('id', household.id))
    },
    onSuccess: () => {
      toast.success('Household renamed')
      qc.invalidateQueries({ queryKey: householdKeys.mine })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <fieldset disabled={!online} className="min-w-0 space-y-4 md:space-y-6">
      <Card>
        <CardHeader title="Name" />
        <div className="flex gap-2 p-5 max-md:p-4">
          <Input aria-label="Household name" value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin} />
          {isAdmin && (
            <Button onClick={() => rename.mutate()} disabled={!name.trim() || name === household.name}>
              Rename
            </Button>
          )}
        </div>
      </Card>
      <PeopleSettings />
    </fieldset>
  )
}

/** The name other people see for you on trips. Saved per household, like the rest of the people list. */
function YourName() {
  const { session } = useAuth()
  const { data: people } = usePeople()
  const update = useUpdatePerson()
  const me = people?.find((p) => p.user_id === session?.user.id)
  const [typed, setTyped] = useState<string | null>(null)
  const name = typed ?? me?.name ?? ''

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!me || !name.trim()) return
    update.mutate(
      { id: me.id, name },
      {
        onSuccess: () => {
          toast.success('Name saved')
          setTyped(null)
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <Card>
      <CardHeader title="Your name" />
      <form onSubmit={onSubmit} className="space-y-2 p-5 max-md:p-4">
        <div className="flex gap-2">
          <Input aria-label="Your name" value={name} onChange={(e) => setTyped(e.target.value)} disabled={!me} />
          <Button type="submit" needsOnline disabled={!me || !name.trim() || name.trim() === me.name || update.isPending}>
            Save
          </Button>
        </div>
        <p className="text-xs text-slate-400">How you appear on trips and in the people list.</p>
      </form>
    </Card>
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
            'flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm transition-colors max-md:py-2.5',
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
            'rounded-lg px-4 py-1.5 text-sm transition-colors max-md:px-5 max-md:py-2.5',
            unit === value ? 'bg-white font-medium text-brand-800 shadow-card' : 'text-slate-500 hover:text-slate-800',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

const TIME_FORMAT_OPTIONS: { value: TimeFormat; label: string }[] = [
  { value: '12h', label: '12-hour (3:30 PM)' },
  { value: '24h', label: '24-hour (15:30)' },
]

function TimeFormatPicker() {
  const current = useTimeFormat()
  const set = useSetTimeFormat()
  return (
    <div role="radiogroup" aria-label="Time format" className="inline-flex gap-1 rounded-xl bg-slate-100 p-1">
      {TIME_FORMAT_OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={current === value}
          onClick={() => set.mutate(value, { onError: (e) => toast.error(`Could not save time format: ${e.message}`) })}
          className={cn(
            'rounded-lg px-4 py-1.5 text-sm transition-colors max-md:px-3 max-md:py-2.5',
            current === value ? 'bg-white font-medium text-brand-800 shadow-card' : 'text-slate-500 hover:text-slate-800',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
