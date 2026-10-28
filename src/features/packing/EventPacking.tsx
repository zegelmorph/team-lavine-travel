import { useMemo, useRef } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { keys, usePackCatalog, usePackCategories, useSaveTripRow, type TripBundle } from '@/lib/queries'
import type { PackItem, TripEvent } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Combobox, type ComboOption } from '@/components/ui/combobox'
import { useOnline } from '@/lib/useOnline'
import { cn } from '@/lib/utils'
import { usePackEventActions } from './eventLinks'
import { availableCatalog, findByName, itemsForEvent, packProgress } from './model'

/**
 * The packing tab of the event dialog: what's being taken to this event. Everything saves as it's done. Pick an item
 * already on the list, a saved item that isn't on it yet (it joins the list too), or type a new one (it goes on the
 * list under Other).
 */
export function EventPacking({ trip, event }: { trip: TripBundle; event: TripEvent }) {
  const online = useOnline()
  const qc = useQueryClient()
  const { data: catalog = [] } = usePackCatalog()
  const { data: categories = [] } = usePackCategories()
  const setPacked = useSaveTripRow<PackItem>('travel_pack_items', trip.id)
  const { addItem, link, unlink } = usePackEventActions(trip.id)
  /** Picks made in quick succession wait their turn, so a second one can't race the first one's inserts. */
  const queue = useRef<Promise<void>>(Promise.resolve())

  const items = useMemo(() => itemsForEvent(trip.packItems, trip.packItemEvents, event.id), [trip.packItems, trip.packItemEvents, event.id])
  const linkId = new Map(trip.packItemEvents.filter((l) => l.event_id === event.id).map((l) => [l.item_id, l.id]))
  const progress = packProgress(items)

  const options: ComboOption[] = useMemo(() => {
    const here = new Set(items.map((i) => i.id))
    const category = new Map(categories.map((c) => [c.id, c.name]))
    return [
      ...trip.packItems
        .filter((i) => !here.has(i.id))
        .map((i) => ({ value: `item:${i.id}`, label: i.name, hint: i.category_id ? category.get(i.category_id) : undefined })),
      ...availableCatalog(catalog, trip.packItems).map((c) => ({ value: `saved:${c.id}`, label: c.name, hint: 'Not on list yet' })),
    ]
  }, [items, trip.packItems, catalog, categories])

  function run(task: () => Promise<void>) {
    queue.current = queue.current.then(task).catch((e: Error) => void toast.error(e.message))
  }

  async function addSaved(id: string) {
    const saved = catalog.find((c) => c.id === id)
    if (!saved) return
    const row = await addItem({ name: saved.name, category_id: saved.category_id, catalog_item_id: saved.id })
    await link(row.id, event.id)
  }

  function pick(value: string | null) {
    if (!value) return
    const [kind, id] = [value.slice(0, value.indexOf(':')), value.slice(value.indexOf(':') + 1)]
    run(async () => {
      if (kind === 'item') await link(id, event.id)
      else await addSaved(id)
    })
  }

  function create(text: string) {
    const name = text.trim()
    if (!name) return
    run(async () => {
      // Looked up when its turn comes, not when it was typed, in case an earlier pick in the queue just added it.
      const latest = qc.getQueryData<TripBundle | null>(keys.trip(trip.id))?.packItems ?? trip.packItems
      const onList = findByName(latest, name)
      if (onList) return link(onList.id, event.id)
      const saved = findByName(catalog, name)
      if (saved) return addSaved(saved.id)
      const row = await addItem({ name, category_id: null })
      await link(row.id, event.id)
    })
  }

  return (
    <div className="space-y-4">
      {online && (
        <div>
          <Combobox
            options={options}
            value={null}
            onChange={pick}
            onCreate={create}
            placeholder="Add something to take to this event"
            openOnFocus
            preferCreate
            stayOnPick
            commitOnLeave={false}
          />
          <p className="mt-1.5 text-xs text-slate-500">Pick from your packing list or saved items, or type a new item to put on the list.</p>
        </div>
      )}
      {items.length === 0 ? (
        <p className="py-6 text-center text-slate-500">Nothing to take to this event yet.</p>
      ) : (
        <>
          <p className="num text-xs text-slate-500">
            {progress.packed} of {progress.total} packed
          </p>
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-1 max-md:py-0.5">
                <label className="flex min-w-0 flex-1 items-center gap-3 py-1 max-md:py-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 max-md:h-5 max-md:w-5"
                    checked={item.packed}
                    disabled={!online}
                    onChange={(e) => setPacked.mutate({ id: item.id, packed: e.target.checked }, { onError: (err) => toast.error(err.message) })}
                  />
                  <span className={cn('min-w-0 flex-1 truncate', item.packed ? 'text-slate-400 line-through' : 'text-slate-800')}>{item.name}</span>
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  needsOnline
                  title="Not taking it to this event"
                  aria-label={`Take ${item.name} off this event`}
                  onClick={() => {
                    const id = linkId.get(item.id)
                    if (id) unlink(id).catch((err: Error) => toast.error(err.message))
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          {online && <p className="text-xs text-slate-500">Taking an item off an event keeps it on the packing list.</p>}
        </>
      )}
    </div>
  )
}
