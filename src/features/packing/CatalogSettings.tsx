import { useMemo, useRef, useState } from 'react'
import { ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useDeleteCatalogItem, usePackCatalog, usePackCategories, useSaveCatalogItem, useSavePackCategory } from '@/lib/queries'
import type { PackCatalogItem, PackCategory } from '@/lib/types'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Combobox, type ComboOption } from '@/components/ui/combobox'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'
import { confirmAction } from '@/components/ui/confirm'
import { NotSavedOffline } from '@/components/Offline'
import { useOnline } from '@/lib/useOnline'
import { cn } from '@/lib/utils'
import { findByName, groupByCategory } from './model'

const LISTS = {
  packing: {
    title: 'Packing items',
    empty: 'No packing items yet. Add things you often bring, like clothes, toiletries and chargers.',
  },
  cabinet: {
    title: 'Travel cabinet',
    empty: 'Nothing in the cabinet yet. Add what you keep in it, like adapters, first aid or travel-size toiletries.',
  },
}

type ListKind = keyof typeof LISTS

/**
 * One of the household's two lookup lists, grouped by category: packing items (offered when adding to a trip's list)
 * or the travel cabinet (offered as a checklist on every trip). Categories are shared by both.
 */
export function CatalogSettings({ list }: { list: ListKind }) {
  const { data: categories = [], isPending, isPaused } = usePackCategories()
  const { data: catalog = [] } = usePackCatalog()
  const online = useOnline()
  const cabinet = list === 'cabinet'
  const items = catalog.filter((c) => c.in_cabinet === cabinet)
  const groups = groupByCategory(items, categories)
  const [editing, setEditing] = useState<PackCatalogItem | 'new' | null>(null)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const toggle = (key: string) =>
    setCollapsed((s) => {
      const next = new Set(s)
      if (!next.delete(key)) next.add(key)
      return next
    })

  if (isPending) return isPaused ? <NotSavedOffline /> : <p className="text-slate-400">Loading...</p>

  return (
    <fieldset disabled={!online} className="min-w-0">
      <Card>
        <CardHeader
          title={LISTS[list].title}
          actions={
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          }
        />
        {groups.length === 0 ? (
          <p className="px-5 py-8 text-center text-slate-500">{LISTS[list].empty}</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {groups.map((g) => {
              const key = g.category?.id ?? 'other'
              const open = !collapsed.has(key)
              return (
                <section key={key}>
                  <CategoryHeading category={g.category} open={open} onToggle={() => toggle(key)} />
                  {open && (
                    <ul className="pb-1.5 pl-6 max-md:pl-4">
                      {g.items.map((item) => (
                        <ItemRow key={item.id} item={item} onEdit={() => setEditing(item)} />
                      ))}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </Card>
      {editing && (
        <ItemDialog item={editing === 'new' ? null : editing} list={list} items={items} categories={categories} onClose={() => setEditing(null)} />
      )}
    </fieldset>
  )
}

/** Toggles the category open or closed. The pencil renames it, which applies to both lists. */
function CategoryHeading({ category, open, onToggle }: { category: PackCategory | null; open: boolean; onToggle: () => void }) {
  const save = useSavePackCategory()
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(category?.name ?? '')
  const label = category?.name ?? 'Other'

  function rename() {
    setRenaming(false)
    if (!category || !name.trim() || name.trim() === category.name) return setName(category?.name ?? '')
    save.mutate({ id: category.id, name }, { onError: (e) => toast.error(e.message) })
  }

  if (renaming)
    return (
      <div className="px-4 py-1.5 max-md:px-3">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') {
              setName(category?.name ?? '')
              setRenaming(false)
            }
          }}
          aria-label="Category name"
        />
      </div>
    )
  return (
    <h4 className="group flex items-center text-xs font-semibold text-slate-600 hover:bg-slate-50 max-md:text-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-w-0 items-center gap-2 py-2.5 pl-4 pr-1 text-left max-md:py-3.5 max-md:pl-3"
      >
        <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform', open && 'rotate-90')} />
        <span className="truncate uppercase tracking-wide">{label}</span>
      </button>
      {category && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-slate-400 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
          onClick={() => setRenaming(true)}
          title={`Rename ${label}`}
        >
          <Pencil className="h-3 w-3" />
        </Button>
      )}
      {/* The rest of the row toggles too; the labelled button above is the one for keyboard and screen readers. */}
      <button type="button" tabIndex={-1} aria-hidden onClick={onToggle} className="flex-1 self-stretch" />
    </h4>
  )
}

function ItemRow({ item, onEdit }: { item: PackCatalogItem; onEdit: () => void }) {
  const remove = useDeleteCatalogItem()
  return (
    <li className="flex items-center gap-1 px-4 max-md:px-3">
      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 truncate rounded-md px-1 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-50 max-md:py-2.5 max-md:text-base"
      >
        {item.name}
      </button>
      <Button
        variant="ghost"
        size="icon"
        disabled={remove.isPending}
        onClick={async () => {
          const ok = await confirmAction({ title: `Delete ${item.name}?`, message: 'Trip lists that already have it keep it.' })
          if (ok) remove.mutate(item.id, { onError: (e) => toast.error(e.message) })
        }}
        title={`Delete ${item.name}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </li>
  )
}

/** Add or edit an item. The category can be picked or typed; a typed one is created when the item is saved. */
function ItemDialog({
  item,
  list,
  items,
  categories,
  onClose,
}: {
  item: PackCatalogItem | null
  list: ListKind
  items: PackCatalogItem[]
  categories: PackCategory[]
  onClose: () => void
}) {
  const saveItem = useSaveCatalogItem()
  const saveCategory = useSavePackCategory()
  const [name, setName] = useState(item?.name ?? '')
  const initial = categories.find((c) => c.id === item?.category_id)
  const [category, setCategory] = useState<{ id: string | null; name: string }>({ id: initial?.id ?? null, name: initial?.name ?? '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const options: ComboOption[] = useMemo(() => categories.map((c) => ({ value: c.id, label: c.name })), [categories])
  const newCategory = !category.id && category.name.trim() !== '' && !findByName(categories, category.name)

  async function save() {
    if (saving.current) return
    const trimmed = name.trim()
    if (!trimmed) return setError('Enter a name.')
    const others = items.filter((i) => i.id !== item?.id)
    if (findByName(others, trimmed)) return setError(`${trimmed} is already in ${LISTS[list].title.toLowerCase()}.`)
    saving.current = true
    setBusy(true)
    setError(null)
    try {
      // Looked up rather than trusted, in case the category was deleted elsewhere meanwhile; it's then recreated by name.
      const categoryId =
        categories.find((c) => c.id === category.id)?.id ??
        (category.name.trim()
          ? (findByName(categories, category.name)?.id ??
            (await saveCategory.mutateAsync({ name: category.name, sort_order: categories.length + 1 })).id)
          : null)
      await saveItem.mutateAsync({ id: item?.id, name: trimmed, category_id: categoryId, in_cabinet: list === 'cabinet' })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent title={item ? 'Edit item' : `Add to ${LISTS[list].title.toLowerCase()}`} className="max-w-md">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
          // cmdk swallows Enter in its input, so submit here unless its list is taking the key.
          onKeyDown={(e) => {
            const el = e.target as HTMLElement
            if (e.key === 'Enter' && el.hasAttribute('cmdk-input') && el.dataset.open !== 'true') void save()
          }}
        >
          <div>
            <Label htmlFor="catalog-item-name">Item</Label>
            <Input id="catalog-item-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Phone charger" />
          </div>
          <div>
            <Label>Category</Label>
            <Combobox
              options={options}
              value={category.id}
              displayLabel={category.name}
              onChange={(id, opt) => setCategory(id && opt ? { id, name: opt.label } : { id: null, name: '' })}
              onCreate={(text) => setCategory({ id: null, name: text })}
              placeholder="Pick or type a new one"
              openOnFocus
              preferCreate
            />
            {(newCategory || !category.name.trim()) && (
              <p className="mt-1.5 text-xs text-slate-500">
                {newCategory ? `${category.name.trim()} will be added as a new category.` : 'Leave blank to file it under Other.'}
              </p>
            )}
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
          {/* Save comes first in tab order, so Enter after picking a category saves rather than cancels. */}
          <div className="flex flex-row-reverse justify-start gap-2">
            <Button type="submit" needsOnline disabled={busy}>
              {item ? 'Save' : 'Add'}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
