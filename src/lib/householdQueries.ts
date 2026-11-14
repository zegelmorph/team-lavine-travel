import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase, unwrap } from './supabase'
import type { MyHousehold } from './types'

// Which households the signed-in user can use. Households and their members are shared with the finance app; people
// invited from here get travel access only. Kept apart from queries.ts because these hooks run before (and above)
// HouseholdProvider, which queries.ts depends on.

export const householdKeys = {
  /** Kept when switching households; everything else is cleared. */
  mine: ['households'] as const,
}

/**
 * Syncs first: accepts pending household invites and links the user to the people they were invited as, so someone
 * newly invited lands straight in the household.
 */
export function useMyHouseholds() {
  return useQuery({
    queryKey: householdKeys.mine,
    queryFn: async () => {
      const sync = await supabase.rpc('travel_sync_me')
      const households = unwrap(await supabase.rpc('travel_my_households')) as MyHousehold[]
      // A failed sync doesn't lock out someone who already has access. For someone with none it's the likely reason,
      // so they're shown the error rather than told they haven't been invited.
      if (sync.error && households.length === 0) throw new Error(sync.error.message)
      return households
    },
  })
}

export function touchHousehold(id: string) {
  void supabase.rpc('travel_touch_household', { p_id: id })
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
