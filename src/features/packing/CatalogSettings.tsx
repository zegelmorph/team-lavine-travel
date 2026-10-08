import { useState, type FormEvent } from 'react'
import { Plus, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  useDeleteCatalogItem,
  useDeletePackCategory,
  usePackCatalog,
  usePackCategories,
  useSaveCatalogItem,
  useSavePackCategory,
  useSeedPackCatalog,
} from '@/lib/queries'
import type { PackCatalogItem, PackCategory } from '@/lib/types'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { confirmAction } from '@/components/ui/confirm'
import { NotSavedOffline } from '@/components/Offline'
import { useOnline } from '@/lib/useOnline'
import { groupByCategory } from './model'

/** Household packing catalog: the categories and items offered when building a trip's list. */
export function CatalogSettings() {
  const { data: categories = [], isPending, isPaused } = usePackCategories()
  const online = useOnline()
  const { data: catalog = [] } = usePackCatalog()
  const saveCategory = useSavePackCategory()
  const seed = useSeedPackCatalog()
  const [newCategory, setNewCategory] = useState('')
  const groups = groupByCategory(catalog, categories)
  // Empty categories still need a card so items can be added to them.
  const shown = [
    ...categories
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map((c) => ({ category: c as PackCategory | null, items: groups.find((g) => g.category?.id === c.id)?.items ?? [] })),
    ...groups.filter((g) => g.category === null),
  ]

  function addCategory(e: FormEvent) {
    e.preventDefault()
    if (!newCategory.trim()) return
    saveCategory.mutate(
      { name: newCategory, sort_order: categories.length + 1 },
      { onSuccess: () => setNewCategory(''), onError: (err) => toast.error(err.message) },
    )
  }

  if (isPending) return isPaused ? <NotSavedOffline /> : <p className="text-slate-400">Loading...</p>

  return (
    <fieldset disabled={!online} className="min-w-0 space-y-4 md:space-y-6">
      <Card>
        <CardHeader
          title="Categories"
          actions={
            <Button
              variant="outline"
              size="sm"
              disabled={seed.isPending}
              onClick={() =>
                seed.mutate(undefined, {
                  onSuccess: () => toast.success('Starter items added'),
                  onError: (err) => toast.error(err.message),
                })
              }
              title="Adds any starter categories and items you don't already have"
            >
              <Sparkles className="h-3.5 w-3.5" /> Add starter items
            </Button>
          }
        />
        <form onSubmit={addCategory} className="flex gap-2 p-4">
          <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category" />
          <Button type="submit" variant="outline" disabled={!newCategory.trim() || saveCategory.isPending}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </form>
      </Card>

      {shown.map((g) => (
        <CategoryCard key={g.category?.id ?? 'other'} category={g.category} items={g.items} categories={categories} />
      ))}
    </fieldset>
  )
}

function CategoryCard({
  category,
  items,
  categories,
}: {
  category: PackCategory | null
  items: PackCatalogItem[]
  categories: PackCategory[]
}) {
  const saveCategory = useSavePackCategory()
  const removeCategory = useDeletePackCategory()
  const saveItem = useSaveCatalogItem()
  const [name, setName] = useState(category?.name ?? '')
  const [newItem, setNewItem] = useState('')

  function rename() {
    if (!category || !name.trim() || name.trim() === category.name) return setName(category?.name ?? '')
    saveCategory.mutate({ id: category.id, name }, { onError: (e) => toast.error(e.message) })
  }

  async function onDelete() {
    if (!category) return
    const ok = await confirmAction({
      title: `Delete ${category.name}?`,
      message: 'Its items stay in the catalog and on packing lists, filed under Other.',
    })
    if (ok) removeCategory.mutate(category.id, { onError: (e) => toast.error(e.message) })
  }

  function addItem(e: FormEvent) {
    e.preventDefault()
    if (!newItem.trim()) return
    saveItem.mutate(
      { name: newItem, category_id: category?.id ?? null, default_qty: 1 },
      { onSuccess: () => setNewItem(''), onError: (err) => toast.error(err.message) },
    )
  }

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
        {category ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            aria-label="Category name"
            className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-sm font-semibold max-md:py-1.5 max-md:text-base text-slate-800 outline-none hover:bg-slate-50 focus:bg-slate-50 focus:ring-2 focus:ring-brand-500/20"
          />
        ) : (
          <span className="flex-1 px-1 text-sm font-semibold text-slate-800">Other</span>
        )}
        <span className="num text-xs text-slate-400">{items.length}</span>
        {category && (
          <Button variant="ghost" size="icon" onClick={onDelete} title="Delete category">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <ul className="divide-y divide-slate-100">
        {items.map((item) => (
          <CatalogRow key={item.id} item={item} categories={categories} />
        ))}
      </ul>
      <form onSubmit={addItem} className="flex gap-2 p-3">
        <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add an item" />
        <Button type="submit" variant="ghost" disabled={!newItem.trim() || saveItem.isPending}>
          <Plus className="h-4 w-4" />
        </Button>
      </form>
    </Card>
  )
}

function CatalogRow({ item, categories }: { item: PackCatalogItem; categories: PackCategory[] }) {
  const save = useSaveCatalogItem()
  const remove = useDeleteCatalogItem()
  const [name, setName] = useState(item.name)
  const update = (patch: Partial<PackCatalogItem>) =>
    save.mutate(
      { id: item.id, name: item.name, category_id: item.category_id, default_qty: item.default_qty, ...patch },
      { onError: (e) => toast.error(e.message) },
    )

  return (
    <li className="flex items-center gap-2 px-4 py-1.5 max-md:flex-wrap max-md:gap-y-1 max-md:py-2.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => (name.trim() && name.trim() !== item.name ? update({ name }) : setName(item.name))}
        aria-label="Item name"
        className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-1 text-sm text-slate-800 outline-none max-md:basis-full max-md:text-base hover:bg-slate-50 focus:bg-slate-50 focus:ring-2 focus:ring-brand-500/20"
      />
      <label className="flex items-center gap-1 text-xs text-slate-400" title="Default quantity">
        <span className="md:hidden">Qty</span>
        <span className="max-md:hidden">×</span>
        <input
          type="number"
          min={1}
          value={item.default_qty}
          onChange={(e) => {
            const qty = Math.max(1, Math.floor(Number(e.target.value) || 1))
            if (qty !== item.default_qty) update({ default_qty: qty })
          }}
          className="num h-7 w-12 rounded-md border border-slate-200 bg-field px-1.5 text-sm text-slate-700 max-md:h-9 max-md:w-14 max-md:text-base"
        />
      </label>
      <Select
        aria-label="Category"
        value={item.category_id ?? ''}
        onChange={(e) => update({ category_id: e.target.value || null })}
        className="h-7 w-32 text-xs max-md:h-9 max-md:min-w-0 max-md:flex-1"
      >
        <option value="">Other</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Button variant="ghost" size="icon" onClick={() => remove.mutate(item.id, { onError: (e) => toast.error(e.message) })} title="Delete item">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </li>
  )
}
