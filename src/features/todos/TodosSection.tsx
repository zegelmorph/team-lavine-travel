import { useRef, useState, type FormEvent } from 'react'
import { Plus, StickyNote, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { keys, useDeleteTripRow, useSaveTripRow, type TripBundle } from '@/lib/queries'
import type { Todo } from '@/lib/types'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input, Label, Textarea } from '@/components/ui/input'
import { useOnline } from '@/lib/useOnline'
import { cn } from '@/lib/utils'
import { sortTodos, todoProgress } from './model'

export function TodosSection({ trip }: { trip: TripBundle }) {
  const online = useOnline()
  const [hideDone, setHideDone] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const progress = todoProgress(trip.todos)
  const sorted = sortTodos(trip.todos)
  const visible = hideDone ? sorted.filter((t) => !t.done) : sorted
  // Looked up rather than held, so a to-do deleted elsewhere closes its dialog.
  const editing = editingId ? trip.todos.find((t) => t.id === editingId) : undefined

  return (
    <Card>
      <CardHeader
        title="To-do"
        actions={
          progress.total > 0 && (
            <span className="flex items-center gap-3">
              <span className="num text-xs text-slate-500 max-md:hidden">
                {progress.done} of {progress.total} done
              </span>
              <label className="flex items-center gap-1.5 text-xs text-slate-500 max-md:-my-2 max-md:py-2">
                <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
                Hide done
              </label>
            </span>
          )
        }
      />
      {progress.total > 0 && (
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-fill transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
          <span className="num text-xs text-slate-500 md:hidden">
            {progress.done} of {progress.total}
          </span>
        </div>
      )}
      <AddTodo tripId={trip.id} />

      {trip.todos.length === 0 ? (
        <p className="px-5 pb-8 pt-4 text-center text-slate-500">
          {online ? 'Nothing to do yet. Add the first thing above.' : 'Nothing to do yet.'}
        </p>
      ) : visible.length === 0 ? (
        <p className="px-5 pb-5 pt-2 text-center text-slate-500">All done.</p>
      ) : (
        <ul className="divide-y divide-slate-100 px-4 pb-1.5 max-md:px-3">
          {visible.map((todo) => (
            <TodoRow key={todo.id} tripId={trip.id} todo={todo} onEdit={() => setEditingId(todo.id)} />
          ))}
        </ul>
      )}
      {editing && <EditTodoDialog key={editing.id} tripId={trip.id} todo={editing} onClose={() => setEditingId(null)} />}
    </Card>
  )
}

/** One field: type and press Enter. Stays focused so several can go in a row. */
function AddTodo({ tripId }: { tripId: string }) {
  const save = useSaveTripRow<Todo>('travel_todos', tripId)
  const qc = useQueryClient()
  const online = useOnline()
  const [title, setTitle] = useState('')
  const adding = useRef(false)
  const input = useRef<HTMLInputElement>(null)

  async function add(e: FormEvent) {
    e.preventDefault()
    const text = title.trim()
    if (!text || adding.current) return
    adding.current = true
    try {
      const row = await save.mutateAsync({ title: text, done: false })
      // Show it now rather than when the refetch lands, so the cleared field never looks like a failed add.
      qc.setQueryData<TripBundle | null>(keys.trip(tripId), (trip) => (trip && !trip.todos.some((t) => t.id === row.id) ? { ...trip, todos: [...trip.todos, row] } : trip))
      setTitle('')
    } catch (err) {
      // The text stays so it can be retried.
      toast.error((err as Error).message)
    } finally {
      adding.current = false
      input.current?.focus()
    }
  }

  return (
    <form onSubmit={add} className="flex items-center gap-2 px-4 py-3 max-md:px-3">
      <Input
        ref={input}
        aria-label="New to-do"
        placeholder="Add a to-do, like Renew passports"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={!online}
        enterKeyHint="done"
      />
      <Button type="submit" size="sm" needsOnline disabled={!title.trim() || save.isPending}>
        <Plus className="h-4 w-4" /> Add
      </Button>
    </form>
  )
}

/**
 * Optimistic edits can remove the row that started them (a delete, or ticking one while done items are hidden), so
 * failures are reported from the promise, which outlives the row.
 */
function run(promise: Promise<unknown>) {
  promise.catch((err: Error) => toast.error(err.message))
}

function TodoRow({ tripId, todo, onEdit }: { tripId: string; todo: Todo; onEdit: () => void }) {
  const save = useSaveTripRow<Todo>('travel_todos', tripId)
  const remove = useDeleteTripRow('travel_todos', tripId)
  const online = useOnline()

  return (
    <li className="flex items-center gap-3 py-1.5 max-md:py-1">
      <label className="-m-1 flex p-1 max-md:-m-2.5 max-md:p-2.5">
        <input
          type="checkbox"
          aria-label={todo.title}
          className="h-4 w-4 shrink-0 max-md:h-5 max-md:w-5"
          checked={todo.done}
          disabled={!online}
          // Awaited rather than given per-call callbacks: with "Hide done" on, the row unmounts straight away and
          // would never report a failure.
          onChange={(e) => run(save.mutateAsync({ id: todo.id, done: e.target.checked }))}
        />
      </label>
      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-center gap-2 rounded py-1.5 text-left hover:text-slate-950 max-md:py-2.5"
        title="Edit"
      >
        <span className={cn('min-w-0 flex-1 truncate', todo.done ? 'text-slate-400 line-through' : 'text-slate-800')}>{todo.title}</span>
        {todo.notes && (
          <span role="img" aria-label="Has notes">
            <StickyNote className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          </span>
        )}
      </button>
      <Button
        variant="ghost"
        size="icon"
        needsOnline
        onClick={() => run(remove.mutateAsync(todo.id))}
        title="Delete to-do"
        aria-label={`Delete ${todo.title}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </li>
  )
}

function EditTodoDialog({ tripId, todo, onClose }: { tripId: string; todo: Todo; onClose: () => void }) {
  const save = useSaveTripRow<Todo>('travel_todos', tripId)
  const remove = useDeleteTripRow('travel_todos', tripId)
  const [title, setTitle] = useState(todo.title)
  const [notes, setNotes] = useState(todo.notes ?? '')

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    save.mutate(
      { id: todo.id, title: title.trim(), notes: notes.trim() || null },
      { onSuccess: onClose, onError: (err) => toast.error(err.message) },
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Edit to-do" className="max-w-md">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="todo-title">To-do</Label>
            <Input id="todo-title" autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="todo-notes">Notes</Label>
            <Textarea id="todo-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Links, details, who to call..." />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              needsOnline
              className="text-red-700"
              onClick={() => {
                // Closed first: the optimistic delete unmounts this dialog, and a rollback must not reopen it.
                onClose()
                run(remove.mutateAsync(todo.id))
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
            <span className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" needsOnline disabled={!title.trim() || save.isPending}>
                Save
              </Button>
            </span>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
