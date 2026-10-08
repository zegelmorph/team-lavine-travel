import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { householdKeys, touchHousehold, useCreateHousehold, useMyHouseholds } from '@/lib/householdQueries'
import type { MyHousehold } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { AuthShell } from '@/components/AuthShell'
import { useAuth } from './AuthProvider'

interface HouseholdState {
  household: MyHousehold
  households: MyHousehold[]
  switchHousehold: (id: string) => void
}

const HouseholdContext = createContext<HouseholdState | null>(null)

/**
 * Resolves which household the app is working in. `my_households()` is ordered by last access, so the first
 * row is where the user left off. With several households and none accessed yet, the user picks one.
 */
export function HouseholdProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: households, isPending, isPaused, error, refetch, isFetching } = useMyHouseholds()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const touched = useRef<string | null>(null)

  const list = households ?? []
  const household =
    list.find((h) => h.id === selectedId) ??
    (list.length === 1 || list[0]?.last_accessed_at ? list[0] : undefined)

  // Pin the resolved household so a refetch that reorders by last access can't switch it underneath the user.
  // If the pinned one vanished (deleted or access removed), treat the fallback as a full switch.
  useEffect(() => {
    if (!household) return
    if (selectedId !== household.id) {
      setSelectedId(household.id)
      if (selectedId) {
        queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== householdKeys.mine[0] })
        navigate('/', { replace: true })
      }
    }
    if (touched.current !== household.id) {
      touched.current = household.id
      touchHousehold(household.id)
    }
  }, [household, selectedId, queryClient, navigate])

  function select(id: string) {
    if (id === household?.id) return
    setSelectedId(id)
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== householdKeys.mine[0] })
    navigate('/', { replace: true })
  }

  if (isPending && isPaused) return <FullPageMessage text="You're offline and nothing is saved on this device yet. Travel will load once you're back online." />
  if (isPending) return <FullPageMessage text="Loading..." />
  if (error) return <FullPageMessage text={`Could not load households: ${(error as Error).message}`} />

  if (list.length === 0) {
    return <NoHousehold onCreated={select} onCheckAgain={() => refetch()} checking={isFetching} />
  }
  if (!household) return <HouseholdPicker households={list} onPick={select} />

  return (
    <HouseholdContext.Provider value={{ household, households: list, switchHousehold: select }}>
      {children}
    </HouseholdContext.Provider>
  )
}

export function useHousehold() {
  const ctx = useContext(HouseholdContext)
  if (!ctx) throw new Error('useHousehold must be used inside HouseholdProvider')
  return ctx
}

function FullPageMessage({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center bg-slate-50 text-slate-400">{text}</div>
}

function SignOutLink() {
  return (
    <div className="mt-5 flex justify-center text-xs font-medium text-slate-500">
      <button type="button" onClick={() => supabase.auth.signOut()} className="hover:text-slate-800">
        Sign out
      </button>
    </div>
  )
}

function NoHousehold({
  onCreated,
  onCheckAgain,
  checking,
}: {
  onCreated: (id: string) => void
  onCheckAgain: () => Promise<unknown>
  checking: boolean
}) {
  const { session } = useAuth()
  const [checked, setChecked] = useState(false)
  return (
    <AuthShell title="Set up your household">
      <CreateHouseholdForm onCreated={onCreated} />
      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        or
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      <div className="rounded-xl bg-slate-50 p-4">
        <p className="font-medium text-slate-800">Joining someone else's household?</p>
        <p className="mt-1 text-slate-500">
          Ask the household owner to invite{' '}
          <span className="font-medium text-slate-700">{session?.user.email ?? 'your email'}</span> from their
          settings, then check again.
        </p>
        <Button
          variant="outline"
          className="mt-3 w-full"
          disabled={checking}
          onClick={() => onCheckAgain().then(() => setChecked(true))}
        >
          {checking ? 'Checking...' : 'Check again'}
        </Button>
        {checked && !checking && <p className="mt-2 text-xs text-slate-500">No invites for this email yet.</p>}
      </div>
      <SignOutLink />
    </AuthShell>
  )
}

function HouseholdPicker({ households, onPick }: { households: MyHousehold[]; onPick: (id: string) => void }) {
  return (
    <AuthShell title="Choose a household">
      <ul className="space-y-2">
        {households.map((h) => (
          <li key={h.id}>
            <button
              onClick={() => onPick(h.id)}
              className="group flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/60"
            >
              <span>
                <span className="block font-medium text-slate-900">{h.name}</span>
                <span className="block text-xs capitalize text-slate-500">{h.role}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-slate-400 transition-colors group-hover:text-brand-700" />
            </button>
          </li>
        ))}
      </ul>
      <SignOutLink />
    </AuthShell>
  )
}

function CreateHouseholdForm({ onCreated }: { onCreated: (id: string) => void }) {
  const create = useCreateHousehold()
  const [name, setName] = useState('')

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (name.trim()) create.mutate({ name }, { onSuccess: onCreated })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor="hh">Household name</Label>
        <Input id="hh" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Team Lavine" />
      </div>
      {create.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{create.error.message}</p>}
      <Button type="submit" className="w-full" disabled={create.isPending}>
        Create household
      </Button>
    </form>
  )
}
