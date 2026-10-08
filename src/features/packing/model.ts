import type { PackCatalogItem, PackCategory, PackItem } from '@/lib/types'

export interface PackGroup<T> {
  category: PackCategory | null
  items: T[]
}

/** Items grouped by category in the household's category order, with uncategorized items last under "Other". */
export function groupByCategory<T extends { category_id: string | null; name: string }>(
  items: T[],
  categories: PackCategory[],
): PackGroup<T>[] {
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

/** Catalog items not already on the list (matched by catalog link or by name, case-insensitively). */
export function availableCatalog(catalog: PackCatalogItem[], items: Pick<PackItem, 'catalog_item_id' | 'name'>[]) {
  const usedIds = new Set(items.map((i) => i.catalog_item_id).filter(Boolean))
  const usedNames = new Set(items.map((i) => i.name.trim().toLowerCase()))
  return catalog.filter((c) => !usedIds.has(c.id) && !usedNames.has(c.name.trim().toLowerCase()))
}
