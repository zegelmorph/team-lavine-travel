import { describe, expect, it } from 'vitest'
import { sortTodos, todoProgress } from './model'
import type { Todo } from '@/lib/types'

const todo = (id: string, done: boolean, created_at: string): Todo => ({ id, trip_id: 't', title: id, notes: null, done, created_at })

describe('todoProgress', () => {
  it('counts finished to-dos and rounds the percentage', () => {
    expect(todoProgress([{ done: true }, { done: false }, { done: false }])).toEqual({ done: 1, total: 3, percent: 33 })
  })

  it('is zero for an empty list', () => {
    expect(todoProgress([])).toEqual({ done: 0, total: 0, percent: 0 })
  })
})

describe('sortTodos', () => {
  it('puts open to-dos first, each group in the order added', () => {
    const list = [todo('c', true, '2026-01-01'), todo('b', false, '2026-01-03'), todo('a', false, '2026-01-02'), todo('d', true, '2026-01-04')]
    expect(sortTodos(list).map((t) => t.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('leaves the original list alone', () => {
    const list = [todo('b', true, '2026-01-02'), todo('a', false, '2026-01-01')]
    sortTodos(list)
    expect(list.map((t) => t.id)).toEqual(['b', 'a'])
  })
})
