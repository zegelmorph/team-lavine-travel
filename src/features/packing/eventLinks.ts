import { useQueryClient } from '@tanstack/react-query'
import { keys, useDeleteTripRow, useSaveTripRow, type TripBundle } from '@/lib/queries'
import type { PackItem, PackItemEvent } from '@/lib/types'

/**
 * Creating packing items and linking them to events. Inserts aren't optimistic, so each new row is added to the
 * cached trip as soon as it's saved; otherwise the field would clear a beat before the item shows up.
 */
export function usePackEventActions(tripId: string) {
  const qc = useQueryClient()
  const saveItem = useSaveTripRow<PackItem>('travel_pack_items', tripId)
  const saveLink = useSaveTripRow<PackItemEvent>('travel_pack_item_events', tripId)
  const removeLink = useDeleteTripRow('travel_pack_item_events', tripId)

  function append<K extends 'packItems' | 'packItemEvents'>(field: K, row: TripBundle[K][number]) {
    qc.setQueryData<TripBundle | null>(keys.trip(tripId), (trip) =>
      trip && !trip[field].some((r) => r.id === row.id) ? { ...trip, [field]: [...trip[field], row] } : trip,
    )
  }

  return {
    async addItem(fields: Pick<PackItem, 'name' | 'category_id'> & Partial<Pick<PackItem, 'catalog_item_id'>>) {
      const row = await saveItem.mutateAsync({ ...fields, quantity: 1 })
      append('packItems', row)
      return row
    },
    /** Already linked (here, or by someone else a moment ago) counts as done. */
    async link(itemId: string, eventId: string) {
      const trip = qc.getQueryData<TripBundle | null>(keys.trip(tripId))
      if (trip?.packItemEvents.some((l) => l.item_id === itemId && l.event_id === eventId)) return
      try {
        append('packItemEvents', await saveLink.mutateAsync({ item_id: itemId, event_id: eventId }))
      } catch (e) {
        if (!/duplicate key/i.test((e as Error).message)) throw e
      }
    },
    unlink: (linkId: string) => removeLink.mutateAsync(linkId),
  }
}
