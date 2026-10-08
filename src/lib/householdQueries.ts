import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase, unwrap } from './supabase'
import type { MyHousehold } from './types'

// Household membership, shared with the finance app (same tables and RPCs). Kept apart from queries.ts because these
// hooks run before (and above) HouseholdProvider, which queries.ts depends on.

export const householdKeys = {
  /** Kept when switching households; everything else is cleared. */
  mine: ['households'] as const,
}

/** Accepts pending invites first so a newly invited user lands straight in the household. */
export function useMyHouseholds() {
  return useQuery({
    queryKey: householdKeys.mine,
    queryFn: async () => {
      await supabase.rpc('accept_invites')
      return unwrap(await supabase.rpc('my_households')) as MyHousehold[]
    },
  })
}

export function touchHousehold(id: string) {
  void supabase.rpc('touch_household', { p_id: id })
}

export function useCreateHousehold() {
  const qc = useQueryClient()
  return useMutation({
    // Finance categories belong to the finance app; a household started here begins without them.
    mutationFn: async ({ name }: { name: string }) =>
      unwrap(await supabase.rpc('create_household', { p_name: name.trim(), p_seed_categories: false })) as string,
    onSuccess: () => qc.invalidateQueries({ queryKey: householdKeys.mine }),
  })
}

/** Calls an edge function, surfacing the `{ error }` message it returns instead of a generic HTTP error. */
export async function invokeFunction<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error instanceof FunctionsHttpError) {
    const res = (await error.context.json().catch(() => null)) as { error?: string } | null
    throw new Error(res?.error ?? error.message)
  }
  if (error) throw new Error(error.message)
  return data as T
}

/**
 * Invites an email to a household using the finance app's `admin-invite-user` edge function. The invite link lands
 * on this site. If the email already has an account, they're added to the household instead.
 */
export function useInviteUser() {
  return useMutation({
    mutationFn: async (v: { email: string; householdId: string }) =>
      (
        await invokeFunction<{ status: 'invited' | 'added_to_household' }>('admin-invite-user', {
          ...v,
          redirectTo: window.location.origin,
        })
      ).status,
  })
}
