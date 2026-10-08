import { useState, type FormEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useDeleteTripRow, useSaveTripRow } from '@/lib/queries'
import type { TripEvent } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input, Label, field } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { confirmAction } from '@/components/ui/confirm'

export interface EventDraft {
  date: string
  /** "HH:mm"; empty for all day. */
  start_time: string
  end_time: string
}

export function EventDialog({
  tripId,
  event,
  initial,
  onClose,
}: {
  tripId: string
  event: TripEvent | null
  initial?: EventDraft
  onClose: () => void
}) {
  const save = useSaveTripRow<TripEvent>('travel_events', tripId)
  const remove = useDeleteTripRow('travel_events', tripId)
  const [title, setTitle] = useState(event?.title ?? '')
  const [date, setDate] = useState(event?.date ?? initial?.date ?? '')
  const [allDay, setAllDay] = useState(event ? !event.start_time : !initial?.start_time)
  const [start, setStart] = useState(event?.start_time?.slice(0, 5) ?? initial?.start_time ?? '09:00')
  const [end, setEnd] = useState(event?.end_time?.slice(0, 5) ?? initial?.end_time ?? '')
  const [location, setLocation] = useState(event?.location ?? '')
  const [notes, setNotes] = useState(event?.notes ?? '')
  const badTimes = !allDay && Boolean(end) && end < start
  const canSave = title.trim() && date && !badTimes && (allDay || start)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSave) return
    save.mutate(
      {
        ...(event ? { id: event.id } : {}),
        title: title.trim(),
        date,
        start_time: allDay ? null : start,
        end_time: allDay || !end ? null : end,
        location: location.trim() || null,
        notes: notes.trim() || null,
      },
      { onSuccess: onClose, onError: (err) => toast.error(err.message) },
    )
  }

  async function onDelete() {
    if (!event || !(await confirmAction({ title: `Delete ${event.title}?` }))) return
    remove.mutate(event.id, { onSuccess: onClose, onError: (err) => toast.error(err.message) })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={event ? 'Edit event' : 'Add event'} className="max-w-md">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="ev-title">What</Label>
            <Input id="ev-title" autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dinner reservation" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <Label htmlFor="ev-date">Date</Label>
              <DateInput id="ev-date" value={date} onChange={setDate} className={`${field} w-full`} />
            </div>
            <label className="col-span-2 flex items-center gap-2 self-end pb-2 text-slate-600 sm:col-span-1">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
              All day
            </label>
            {!allDay && (
              <>
                <div>
                  <Label htmlFor="ev-start">Starts</Label>
                  <Input id="ev-start" type="time" required value={start} onChange={(e) => setStart(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="ev-end">Ends</Label>
                  <Input id="ev-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
                </div>
              </>
            )}
          </div>
          {badTimes && <p className="text-xs text-red-700">The end time is before the start time.</p>}
          <div>
            <Label htmlFor="ev-loc">Where</Label>
            <Input id="ev-loc" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ev-notes">Notes</Label>
            <Input id="ev-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex items-center justify-between gap-2">
            {event ? (
              <Button type="button" variant="ghost" onClick={onDelete} className="text-red-700">
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            ) : (
              <span />
            )}
            <span className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSave || save.isPending}>
                {event ? 'Save' : 'Add event'}
              </Button>
            </span>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
