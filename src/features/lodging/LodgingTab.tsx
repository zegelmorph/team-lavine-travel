import { useState, type FormEvent } from 'react'
import { BedDouble, ExternalLink, Globe, MapPin, Pencil, Phone, Plus, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useDeleteTripRow, useSaveTripRow, type TripBundle } from '@/lib/queries'
import { formatDateRange, formatTime, nights } from '@/lib/dates'
import { googleMapsUrl } from '@/lib/places'
import type { Lodging } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input, Label, Select, field } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { Fab } from '@/components/ui/fab'
import { confirmAction } from '@/components/ui/confirm'
import { PlaceSearch } from '@/components/PlaceSearch'
import { plural } from '@/lib/utils'

export function LodgingTab({ trip }: { trip: TripBundle }) {
  const [editing, setEditing] = useState<Lodging | 'new' | null>(null)
  const remove = useDeleteTripRow('travel_lodging', trip.id)

  async function onDelete(l: Lodging) {
    if (await confirmAction({ title: `Delete ${l.name}?` })) remove.mutate(l.id, { onError: (e) => toast.error(e.message) })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-slate-500">Where you're staying each night. Stays show up on the schedule.</p>
        <Button onClick={() => setEditing('new')} className="max-md:hidden">
          <Plus className="h-4 w-4" /> Add stay
        </Button>
      </div>
      {trip.lodging.length === 0 ? (
        <Card className="px-6 py-12 text-center text-slate-500">
          <BedDouble className="mx-auto mb-2 h-6 w-6 text-slate-300" />
          No places to stay yet. Search for a hotel to add it with its address, phone and map link.
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {trip.lodging.map((l) => (
            <LodgingCard
              key={l.id}
              stay={l}
              destination={trip.destinations.find((d) => d.id === l.destination_id)?.name}
              onEdit={() => setEditing(l)}
              onDelete={() => onDelete(l)}
            />
          ))}
        </div>
      )}
      <Fab label="Add stay" onClick={() => setEditing('new')} className="md:hidden" />
      {editing && <LodgingDialog trip={trip} stay={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function LodgingCard({
  stay: l,
  destination,
  onEdit,
  onDelete,
}: {
  stay: Lodging
  destination?: string
  onEdit: () => void
  onDelete: () => void
}) {
  const maps = googleMapsUrl(l)
  const n = nights(l.check_in, l.check_out)
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate text-[15px] font-semibold text-slate-900">{l.name}</h4>
          <p className="text-xs text-slate-500">
            {destination && <span>{destination} · </span>}
            {formatDateRange(l.check_in, l.check_out)} · {plural(n, 'night')}
          </p>
        </div>
        <span className="flex shrink-0">
          <Button variant="ghost" size="icon" onClick={onEdit} title="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} title="Delete">
            <Trash2 className="h-4 w-4" />
          </Button>
        </span>
      </div>
      <dl className="mt-3 space-y-1.5 text-sm text-slate-600">
        {l.address && (
          <div className="flex gap-2">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>{l.address}</span>
          </div>
        )}
        {l.phone && (
          <div className="flex gap-2">
            <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <a href={`tel:${l.phone.replace(/\s/g, '')}`} className="hover:text-brand-700">
              {l.phone}
            </a>
          </div>
        )}
        {l.website && (
          <div className="flex gap-2">
            <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <a href={l.website} target="_blank" rel="noreferrer" className="truncate hover:text-brand-700">
              {l.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
            </a>
          </div>
        )}
        {l.rating != null && (
          <div className="flex items-center gap-2">
            <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
            <span className="num">{l.rating.toFixed(1)}</span>
          </div>
        )}
      </dl>
      <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2.5 text-xs">
        <div>
          <div className="text-slate-400">Check in</div>
          <div className="font-medium text-slate-700">{l.check_in_time ? formatTime(l.check_in_time) : '—'}</div>
        </div>
        <div>
          <div className="text-slate-400">Check out</div>
          <div className="font-medium text-slate-700">{l.check_out_time ? formatTime(l.check_out_time) : '—'}</div>
        </div>
      </div>
      {(l.confirmation || l.notes) && (
        <div className="mt-3 space-y-0.5 text-xs text-slate-500">
          {l.confirmation && <p>Confirmation {l.confirmation}</p>}
          {l.notes && <p>{l.notes}</p>}
        </div>
      )}
      {maps && (
        <a
          href={maps}
          target="_blank"
          rel="noreferrer"
          className="mt-auto inline-flex items-center gap-1.5 self-start pt-3 text-xs font-medium text-brand-700 hover:text-brand-900"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open in Google Maps
        </a>
      )}
    </Card>
  )
}

interface Draft {
  name: string
  address: string
  place_id: string | null
  lat: number | null
  lng: number | null
  phone: string
  website: string
  google_maps_url: string | null
  rating: number | null
  destination_id: string
  check_in: string
  check_out: string
  check_in_time: string
  check_out_time: string
  confirmation: string
  notes: string
}

function LodgingDialog({ trip, stay, onClose }: { trip: TripBundle; stay: Lodging | null; onClose: () => void }) {
  const save = useSaveTripRow<Lodging>('travel_lodging', trip.id)
  const single = trip.destinations.length === 1 ? trip.destinations[0] : undefined
  const [draft, setDraft] = useState<Draft>(() => ({
    name: stay?.name ?? '',
    address: stay?.address ?? '',
    place_id: stay?.place_id ?? null,
    lat: stay?.lat ?? null,
    lng: stay?.lng ?? null,
    phone: stay?.phone ?? '',
    website: stay?.website ?? '',
    google_maps_url: stay?.google_maps_url ?? null,
    rating: stay?.rating ?? null,
    destination_id: stay?.destination_id ?? single?.id ?? '',
    check_in: stay?.check_in ?? single?.start_date ?? '',
    check_out: stay?.check_out ?? single?.end_date ?? '',
    check_in_time: stay?.check_in_time?.slice(0, 5) ?? '',
    check_out_time: stay?.check_out_time?.slice(0, 5) ?? '',
    confirmation: stay?.confirmation ?? '',
    notes: stay?.notes ?? '',
  }))
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const badRange = Boolean(draft.check_in && draft.check_out && draft.check_out < draft.check_in)
  const canSave = draft.name.trim() && draft.check_in && draft.check_out && !badRange

  function pickDestination(id: string) {
    const d = trip.destinations.find((x) => x.id === id)
    set({
      destination_id: id,
      // Fill in the destination's dates if none are set yet.
      ...(d && !draft.check_in && d.start_date ? { check_in: d.start_date } : {}),
      ...(d && !draft.check_out && d.end_date ? { check_out: d.end_date } : {}),
    })
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSave) return
    const trimmed = (s: string) => s.trim() || null
    save.mutate(
      {
        ...(stay ? { id: stay.id } : {}),
        name: draft.name.trim(),
        address: trimmed(draft.address),
        place_id: draft.place_id,
        lat: draft.lat,
        lng: draft.lng,
        phone: trimmed(draft.phone),
        website: trimmed(draft.website),
        google_maps_url: draft.google_maps_url,
        rating: draft.rating,
        destination_id: draft.destination_id || null,
        check_in: draft.check_in,
        check_out: draft.check_out,
        check_in_time: draft.check_in_time || null,
        check_out_time: draft.check_out_time || null,
        confirmation: trimmed(draft.confirmation),
        notes: trimmed(draft.notes),
      },
      { onSuccess: onClose, onError: (err) => toast.error(err.message) },
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={stay ? 'Edit stay' : 'Add stay'} className="max-w-xl" fullScreenOnMobile>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="l-name">Hotel or rental</Label>
            <PlaceSearch
              id="l-name"
              kind="lodging"
              autoFocus={!stay}
              value={draft.name}
              placeholder="Search hotels"
              onChange={(name) => set({ name })}
              onPick={(p) =>
                set({
                  name: p.name,
                  address: p.address ?? '',
                  place_id: p.placeId,
                  lat: p.lat,
                  lng: p.lng,
                  phone: p.phone ?? '',
                  website: p.website ?? '',
                  google_maps_url: p.googleMapsUri,
                  rating: p.rating,
                })
              }
            />
          </div>
          <div>
            <Label htmlFor="l-address">Address</Label>
            <Input id="l-address" value={draft.address} onChange={(e) => set({ address: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="l-phone">Phone</Label>
              <Input id="l-phone" type="tel" value={draft.phone} onChange={(e) => set({ phone: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="l-web">Website</Label>
              <Input id="l-web" type="url" value={draft.website} onChange={(e) => set({ website: e.target.value })} />
            </div>
          </div>
          {trip.destinations.length > 0 && (
            <div>
              <Label htmlFor="l-dest">Destination</Label>
              <Select id="l-dest" value={draft.destination_id} onChange={(e) => pickDestination(e.target.value)} className="w-full">
                <option value="">None</option>
                {trip.destinations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_7rem_1fr_7rem]">
            <div>
              <Label htmlFor="l-in">Check in</Label>
              <DateInput id="l-in" value={draft.check_in} onChange={(check_in) => set({ check_in })} className={`${field} w-full`} />
            </div>
            <div>
              <Label htmlFor="l-in-time">Time</Label>
              <Input id="l-in-time" type="time" value={draft.check_in_time} onChange={(e) => set({ check_in_time: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="l-out">Check out</Label>
              <DateInput id="l-out" value={draft.check_out} onChange={(check_out) => set({ check_out })} className={`${field} w-full`} />
            </div>
            <div>
              <Label htmlFor="l-out-time">Time</Label>
              <Input id="l-out-time" type="time" value={draft.check_out_time} onChange={(e) => set({ check_out_time: e.target.value })} />
            </div>
          </div>
          {badRange && <p className="text-xs text-red-700">Check out is before check in.</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="l-conf">Confirmation</Label>
              <Input id="l-conf" value={draft.confirmation} onChange={(e) => set({ confirmation: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="l-notes">Notes</Label>
              <Input id="l-notes" value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 max-md:pb-4">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave || save.isPending}>
              {stay ? 'Save' : 'Add stay'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
