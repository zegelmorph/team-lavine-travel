import { useEffect, useState, type FormEvent } from 'react'
import { ExternalLink, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useDeleteTripRow, useSaveTripRow } from '@/lib/queries'
import { EVENT_KINDS, EVENT_KIND_LABELS, type Destination, type EventKind, type TripEvent } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input, Label, Select, Textarea, field } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { confirmAction } from '@/components/ui/confirm'
import { PlaceSearch } from '@/components/PlaceSearch'
import { MapEmbed } from '@/components/MapEmbed'
import { useOnline } from '@/lib/useOnline'
import { eventMap } from './model'

type Place = Pick<TripEvent, 'address' | 'place_id' | 'lat' | 'lng' | 'google_maps_url'>
const NO_PLACE: Place = { address: null, place_id: null, lat: null, lng: null, google_maps_url: null }

const TITLE_HINTS: Record<EventKind, string> = {
  show: 'Hamilton',
  dinner: 'Dinner reservation',
  lunch: 'Lunch with friends',
  breakfast: 'Brunch',
  drinks: 'Happy hour',
  tour: 'Walking tour',
  museum: 'Art museum',
  activity: 'Hike, kayaking, spa...',
  shopping: 'Farmers market',
  appointment: 'Pickup, check-in, meeting...',
  other: 'Anything with a date',
}

export interface EventDraft {
  date: string
  /** "HH:mm"; empty for all day. */
  start_time: string
  end_time: string
}

export function EventDialog({
  tripId,
  destinations,
  event,
  initial,
  onClose,
}: {
  tripId: string
  /** Anchors a typed location to the right town for the map. */
  destinations: Destination[]
  event: TripEvent | null
  initial?: EventDraft
  onClose: () => void
}) {
  const save = useSaveTripRow<TripEvent>('travel_events', tripId)
  const remove = useDeleteTripRow('travel_events', tripId)
  const online = useOnline()
  const [title, setTitle] = useState(event?.title ?? '')
  const [date, setDate] = useState(event?.date ?? initial?.date ?? '')
  const [allDay, setAllDay] = useState(event ? !event.start_time : !initial?.start_time)
  const [start, setStart] = useState(event?.start_time?.slice(0, 5) ?? initial?.start_time ?? '09:00')
  const [end, setEnd] = useState(event?.end_time?.slice(0, 5) ?? initial?.end_time ?? '')
  const [kind, setKind] = useState<EventKind>(event?.kind ?? 'other')
  const [location, setLocation] = useState(event?.location ?? '')
  const [place, setPlace] = useState<Place>(() => ({
    address: event?.address ?? null,
    place_id: event?.place_id ?? null,
    lat: event?.lat ?? null,
    lng: event?.lng ?? null,
    google_maps_url: event?.google_maps_url ?? null,
  }))
  const [notes, setNotes] = useState(event?.notes ?? '')
  // Settle typing before the iframe reloads.
  const [mapLocation, setMapLocation] = useState(location)
  useEffect(() => {
    const timer = setTimeout(() => setMapLocation(location), 700)
    return () => clearTimeout(timer)
  }, [location])
  const map = mapLocation.trim() ? eventMap({ ...place, location: mapLocation, date }, destinations) : null
  const badTimes = !allDay && Boolean(end) && end < start
  const canSave = title.trim() && date && !badTimes && (allDay || start)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSave) return
    save.mutate(
      {
        ...(event ? { id: event.id } : {}),
        kind,
        title: title.trim(),
        date,
        start_time: allDay ? null : start,
        end_time: allDay || !end ? null : end,
        location: location.trim() || null,
        ...(location.trim() ? place : NO_PLACE),
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
      <DialogContent title={event ? (online ? 'Edit event' : 'Event') : 'Add event'} className="max-w-md md:max-w-3xl" fullScreenOnMobile>
        <form onSubmit={onSubmit} className="grid gap-x-6 gap-y-4 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <Label htmlFor="ev-kind">Type</Label>
              <Select id="ev-kind" autoFocus={!event} value={kind} onChange={(e) => setKind(e.target.value as EventKind)} className="w-full">
                {EVENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {EVENT_KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="ev-title">What</Label>
              <Input id="ev-title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder={TITLE_HINTS[kind]} />
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
                  <div className="col-span-2 sm:col-span-1">
                    <Label htmlFor="ev-start">Starts</Label>
                    <Input id="ev-start" type="time" required value={start} onChange={(e) => setStart(e.target.value)} />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label htmlFor="ev-end">Ends</Label>
                    <Input id="ev-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
                  </div>
                </>
              )}
            </div>
            {badTimes && <p className="text-xs text-red-700">The end time is before the start time.</p>}
          </div>
          <div>
            <Label htmlFor="ev-loc">Where</Label>
            <PlaceSearch
              id="ev-loc"
              kind="any"
              value={location}
              placeholder="Search restaurants, theaters, places..."
              onChange={(text) => {
                setLocation(text)
                // Typed over a looked-up place: its address and pin no longer apply.
                if (place.place_id || place.address) setPlace(NO_PLACE)
              }}
              onPick={(p) => {
                setLocation(p.name)
                setMapLocation(p.name)
                setPlace({ address: p.address, place_id: p.placeId, lat: p.lat, lng: p.lng, google_maps_url: p.googleMapsUri })
              }}
            />
            {place.address && <p className="mt-1 truncate text-xs text-slate-500">{place.address}</p>}
            {map && (
              <div className="mt-2">
                <MapEmbed title={`Map of ${mapLocation}`} src={map.embed} interactive="desktop" className="h-36 sm:h-44 md:h-52" />
                {map.link && (
                  <a
                    href={map.link}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-900"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open in Google Maps
                  </a>
                )}
              </div>
            )}
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="ev-notes">Notes</Label>
            <Textarea
              id="ev-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What to wear, who's going, reservation details..."
            />
          </div>
          <div className="flex items-center justify-between gap-2 max-md:pb-4 md:col-span-2">
            {event ? (
              <Button type="button" variant="ghost" needsOnline onClick={onDelete} className="text-red-700">
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            ) : (
              <span />
            )}
            <span className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" needsOnline disabled={!canSave || save.isPending}>
                {event ? 'Save' : 'Add event'}
              </Button>
            </span>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
