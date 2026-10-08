import { useMemo, useRef, useState } from 'react'
import { ChevronRight, Minus, Plus, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  useDeleteTripRow,
  usePackCatalog,
  usePackCategories,
  useSaveCatalogItem,
  useSavePackCategory,
  useSaveTripRow,
  useSeedPackCatalog,
  useSetPacked,
  type TripBundle,
} from '@/lib/queries'
import type { PackCatalogItem, PackCategory, PackItem } from '@/lib/types'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Combobox, type ComboOption } from '@/components/ui/combobox'
import { Label } from '@/components/ui/input'
import { useOnline } from '@/lib/useOnline'
import { cn } from '@/lib/utils'
import { availableCatalog, findByName, groupByCategory, packProgress, planPackAdd } from './model'

export function PackingSection({ trip }: { trip: TripBundle }) {
  const { data: categories = [], isSuccess: categoriesLoaded } = usePackCategories()
  const { data: catalog = [], isSuccess: catalogLoaded } = usePackCatalog()
  const seed = useSeedPackCatalog()
  const setPacked = useSetPacked(trip.id)
  const [hidePacked, setHidePacked] = useState(false)
  const online = useOnline()
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const toggle = (key: string) =>
    setCollapsed((s) => {
      const next = new Set(s)
      if (!next.delete(key)) next.add(key)
      return next
    })
  const catalogEmpty = categoriesLoaded && catalogLoaded && categories.length === 0 && catalog.length === 0
  const groups = groupByCategory(trip.packItems, categories)
  const progress = packProgress(trip.packItems)

  return (
    <Card>
      <CardHeader
        title="Packing"
        actions={
          progress.total > 0 && (
            <span className="flex items-center gap-3">
              <span className="num text-xs text-slate-500">
                {progress.packed} of {progress.total} packed
              </span>
              <label className="flex items-center gap-1.5 text-xs text-slate-500 max-md:-my-2 max-md:py-2">
                <input type="checkbox" checked={hidePacked} onChange={(e) => setHidePacked(e.target.checked)} />
                Hide packed
              </label>
            </span>
          )
        }
      />
      <div className={cn('border-b border-slate-100 p-4', !online && progress.total === 0 && 'hidden')}>
        {online && <AddItemForm trip={trip} catalog={catalog} categories={categories} />}
        {online && catalogEmpty && (
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
        {progress.total > 0 && (
          <div className="mt-3 h-2 first:mt-0 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-fill transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="px-5 py-8 text-center text-slate-500">Nothing on the list yet. Add your first item above.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {groups.map((g) => {
            const key = g.category?.id ?? 'other'
            const open = !collapsed.has(key)
            const visible = hidePacked ? g.items.filter((i) => !i.packed) : g.items
            const done = g.items.filter((i) => i.packed).length
            const allPacked = done === g.items.length
            const name = g.category?.name ?? 'Other'
            return (
              <section key={key}>
                <div className="flex items-center hover:bg-slate-50">
                  <h4 className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => toggle(key)}
                      aria-expanded={open}
                      className="flex w-full items-center gap-2 py-2.5 pl-4 pr-2 text-left text-xs font-semibold text-slate-600 max-md:py-3.5 max-md:text-sm"
                    >
                      <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform', open && 'rotate-90')} />
                      <span className="flex-1 truncate">{name}</span>
                      <span className={cn('num font-normal', allPacked ? 'text-brand-700' : 'text-slate-400')}>
                        {done}/{g.items.length}
                      </span>
                    </button>
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    needsOnline
                    className="mr-2 text-xs font-medium text-slate-500"
                    aria-label={`${allPacked ? 'Unpack all' : 'Pack all'} in ${name}`}
                    onClick={() =>
                      setPacked.mutate(
                        { ids: g.items.filter((i) => i.packed === allPacked).map((i) => i.id), packed: !allPacked },
                        { onError: (e) => toast.error(e.message) },
                      )
                    }
                  >
                    {allPacked ? 'Unpack all' : 'Pack all'}
                  </Button>
                </div>
                {open &&
                  (visible.length === 0 ? (
                    <p className="px-4 pb-2.5 pl-10 text-xs text-slate-400 max-md:pl-6">All packed.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100 pb-1.5 pl-10 pr-4 max-md:pl-6 max-md:pr-3">
                      {visible.map((item) => (
                        <PackRow key={item.id} tripId={trip.id} item={item} />
                      ))}
                    </ul>
                  ))}
              </section>
            )
          })}
        </div>
      )}
    </Card>
  )
}

/**
 * Item, then category, then Add. Picking a saved item brings its category along; a new item or category is created
 * in place and saved to the household lists in Settings. The category stays selected for the next item.
 */
function AddItemForm({ trip, catalog, categories }: { trip: TripBundle; catalog: PackCatalogItem[]; categories: PackCategory[] }) {
  const saveItem = useSaveTripRow<PackItem>('travel_pack_items', trip.id)
  const saveCatalogItem = useSaveCatalogItem()
  const saveCategory = useSavePackCategory()
  const [item, setItem] = useState<{ name: string; catalogId: string | null }>({ name: '', catalogId: null })
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const adding = useRef(false)
  /** A category created in the field but not saved yet; Add waits for it. */
  const pendingCategory = useRef<Promise<PackCategory | null> | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Looked up rather than trusted, in case the category was deleted in Settings meanwhile.
  const category = categories.find((c) => c.id === categoryId) ?? null
  const saved = item.catalogId ? catalog.find((c) => c.id === item.catalogId) : undefined
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
  const categoryOptions: ComboOption[] = useMemo(() => categories.map((c) => ({ value: c.id, label: c.name })), [categories])
  const field = (i: number) => formRef.current?.querySelectorAll('input')[i]

  function pickItem(id: string | null) {
    const c = catalog.find((x) => x.id === id)
    setItem(c ? { name: c.name, catalogId: c.id } : { name: '', catalogId: null })
    if (c?.category_id) pickCategory(c.category_id)
  }

  function typeItem(text: string) {
    const name = text.trim()
    const saved = findByName(catalog, name)
    if (saved) pickItem(saved.id)
    else setItem({ name, catalogId: null })
  }

  function createCategory(name: string) {
    // Only the latest choice applies: picking another category while this one saves replaces it.
    const pending: Promise<PackCategory | null> = saveCategory.mutateAsync({ name, sort_order: categories.length + 1 }).then(
      (c) => {
        if (pendingCategory.current !== pending) return c
        pendingCategory.current = null
        setCategoryId(c.id)
        return c
      },
      (e: Error) => {
        toast.error(e.message)
        if (pendingCategory.current === pending) pendingCategory.current = null
        return null
      },
    )
    pendingCategory.current = pending
  }

  function pickCategory(id: string | null) {
    pendingCategory.current = null
    setCategoryId(id)
  }

  async function add() {
    if (adding.current) return
    if (!item.name) {
      field(0)?.focus()
      return
    }
    adding.current = true
    setBusy(true)
    try {
      const pending = pendingCategory.current
      const chosen = pending ? await pending : category
      // A failed save has already said why.
      if (pending && !chosen) return
      if (!chosen) {
        toast.info('Choose a category, or type a new one')
        field(1)?.focus()
        return
      }
      const plan = planPackAdd(catalog, trip.packItems, item, chosen.id)
      if ('duplicate' in plan) {
        toast.info(`${item.name} is already on the list`)
        return
      }
      const entry = 'reuse' in plan ? plan.reuse : await saveCatalogItem.mutateAsync(plan.save)
      await saveItem.mutateAsync({ name: entry.name, category_id: chosen.id, catalog_item_id: entry.id, quantity: entry.default_qty })
      setItem({ name: '', catalogId: null })
      field(0)?.focus()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      adding.current = false
      setBusy(false)
    }
  }

  return (
    <form
      ref={formRef}
      className="grid items-end gap-3 md:grid-cols-[1fr_14rem_auto]"
      onSubmit={(e) => {
        e.preventDefault()
        void add()
      }}
      // cmdk swallows Enter in its inputs, so submit here unless the field's list is taking the key.
      onKeyDown={(e) => {
        const el = e.target as HTMLElement
        if (e.key === 'Enter' && el.tagName === 'INPUT' && el.dataset.open !== 'true') void add()
      }}
    >
      <div>
        <Label>Item</Label>
        <Combobox
          options={itemOptions}
          value={item.catalogId}
          displayLabel={item.name}
          onChange={pickItem}
          onCreate={typeItem}
          placeholder="Pick a saved item or type a new one"
          preferCreate
        />
      </div>
      <div>
        <Label>Category</Label>
        <Combobox
          options={categoryOptions}
          value={category?.id ?? null}
          displayLabel={saveCategory.isPending ? saveCategory.variables?.name : undefined}
          onChange={pickCategory}
          onCreate={createCategory}
          placeholder="Pick or type a new one"
          openOnFocus
          preferCreate
        />
      </div>
      <Button type="submit" disabled={busy}>
        <Plus className="h-4 w-4" /> Add
      </Button>
      {item.name && (
        <p className="text-xs text-slate-500 empty:hidden md:col-span-3">
          {!saved
            ? 'New item. It will also be saved for future trips (manage saved items in Settings).'
            : category && saved.category_id !== category.id
              ? `${saved.name} will also move to ${category.name} in your saved items.`
              : null}
        </p>
      )}
    </form>
  )
}

function PackRow({ tripId, item }: { tripId: string; item: PackItem }) {
  const save = useSaveTripRow<PackItem>('travel_pack_items', tripId)
  const remove = useDeleteTripRow('travel_pack_items', tripId)
  const online = useOnline()
  const update = (patch: Partial<PackItem>) => save.mutate({ id: item.id, ...patch }, { onError: (e) => toast.error(e.message) })

  return (
    <li className="flex items-center gap-3 py-1.5 max-md:py-1">
      <label className="flex min-w-0 flex-1 items-center gap-3 py-1 max-md:py-2">
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 max-md:h-5 max-md:w-5"
          checked={item.packed}
          disabled={!online}
          onChange={(e) => update({ packed: e.target.checked })}
        />
        <span className={cn('min-w-0 flex-1 truncate', item.packed ? 'text-slate-400 line-through' : 'text-slate-800')}>{item.name}</span>
      </label>
      <span className="flex items-center rounded-full bg-slate-100">
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 disabled:opacity-40 max-md:h-10 max-md:w-10"
          disabled={!online || item.quantity <= 1}
          onClick={() => update({ quantity: item.quantity - 1 })}
          aria-label="Fewer"
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="num w-6 text-center text-sm font-medium text-slate-700">{item.quantity}</span>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 disabled:opacity-40 max-md:h-10 max-md:w-10"
          disabled={!online}
          onClick={() => update({ quantity: item.quantity + 1 })}
          aria-label="More"
        >
          <Plus className="h-3 w-3" />
        </button>
      </span>
      <Button
        variant="ghost"
        size="icon"
        needsOnline
        onClick={() => remove.mutate(item.id, { onError: (e) => toast.error(e.message) })}
        title="Remove from list"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </li>
  )
}
