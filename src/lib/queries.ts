import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, unwrap } from './supabase'
import { invokeFunction } from './householdQueries'
import { useHousehold } from '@/features/auth/HouseholdProvider'
import type {
  Destination,
  HouseholdMember,
  Lodging,
  PackCatalogItem,
  PackCategory,
  PackItem,
  Participant,
  Transport,
  Trip,
  TripEvent,
  TripSummary,
  WeatherDay,
} from './types'

export { unwrap }

export const keys = {
  trips: (hh: string) => ['trips', hh] as const,
  trip: (tripId: string) => ['trip', tripId] as const,
  weather: (tripId: string) => ['weather', tripId] as const,
  weatherRefresh: (tripId: string) => ['weather-refresh', tripId] as const,
  members: (hh: string) => ['members', hh] as const,
  packCategories: (hh: string) => ['pack-categories', hh] as const,
  packCatalog: (hh: string) => ['pack-catalog', hh] as const,
}

// ---------------------------------------------------------------------------------------------------------------
// Trips
// ---------------------------------------------------------------------------------------------------------------

export function useTrips() {
  const { household } = useHousehold()
  return useQuery({
    queryKey: keys.trips(household.id),
    // Statuses also change on the server (hourly cron), so the sidebar and list re-check now and then.
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('travel_trip_summaries')
          .select('*')
          .eq('household_id', household.id)
          .order('start_date', { ascending: true, nullsFirst: false })
          .order('created_at'),
      ) as TripSummary[],
  })
}

/** Everything on a trip except weather, fetched in one round trip so every tab shares one cache entry. */
export interface TripBundle extends Trip {
  destinations: Destination[]
  participants: Participant[]
  transport: Transport[]
  lodging: Lodging[]
  events: TripEvent[]
  packItems: PackItem[]
}

export function useTrip(tripId: string) {
  return useQuery({
    queryKey: keys.trip(tripId),
    queryFn: async () => {
      const row = unwrap(
        await supabase
          .from('travel_trips')
          .select(
            '*, destinations:travel_destinations(*), participants:travel_participants(*), ' +
              'transport:travel_transport(*), lodging:travel_lodging(*), events:travel_events(*), ' +
              'packItems:travel_pack_items(*)',
          )
          .eq('id', tripId)
          .maybeSingle(),
      ) as TripBundle | null
      if (!row) return null
      row.destinations.sort(
        (a, b) =>
          a.sort_order - b.sort_order ||
          (a.start_date ?? '9999').localeCompare(b.start_date ?? '9999') ||
          a.name.localeCompare(b.name),
      )
      row.participants.sort((a, b) => a.sort_order - b.sort_order || a.display_name.localeCompare(b.display_name))
      row.transport.sort(
        (a, b) =>
          (a.depart_date ?? '9999').localeCompare(b.depart_date ?? '9999') ||
          (a.depart_time ?? '').localeCompare(b.depart_time ?? ''),
      )
      row.lodging.sort((a, b) => a.check_in.localeCompare(b.check_in))
      row.events.sort(
        (a, b) => a.date.localeCompare(b.date) || (a.start_time ?? '').localeCompare(b.start_time ?? ''),
      )
      row.packItems.sort((a, b) => a.created_at.localeCompare(b.created_at))
      return row
    },
  })
}

function useInvalidateTrip(tripId?: string) {
  const qc = useQueryClient()
  const { household } = useHousehold()
  return () => {
    qc.invalidateQueries({ queryKey: keys.trips(household.id) })
    if (tripId) qc.invalidateQueries({ queryKey: keys.trip(tripId) })
  }
}

export function useCreateTrip() {
  const { household } = useHousehold()
  const invalidate = useInvalidateTrip()
  return useMutation({
    mutationFn: async (v: { name: string; status: Trip['status'] }) =>
      unwrap(
        await supabase
          .from('travel_trips')
          .insert({ household_id: household.id, name: v.name.trim(), status: v.status })
          .select()
          .single(),
      ) as Trip,
    onSuccess: invalidate,
  })
}

export function useUpdateTrip(tripId: string) {
  const invalidate = useInvalidateTrip(tripId)
  return useMutation({
    mutationFn: async (patch: Partial<Pick<Trip, 'name' | 'status' | 'status_auto' | 'notes'>>) => {
      unwrap(await supabase.from('travel_trips').update(patch).eq('id', tripId))
    },
    onSuccess: invalidate,
  })
}

export function useDeleteTrip() {
  const qc = useQueryClient()
  const { household } = useHousehold()
  return useMutation({
    mutationFn: async (tripId: string) => {
      unwrap(await supabase.from('travel_trips').delete().eq('id', tripId))
    },
    onSuccess: (_, tripId) => {
      qc.removeQueries({ queryKey: keys.trip(tripId) })
      qc.invalidateQueries({ queryKey: keys.trips(household.id) })
    },
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Rows that belong to a trip. household_id is filled in by a database trigger from trip_id.
// ---------------------------------------------------------------------------------------------------------------

const TRIP_TABLES = {
  travel_destinations: 'destinations',
  travel_participants: 'participants',
  travel_transport: 'transport',
  travel_lodging: 'lodging',
  travel_events: 'events',
  travel_pack_items: 'packItems',
} as const satisfies Record<string, keyof TripBundle>

type TripTable = keyof typeof TRIP_TABLES

/** Tables that feed travel_trip_summaries (dates, destination names, participant count). */
const SUMMARY_TABLES: TripTable[] = ['travel_destinations', 'travel_participants']

/**
 * Shared by every save/delete on a trip's rows. Edits are applied to the cached trip right away; the refetch waits
 * until the last pending edit settles so quick repeated clicks (packing checkboxes, quantity +/-) don't flicker back.
 */
function useTripRowMutation<V, R>(
  table: TripTable,
  tripId: string,
  mutationFn: (v: V) => Promise<R>,
  patch: (rows: { id: string }[], v: V) => { id: string }[],
) {
  const qc = useQueryClient()
  const { household } = useHousehold()
  const field = TRIP_TABLES[table]
  const mutationKey = ['trip-rows', tripId]
  return useMutation({
    mutationKey,
    mutationFn,
    onMutate: async (v: V) => {
      await qc.cancelQueries({ queryKey: keys.trip(tripId) })
      const previous = qc.getQueryData<TripBundle | null>(keys.trip(tripId))
      if (previous) qc.setQueryData(keys.trip(tripId), { ...previous, [field]: patch(previous[field], v) })
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(keys.trip(tripId), ctx.previous)
    },
    onSettled: () => {
      if (SUMMARY_TABLES.includes(table)) qc.invalidateQueries({ queryKey: keys.trips(household.id) })
      // A moved destination's weather is deleted server-side; covers the trip's weather and the trip cards.
      if (table === 'travel_destinations') qc.invalidateQueries({ queryKey: ['weather'] })
      if (qc.isMutating({ mutationKey }) > 1) return
      qc.invalidateQueries({ queryKey: keys.trip(tripId) })
    },
  })
}

/** Inserts when `id` is absent, otherwise updates; resolves to the saved row. */
export function useSaveTripRow<T extends { id: string }>(table: TripTable, tripId: string) {
  return useTripRowMutation(
    table,
    tripId,
    async (row: Partial<T>) => {
      const { id, ...fields } = row as Record<string, unknown>
      const res = id
        ? await supabase.from(table).update(fields).eq('id', id).select().single()
        : await supabase.from(table).insert({ ...fields, trip_id: tripId }).select().single()
      return unwrap(res) as T
    },
    (rows, row) => (row.id ? rows.map((r) => (r.id === row.id ? { ...r, ...row } : r)) : rows),
  )
}

export function useDeleteTripRow(table: TripTable, tripId: string) {
  return useTripRowMutation(
    table,
    tripId,
    async (id: string) => {
      unwrap(await supabase.from(table).delete().eq('id', id))
    },
    (rows, id) => rows.filter((r) => r.id !== id),
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------------------------------------------

export function useWeather(tripId: string, destinationIds: string[]) {
  return useQuery({
    queryKey: [...keys.weather(tripId), destinationIds],
    enabled: destinationIds.length > 0,
    queryFn: async () =>
      unwrap(
        await supabase.from('travel_weather').select('*').in('destination_id', destinationIds).order('date'),
      ) as WeatherDay[],
  })
}

/** Weather for several trips at once, for the trip cards; each row carries its trip id. */
export function useTripsWeather(tripIds: string[]) {
  const { household } = useHousehold()
  return useQuery({
    queryKey: ['weather', 'trips', household.id, tripIds],
    enabled: tripIds.length > 0,
    queryFn: async () => {
      const rows = unwrap(
        await supabase
          .from('travel_weather')
          .select('*, destination:travel_destinations!inner(trip_id)')
          .in('destination.trip_id', tripIds)
          .order('date'),
      ) as (WeatherDay & { destination: { trip_id: string } })[]
      return rows.map(({ destination, ...w }) => ({ ...w, trip_id: destination.trip_id }))
    },
  })
}

export function useRefreshWeather(tripId: string) {
  const qc = useQueryClient()
  const { household } = useHousehold()
  return useMutation({
    mutationKey: keys.weatherRefresh(tripId),
    mutationFn: (v: { destinationId?: string; force?: boolean } = {}) =>
      invokeFunction<{ refreshed: number; errors: string[] }>('travel-weather', { tripId, ...v }),
    onSuccess: (res) => {
      if (res.refreshed > 0) {
        qc.invalidateQueries({ queryKey: keys.weather(tripId) })
        qc.invalidateQueries({ queryKey: ['weather', 'trips', household.id] })
        // Time zones are filled in alongside the weather, and a new time zone can change the trip's status.
        qc.invalidateQueries({ queryKey: keys.trip(tripId) })
        qc.invalidateQueries({ queryKey: keys.trips(household.id) })
      }
    },
  })
}

/** Refreshes stale weather once when a trip opens; the function itself skips anything fetched recently. */
export function useAutoRefreshWeather(tripId: string, enabled: boolean) {
  const { mutate } = useRefreshWeather(tripId)
  useEffect(() => {
    if (enabled) mutate({})
  }, [tripId, enabled, mutate])
}

// ---------------------------------------------------------------------------------------------------------------
// Household members (for participants)
// ---------------------------------------------------------------------------------------------------------------

export function useMembers() {
  const { household } = useHousehold()
  return useQuery({
    queryKey: keys.members(household.id),
    queryFn: async () =>
      unwrap(await supabase.rpc('household_member_list', { p_household_id: household.id })) as HouseholdMember[],
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Packing catalog
// ---------------------------------------------------------------------------------------------------------------

export function usePackCategories() {
  const { household } = useHousehold()
  return useQuery({
    queryKey: keys.packCategories(household.id),
    queryFn: async () =>
      unwrap(
        await supabase
          .from('travel_pack_categories')
          .select('*')
          .eq('household_id', household.id)
          .order('sort_order')
          .order('name'),
      ) as PackCategory[],
  })
}

export function usePackCatalog() {
  const { household } = useHousehold()
  return useQuery({
    queryKey: keys.packCatalog(household.id),
    queryFn: async () =>
      unwrap(
        await supabase.from('travel_pack_catalog').select('*').eq('household_id', household.id).order('name'),
      ) as PackCatalogItem[],
  })
}

function useInvalidateCatalog() {
  const qc = useQueryClient()
  const { household } = useHousehold()
  return () => {
    qc.invalidateQueries({ queryKey: keys.packCategories(household.id) })
    qc.invalidateQueries({ queryKey: keys.packCatalog(household.id) })
  }
}

export function useSeedPackCatalog() {
  const { household } = useHousehold()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: async () => {
      unwrap(await supabase.rpc('travel_seed_pack_catalog', { p_household_id: household.id }))
    },
    onSuccess: invalidate,
  })
}

export function useSavePackCategory() {
  const { household } = useHousehold()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: async (v: { id?: string; name: string; sort_order?: number }) => {
      const res = v.id
        ? await supabase.from('travel_pack_categories').update({ name: v.name.trim() }).eq('id', v.id).select().single()
        : await supabase
            .from('travel_pack_categories')
            .insert({ household_id: household.id, name: v.name.trim(), sort_order: v.sort_order ?? 100 })
            .select()
            .single()
      return unwrap(res) as PackCategory
    },
    onSuccess: invalidate,
  })
}

export function useDeletePackCategory() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await supabase.from('travel_pack_categories').delete().eq('id', id))
    },
    onSuccess: invalidate,
  })
}

export function useSaveCatalogItem() {
  const { household } = useHousehold()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: async (v: { id?: string; name: string; category_id: string | null; default_qty: number }) => {
      const fields = { name: v.name.trim(), category_id: v.category_id, default_qty: v.default_qty }
      const res = v.id
        ? await supabase.from('travel_pack_catalog').update(fields).eq('id', v.id).select().single()
        : await supabase
            .from('travel_pack_catalog')
            .insert({ ...fields, household_id: household.id })
            .select()
            .single()
      return unwrap(res) as PackCatalogItem
    },
    onSuccess: invalidate,
  })
}

export function useDeleteCatalogItem() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await supabase.from('travel_pack_catalog').delete().eq('id', id))
    },
    onSuccess: invalidate,
  })
}
