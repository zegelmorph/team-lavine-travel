import type { Todo } from '@/lib/types'

export function todoProgress(todos: Pick<Todo, 'done'>[]): { done: number; total: number; percent: number } {
  const done = todos.filter((t) => t.done).length
  const total = todos.length
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 }
}

/** Open to-dos first, then finished ones; each group in the order they were added. */
export function sortTodos<T extends Pick<Todo, 'done' | 'created_at'>>(todos: T[]): T[] {
  return [...todos].sort((a, b) => Number(a.done) - Number(b.done) || a.created_at.localeCompare(b.created_at))
}
