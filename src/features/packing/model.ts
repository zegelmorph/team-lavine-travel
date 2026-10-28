import type { PackCatalogItem, PackCategory, PackItem, PackItemEvent } from '@/lib/types'

export interface PackGroup<T> {
  category: PackCategory | null
  items: T[]
}

/** Items grouped by category in the household's category order, with uncategorized items last under "Other". */
export function groupByCategory<T extends { category_id: string | null; name: string }>(items: T[], categories: PackCategory[]): PackGroup<T>[] {
  const known = new Map(categories.map((c) => [c.id, c]))
  const groups = new Map<string | null, T[]>()
  for (const item of items) {
    const key = item.category_id && known.has(item.category_id) ? item.category_id : null
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  const ordered: PackGroup<T>[] = [...categories]
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .filter((c) => groups.has(c.id))
    .map((c) => ({ category: c, items: groups.get(c.id)! }))
  if (groups.has(null)) ordered.push({ category: null, items: groups.get(null)! })
  for (const g of ordered) g.items.sort((a, b) => a.name.localeCompare(b.name))
  return ordered
}

export function packProgress(items: Pick<PackItem, 'packed'>[]): { packed: number; total: number; percent: number } {
  const packed = items.filter((i) => i.packed).length
  const total = items.length
  return { packed, total, percent: total ? Math.round((packed / total) * 100) : 0 }
}

/** The entry with this name, ignoring case and surrounding spaces. */
export function findByName<T extends { name: string }>(items: T[], name: string): T | undefined {
  const key = name.trim().toLowerCase()
  return key ? items.find((i) => i.name.trim().toLowerCase() === key) : undefined
}

export interface CatalogSave {
  id?: string
  name: string
  category_id: string
}

/**
 * How to add an item to the trip: reuse its saved entry as is, or save it first (a new item, or a saved one moved to
 * another category, since the saved list remembers each item's latest category).
 */
export function planPackAdd(
  catalog: PackCatalogItem[],
  onList: (Pick<PackItem, 'name'> & Partial<Pick<PackItem, 'catalog_item_id'>>)[],
  draft: { name: string; catalogId: string | null },
  categoryId: string,
): { duplicate: true } | { reuse: PackCatalogItem } | { save: CatalogSave } {
  if (findByName(onList, draft.name)) return { duplicate: true }
  const saved = (draft.catalogId && catalog.find((c) => c.id === draft.catalogId)) || findByName(catalog, draft.name)
  // A list item renamed since it was added no longer matches its saved item by name, but it is still that item.
  if (saved && onList.some((i) => i.catalog_item_id === saved.id)) return { duplicate: true }
  if (saved && saved.category_id === categoryId) return { reuse: saved }
  return { save: { id: saved?.id, name: saved?.name ?? draft.name.trim(), category_id: categoryId } }
}

/**
 * Renaming an item on the trip's list. Only this list entry changes (the household's saved item keeps its name), and a
 * name already on the list is refused, as it is when adding.
 */
export function planPackRename(
  onList: Pick<PackItem, 'id' | 'name'>[],
  id: string,
  newName: string,
): { unchanged: true } | { duplicate: true } | { rename: string } {
  const name = newName.trim()
  if (!name) return { unchanged: true }
  const current = onList.find((i) => i.id === id)
  if (current && current.name === name) return { unchanged: true }
  const key = name.toLowerCase()
  if (onList.some((i) => i.id !== id && i.name.trim().toLowerCase() === key)) return { duplicate: true }
  return { rename: name }
}

/** Travel cabinet items still to consider for this trip: in the cabinet and not on the list yet. */
export function cabinetToReview(catalog: PackCatalogItem[], items: Pick<PackItem, 'catalog_item_id' | 'name'>[]) {
  return availableCatalog(
    catalog.filter((c) => c.in_cabinet),
    items,
  )
}

/** Catalog items not already on the list (matched by catalog link or by name, case-insensitively). */
export function availableCatalog(catalog: PackCatalogItem[], items: Pick<PackItem, 'catalog_item_id' | 'name'>[]) {
  const usedIds = new Set(items.map((i) => i.catalog_item_id).filter(Boolean))
  const usedNames = new Set(items.map((i) => i.name.trim().toLowerCase()))
  return catalog.filter((c) => !usedIds.has(c.id) && !usedNames.has(c.name.trim().toLowerCase()))
}

type Link = Pick<PackItemEvent, 'item_id' | 'event_id'>

/** The events an item is taken to, in the order given (the trip's events are already in date order). */
export function linkedEvents<E extends { id: string }>(events: E[], links: Link[], itemId: string): E[] {
  const ids = new Set(links.filter((l) => l.item_id === itemId).map((l) => l.event_id))
  return events.filter((e) => ids.has(e.id))
}

/** The items taken to an event. Links to items that are gone (removed moments ago, before the cache catches up) are ignored. */
export function itemsForEvent<I extends { id: string }>(items: I[], links: Link[], eventId: string): I[] {
  const ids = new Set(links.filter((l) => l.event_id === eventId).map((l) => l.item_id))
  return items.filter((i) => ids.has(i.id))
}

/** What to change so an item is taken to exactly the `wanted` events: events to link, and existing links to delete. */
export function planEventLinks(
  links: Pick<PackItemEvent, 'id' | 'item_id' | 'event_id'>[],
  itemId: string,
  wanted: ReadonlySet<string>,
): { add: string[]; remove: string[] } {
  const mine = links.filter((l) => l.item_id === itemId)
  const have = new Set(mine.map((l) => l.event_id))
  return {
    add: [...wanted].filter((id) => !have.has(id)),
    remove: mine.filter((l) => !wanted.has(l.event_id)).map((l) => l.id),
  }
}
