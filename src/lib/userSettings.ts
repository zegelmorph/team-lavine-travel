import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, unwrap } from './supabase'
import { formatClock, formatHour, formatTime, type TimeFormat } from './dates'
import type { UserSettings } from './types'
import { useAuth } from '@/features/auth/AuthProvider'

/**
 * Per-user preferences, kept in the database so they follow the person across devices. Not scoped to a household,
 * so the household switcher leaves this query alone. The query cache is cleared when a different user signs in.
 */
export const USER_SETTINGS_KEY = 'user-settings'

const DEFAULT_TIME_FORMAT: TimeFormat = '12h'

function useUserSettings() {
  const { session } = useAuth()
  const userId = session?.user.id
  return useQuery({
    queryKey: [USER_SETTINGS_KEY],
    enabled: Boolean(userId),
    queryFn: async () => unwrap(await supabase.from('travel_user_settings').select('*').eq('user_id', userId!).maybeSingle()) as UserSettings | null,
  })
}

export function useTimeFormat(): TimeFormat {
  return useUserSettings().data?.time_format ?? DEFAULT_TIME_FORMAT
}

export function useSetTimeFormat() {
  const qc = useQueryClient()
  const { session } = useAuth()
  const userId = session?.user.id
  return useMutation({
    mutationFn: async (time_format: TimeFormat) => {
      if (!userId) throw new Error('Not signed in')
      unwrap(await supabase.from('travel_user_settings').upsert({ user_id: userId, time_format }, { onConflict: 'user_id' }))
    },
    onMutate: async (time_format) => {
      await qc.cancelQueries({ queryKey: [USER_SETTINGS_KEY] })
      const previous = qc.getQueryData<UserSettings | null>([USER_SETTINGS_KEY])
      const next: UserSettings = { user_id: userId!, time_format }
      qc.setQueryData([USER_SETTINGS_KEY], next)
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      // setQueryData ignores undefined, so a setting that hadn't loaded yet is dropped to be fetched again.
      if (ctx?.previous === undefined) qc.removeQueries({ queryKey: [USER_SETTINGS_KEY] })
      else qc.setQueryData([USER_SETTINGS_KEY], ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: [USER_SETTINGS_KEY] }),
  })
}

/** Time formatters bound to the signed-in user's 12h/24h preference. */
export function useTimeFormatters() {
  const fmt = useTimeFormat()
  return {
    fmt,
    formatTime: useCallback((time: string | null) => formatTime(time, fmt), [fmt]),
    formatClock: useCallback((minutes: number) => formatClock(minutes, fmt), [fmt]),
    formatHour: useCallback((h: number) => formatHour(h, fmt), [fmt]),
  }
}
