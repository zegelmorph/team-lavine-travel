import { useMemo, useState } from 'react'
import { Minus, Plus, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  useDeleteTripRow,
  usePackCatalog,
  usePackCategories,
  useSaveCatalogItem,
  useSavePackCategory,
  useSaveTripRow,
  useSeedPackCatalog,
  type TripBundle,
} from '@/lib/queries'
import type { PackItem } from '@/lib/types'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Combobox, type ComboOption } from '@/components/ui/combobox'
import { Label } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { availableCatalog, groupByCategory, packProgress } from './model'

export function PackingTab({ trip }: { trip: TripBundle }) {
  const { data: categories = [], isSuccess: categoriesLoaded } = usePackCategories()
  const { data: catalog = [], isSuccess: catalogLoaded } = usePackCatalog()
  const seed = useSeedPackCatalog()
  const saveItem = useSaveTripRow<PackItem>('travel_pack_items', trip.id)
  const saveCatalogItem = useSaveCatalogItem()
  const saveCategory = useSavePackCategory()
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [saveToCatalog, setSaveToCatalog] = useState(true)
  const [hidePacked, setHidePacked] = useState(false)
  const catalogEmpty = categoriesLoaded && catalogLoaded && categories.length === 0 && catalog.length === 0

  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  const itemOptions: ComboOption[] = useMemo(
    () =>
      availableCatalog(catalog, trip.packItems).map((c) => ({
        value: c.id,
        label: c.name,
        hint: c.category_id ? categoryName.get(c.category_id) : undefined,
      })),
    [catalog, trip.packItems, categoryName],
  )
  const categoryOptions: ComboOption[] = categories.map((c) => ({ value: c.id, label: c.name }))
  const groups = groupByCategory(trip.packItems, categories)
  const progress = packProgress(trip.packItems)

  function addFromCatalog(id: string | null) {
    const c = catalog.find((x) => x.id === id)
    if (!c) return
    saveItem.mutate(
      { catalog_item_id: c.id, category_id: c.category_id, name: c.name, quantity: c.default_qty },
      { onError: (e) => toast.error(e.message) },
    )
  }

  async function addNew(name: string) {
    const key = name.trim().toLowerCase()
    if (trip.packItems.some((i) => i.name.trim().toLowerCase() === key)) {
      toast.info(`${name} is already on the list`)
      return
    }
    try {
      const existing = catalog.find((c) => c.name.trim().toLowerCase() === key)
      const linked =
        existing ??
        (saveToCatalog ? await saveCatalogItem.mutateAsync({ name, category_id: categoryId, default_qty: 1 }) : null)
      await saveItem.mutateAsync({ name, category_id: categoryId, catalog_item_id: linked?.id ?? null, quantity: 1 })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  function createCategory(name: string) {
    saveCategory.mutate(
      { name, sort_order: categories.length + 1 },
      { onSuccess: (c) => setCategoryId(c.id), onError: (e) => toast.error(e.message) },
    )
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_14rem]">
          <div>
            <Label>Add an item</Label>
            <Combobox
              options={itemOptions}
              value={null}
              onChange={addFromCatalog}
              onCreate={(text) => void addNew(text)}
              placeholder="Search the catalog or type something new"
            />
          </div>
          <div>
            <Label>Category for new items</Label>
            <Combobox
              options={categoryOptions}
              value={categoryId}
              onChange={setCategoryId}
              onCreate={createCategory}
              placeholder="Other"
              openOnFocus
            />
          </div>
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <input type="checkbox" checked={saveToCatalog} onChange={(e) => setSaveToCatalog(e.target.checked)} />
          Also save new items to the household catalog for next time
        </label>
        {catalogEmpty && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
            Your household catalog is empty. Start with common items like clothes, toiletries and documents?
            <Button
              size="sm"
              variant="outline"
              disabled={seed.isPending}
              onClick={() => seed.mutate(undefined, { onError: (e) => toast.error(e.message) })}
            >
              <Sparkles className="h-3.5 w-3.5" /> Add starter items
            </Button>
          </div>
        )}
      </Card>

      {progress.total > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-1">
          <div className="h-2 min-w-40 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-fill transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
          <span className="num text-sm text-slate-600">
            {progress.packed} of {progress.total} packed
          </span>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <input type="checkbox" checked={hidePacked} onChange={(e) => setHidePacked(e.target.checked)} />
            Hide packed
          </label>
        </div>
      )}

      {groups.length === 0 ? (
        <Card className="px-6 py-12 text-center text-slate-500">
          Nothing on the list yet. Start typing above to pick from the catalog.
        </Card>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2">
          {groups.map((g) => {
            const visible = hidePacked ? g.items.filter((i) => !i.packed) : g.items
            const done = g.items.filter((i) => i.packed).length
            return (
              <Card key={g.category?.id ?? 'other'}>
                <CardHeader
                  title={g.category?.name ?? 'Other'}
                  actions={<span className="num text-xs text-slate-400">{done}/{g.items.length}</span>}
                />
                {visible.length === 0 ? (
                  <p className="px-5 py-3 text-xs text-slate-400">All packed.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {visible.map((item) => (
                      <PackRow key={item.id} tripId={trip.id} item={item} />
                    ))}
                  </ul>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PackRow({ tripId, item }: { tripId: string; item: PackItem }) {
  const save = useSaveTripRow<PackItem>('travel_pack_items', tripId)
  const remove = useDeleteTripRow('travel_pack_items', tripId)
  const update = (patch: Partial<PackItem>) =>
    save.mutate({ id: item.id, ...patch }, { onError: (e) => toast.error(e.message) })

  return (
    <li className="flex items-center gap-3 px-4 py-2">
      <input
        type="checkbox"
        className="h-4 w-4"
        checked={item.packed}
        onChange={(e) => update({ packed: e.target.checked })}
        aria-label={`Packed ${item.name}`}
      />
      <span className={cn('min-w-0 flex-1 truncate', item.packed ? 'text-slate-400 line-through' : 'text-slate-800')}>
        {item.name}
      </span>
      <span className="flex items-center rounded-full bg-slate-100">
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 disabled:opacity-40"
          disabled={item.quantity <= 1}
          onClick={() => update({ quantity: item.quantity - 1 })}
          aria-label="Fewer"
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="num w-6 text-center text-sm font-medium text-slate-700">{item.quantity}</span>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200"
          onClick={() => update({ quantity: item.quantity + 1 })}
          aria-label="More"
        >
          <Plus className="h-3 w-3" />
        </button>
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => remove.mutate(item.id, { onError: (e) => toast.error(e.message) })}
        title="Remove from list"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </li>
  )
}
