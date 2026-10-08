import { useState, type FormEvent } from 'react'
import { useIsMutating } from '@tanstack/react-query'
import { ExternalLink, MapPin, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  keys,
  useDeleteTripRow,
  useRefreshWeather,
  useSaveTripRow,
  useWeather,
  type TripBundle,
} from '@/lib/queries'
import { formatDateRange, nights } from '@/lib/dates'
import { geocodeCity } from '@/lib/places'
import { googleMapsUrl } from '@/lib/mapLinks'
import type { Destination, WeatherDay } from '@/lib/types'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Label, field } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { confirmAction } from '@/components/ui/confirm'
import { PlaceSearch } from '@/components/PlaceSearch'
import { plural } from '@/lib/utils'
import { WeatherStrip } from './WeatherStrip'

export function DestinationsCard({ trip }: { trip: TripBundle }) {
  const [editing, setEditing] = useState<Destination | 'new' | null>(null)
  const ids = trip.destinations.map((d) => d.id)
  const { data: weather } = useWeather(trip.id, ids)
  const refresh = useRefreshWeather(trip.id)
  const fetchingWeather = useIsMutating({ mutationKey: keys.weatherRefresh(trip.id) }) > 0
  const remove = useDeleteTripRow('travel_destinations', trip.id)

  async function onDelete(d: Destination) {
    if (await confirmAction({ title: `Remove ${d.name}?`, message: 'Its weather goes too. Lodging stays but is unlinked.' }))
      remove.mutate(d.id, { onError: (e) => toast.error(e.message) })
  }

  return (
    <Card>
      <CardHeader
        title="Destinations"
        actions={
          <span className="flex gap-1">
            {trip.destinations.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                needsOnline
                disabled={refresh.isPending}
                onClick={() =>
                  refresh.mutate({ force: true }, { onError: (e) => toast.error(`Weather: ${e.message}`) })
                }
                title="Refresh weather"
              >
                <RefreshCw className={refresh.isPending ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
                <span className="max-md:hidden">Weather</span>
              </Button>
            )}
            <Button variant="outline" size="sm" needsOnline onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </span>
        }
      />
      {trip.destinations.length === 0 ? (
        <div className="px-5 py-10 text-center text-slate-500">
          <MapPin className="mx-auto mb-2 h-6 w-6 text-slate-300" />
          Add where you're going and when. Weather is tracked automatically.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {trip.destinations.map((d) => (
            <DestinationRow
              key={d.id}
              destination={d}
              weather={weather?.filter((w) => w.destination_id === d.id) ?? []}
              fetchingWeather={fetchingWeather}
              onEdit={() => setEditing(d)}
              onDelete={() => onDelete(d)}
            />
          ))}
        </ul>
      )}
      {editing && (
        <DestinationDialog
          trip={trip}
          destination={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  )
}

function DestinationRow({
  destination: d,
  weather,
  fetchingWeather,
  onEdit,
  onDelete,
}: {
  destination: Destination
  weather: WeatherDay[]
  fetchingWeather: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const maps = googleMapsUrl(d)
  return (
    <li className="px-5 py-4 max-md:px-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-[15px] font-semibold text-slate-900">{d.name}</h4>
            {maps && (
              <a href={maps} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-brand-700 max-md:-m-2.5 max-md:p-2.5" aria-label="Open in Google Maps">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          <p className="text-slate-500">
            {formatDateRange(d.start_date, d.end_date)}
            {d.start_date && d.end_date && d.end_date > d.start_date && (
              <span className="text-slate-400"> · {plural(nights(d.start_date, d.end_date), 'night')}</span>
            )}
          </p>
          {d.notes && <p className="mt-1 text-xs text-slate-500">{d.notes}</p>}
        </div>
        <span className="flex shrink-0">
          <Button variant="ghost" size="icon" needsOnline onClick={onEdit} title="Edit destination">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" needsOnline onClick={onDelete} title="Remove destination">
            <Trash2 className="h-4 w-4" />
          </Button>
        </span>
      </div>
      {d.start_date && d.end_date && (
        <WeatherStrip
          days={weather}
          hint={
            d.lat == null
              ? "Couldn't find this place on the map, so there's no weather. Edit it and pick a suggestion."
              : weather.length > 0
                ? null
                : fetchingWeather
                  ? 'Fetching weather...'
                  : d.weather_refreshed_at
                  ? 'No weather available for these dates.'
                  : "Weather hasn't loaded yet. Use the Weather button above to retry."
          }
        />
      )}
    </li>
  )
}

interface Draft {
  name: string
  address: string | null
  place_id: string | null
  lat: number | null
  lng: number | null
  start_date: string
  end_date: string
  notes: string
}

export function DestinationDialog({
  trip,
  destination,
  onClose,
}: {
  trip: TripBundle
  destination: Destination | null
  onClose: () => void
}) {
  const save = useSaveTripRow<Destination>('travel_destinations', trip.id)
  const refresh = useRefreshWeather(trip.id)
  const last = trip.destinations[trip.destinations.length - 1]
  const [draft, setDraft] = useState<Draft>(() => ({
    name: destination?.name ?? '',
    address: destination?.address ?? null,
    place_id: destination?.place_id ?? null,
    lat: destination?.lat ?? null,
    lng: destination?.lng ?? null,
    // A new stop starts where the previous one ends.
    start_date: destination?.start_date ?? last?.end_date ?? '',
    end_date: destination?.end_date ?? '',
    notes: destination?.notes ?? '',
  }))
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const badRange = Boolean(draft.start_date && draft.end_date && draft.end_date < draft.start_date)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!draft.name.trim() || badRange) return
    setBusy(true)
    let { lat, lng, address } = draft
    if (lat == null) {
      const found = await geocodeCity(draft.name)
      if (found) ({ lat, lng } = found)
      address ??= found?.address ?? null
    }
    const moved = lat !== destination?.lat || lng !== destination?.lng
    const redated = draft.start_date !== (destination?.start_date ?? '') || draft.end_date !== (destination?.end_date ?? '')
    save.mutate(
      {
        ...(destination ? { id: destination.id } : { sort_order: trip.destinations.length }),
        name: draft.name.trim(),
        address,
        place_id: draft.place_id,
        lat,
        lng,
        // The weather function fills in the time zone for the new location.
        ...(moved ? { timezone: null } : {}),
        start_date: draft.start_date || null,
        end_date: draft.end_date || null,
        notes: draft.notes.trim() || null,
      },
      {
        onSuccess: (saved) => {
          if (saved.lat != null && saved.start_date && saved.end_date && (moved || redated)) {
            refresh.mutate({ destinationId: saved.id, force: true }, { onError: (err) => toast.error(`Weather: ${err.message}`) })
          }
          onClose()
        },
        onError: (err) => toast.error(err.message),
        onSettled: () => setBusy(false),
      },
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent title={destination ? 'Edit destination' : 'Add destination'} className="max-w-md">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="dest-name">Place</Label>
            <PlaceSearch
              id="dest-name"
              kind="city"
              autoFocus
              value={draft.name}
              placeholder="City or region"
              onChange={(name) => set({ name, place_id: null, lat: null, lng: null, address: null })}
              onPick={(p) =>
                set({ name: p.name, address: p.address, place_id: p.placeId, lat: p.lat, lng: p.lng })
              }
            />
            {draft.address && <p className="mt-1 truncate text-xs text-slate-400">{draft.address}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="dest-start">Arrive</Label>
              <DateInput id="dest-start" value={draft.start_date} onChange={(start_date) => set({ start_date })} clearable className={`${field} w-full`} />
            </div>
            <div>
              <Label htmlFor="dest-end">Leave</Label>
              <DateInput id="dest-end" value={draft.end_date} onChange={(end_date) => set({ end_date })} clearable className={`${field} w-full`} />
            </div>
          </div>
          {badRange && <p className="text-xs text-red-700">The leave date is before the arrive date.</p>}
          <div>
            <Label htmlFor="dest-notes">Notes</Label>
            <input
              id="dest-notes"
              value={draft.notes}
              onChange={(e) => set({ notes: e.target.value })}
              className={`${field} w-full`}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" needsOnline disabled={!draft.name.trim() || badRange || busy}>
              {destination ? 'Save' : 'Add destination'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
