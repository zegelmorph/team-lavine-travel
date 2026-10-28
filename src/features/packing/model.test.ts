import { describe, expect, it } from 'vitest'
import {
  availableCatalog,
  cabinetToReview,
  findByName,
  groupByCategory,
  itemsForEvent,
  linkedEvents,
  packProgress,
  planEventLinks,
  planPackAdd,
  planPackRename,
} from './model'
import type { PackCatalogItem, PackCategory } from '@/lib/types'

const cat = (id: string, name: string, sort_order: number): PackCategory => ({ id, household_id: 'h', name, sort_order })
const catalogItem = (id: string, name: string): PackCatalogItem => ({
  id,
  household_id: 'h',
  category_id: null,
  name,
  in_cabinet: false,
})

describe('cabinetToReview', () => {
  it('offers cabinet items that are not on the list yet', () => {
    const catalog = [
      { ...catalogItem('a', 'Adapter'), in_cabinet: true },
      { ...catalogItem('b', 'Band-Aids'), in_cabinet: true },
      catalogItem('c', 'Socks'),
    ]
    expect(cabinetToReview(catalog, [{ catalog_item_id: 'a', name: 'Adapter' }]).map((c) => c.name)).toEqual(['Band-Aids'])
  })

  it('treats a packing item with the same name as the cabinet item as already on the list', () => {
    const catalog = [{ ...catalogItem('cab', 'Adapter'), in_cabinet: true }, catalogItem('pack', 'Adapter')]
    expect(cabinetToReview(catalog, [{ catalog_item_id: 'pack', name: 'Adapter' }])).toEqual([])
  })

  it('counts an unlinked list item with the same name as already on the list', () => {
    const catalog = [{ ...catalogItem('b', 'Band-Aids'), in_cabinet: true }]
    expect(cabinetToReview(catalog, [{ catalog_item_id: null, name: ' band-aids ' }])).toEqual([])
  })
})

describe('groupByCategory', () => {
  it('follows category order, sorts items, and puts unknown categories under Other', () => {
    const groups = groupByCategory(
      [
        { name: 'Socks', category_id: 'clothes' },
        { name: 'Charger', category_id: 'tech' },
        { name: 'Hat', category_id: 'clothes' },
        { name: 'Mystery', category_id: 'deleted' },
        { name: 'Snacks', category_id: null },
      ],
      [cat('tech', 'Electronics', 2), cat('clothes', 'Clothing', 1), cat('empty', 'Empty', 0)],
    )
    expect(groups.map((g) => g.category?.name ?? 'Other')).toEqual(['Clothing', 'Electronics', 'Other'])
    expect(groups[0].items.map((i) => i.name)).toEqual(['Hat', 'Socks'])
    expect(groups[2].items.map((i) => i.name)).toEqual(['Mystery', 'Snacks'])
  })
})

describe('packProgress', () => {
  it('counts packed lines', () => {
    expect(packProgress([{ packed: true }, { packed: false }, { packed: true }])).toEqual({
      packed: 2,
      total: 3,
      percent: 67,
    })
    expect(packProgress([])).toEqual({ packed: 0, total: 0, percent: 0 })
  })
})

describe('availableCatalog', () => {
  it('hides items already on the list by link or name', () => {
    const left = availableCatalog(
      [catalogItem('a', 'Passport'), catalogItem('b', 'Socks'), catalogItem('c', 'Hat')],
      [
        { catalog_item_id: 'a', name: 'Passport' },
        { catalog_item_id: null, name: ' socks ' },
      ],
    )
    expect(left.map((c) => c.name)).toEqual(['Hat'])
  })
})

describe('findByName', () => {
  it('matches ignoring case and spaces, and never matches blank names', () => {
    const items = [catalogItem('a', 'Passport'), catalogItem('b', 'Socks')]
    expect(findByName(items, '  socks ')?.id).toBe('b')
    expect(findByName(items, 'Sock')).toBeUndefined()
    expect(findByName(items, '  ')).toBeUndefined()
  })
})

describe('event links', () => {
  const links = [
    { id: 'l1', item_id: 'shoes', event_id: 'show' },
    { id: 'l2', item_id: 'shoes', event_id: 'dinner' },
    { id: 'l3', item_id: 'hat', event_id: 'show' },
  ]

  it('finds the events an item is for, in the order of the events given', () => {
    expect(linkedEvents([{ id: 'dinner' }, { id: 'hike' }, { id: 'show' }], links, 'shoes').map((e) => e.id)).toEqual(['dinner', 'show'])
    expect(linkedEvents([{ id: 'show' }], links, 'socks')).toEqual([])
  })

  it('finds the items for an event, ignoring links to items that no longer exist', () => {
    expect(itemsForEvent([{ id: 'hat' }, { id: 'shoes' }], links, 'show').map((i) => i.id)).toEqual(['hat', 'shoes'])
    expect(itemsForEvent([{ id: 'shoes' }], links, 'show').map((i) => i.id)).toEqual(['shoes'])
  })

  it('plans only the difference between the current links and the wanted events', () => {
    expect(planEventLinks(links, 'shoes', new Set(['show', 'hike']))).toEqual({ add: ['hike'], remove: ['l2'] })
    expect(planEventLinks(links, 'shoes', new Set(['show', 'dinner']))).toEqual({ add: [], remove: [] })
    expect(planEventLinks(links, 'socks', new Set(['show']))).toEqual({ add: ['show'], remove: [] })
    expect(planEventLinks(links, 'hat', new Set())).toEqual({ add: [], remove: ['l3'] })
  })
})

describe('planPackRename', () => {
  const list = [
    { id: '1', name: 'Hat' },
    { id: '2', name: 'Socks' },
  ]

  it('renames to the trimmed name', () => {
    expect(planPackRename(list, '1', '  Sun hat ')).toEqual({ rename: 'Sun hat' })
  })

  it('allows changing only the case of its own name', () => {
    expect(planPackRename(list, '1', 'HAT')).toEqual({ rename: 'HAT' })
  })

  it('does nothing for a blank or identical name', () => {
    expect(planPackRename(list, '1', '   ')).toEqual({ unchanged: true })
    expect(planPackRename(list, '1', ' Hat ')).toEqual({ unchanged: true })
  })

  it('refuses a name another item on the list already has', () => {
    expect(planPackRename(list, '1', ' socks ')).toEqual({ duplicate: true })
  })

  it('still refuses a clash when the item itself has the same name as an older duplicate', () => {
    const legacy = [...list, { id: '3', name: 'hat' }]
    expect(planPackRename(legacy, '1', 'HAT')).toEqual({ duplicate: true })
  })
})

describe('planPackAdd', () => {
  const hat = { ...catalogItem('hat', 'Hat'), category_id: 'clothes' }
  const catalog = [hat]

  it('reuses a saved item already in the chosen category', () => {
    expect(planPackAdd(catalog, [], { name: 'Hat', catalogId: 'hat' }, 'clothes')).toEqual({ reuse: hat })
  })

  it('moves a saved item to a different category, keeping its name', () => {
    expect(planPackAdd(catalog, [], { name: 'Hat', catalogId: 'hat' }, 'misc')).toEqual({
      save: { id: 'hat', name: 'Hat', category_id: 'misc' },
    })
  })

  it('matches a typed name to a saved item ignoring case', () => {
    expect(planPackAdd(catalog, [], { name: ' hat ', catalogId: null }, 'clothes')).toEqual({ reuse: hat })
  })

  it('saves a new item, including when its saved entry was deleted meanwhile', () => {
    const save = { id: undefined, name: 'Scarf', category_id: 'clothes' }
    expect(planPackAdd(catalog, [], { name: 'Scarf ', catalogId: null }, 'clothes')).toEqual({ save })
    expect(planPackAdd(catalog, [], { name: 'Scarf', catalogId: 'gone' }, 'clothes')).toEqual({ save })
  })

  it('refuses an item already on the list', () => {
    expect(planPackAdd(catalog, [{ name: 'HAT' }], { name: 'Hat', catalogId: 'hat' }, 'clothes')).toEqual({ duplicate: true })
  })

  it('refuses a saved item that is on the list under a new name', () => {
    expect(planPackAdd(catalog, [{ name: 'Sun hat', catalog_item_id: 'hat' }], { name: 'Hat', catalogId: null }, 'clothes')).toEqual({
      duplicate: true,
    })
  })
})
