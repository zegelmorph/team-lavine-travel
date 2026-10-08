import { useState, type FormEvent } from 'react'
import { ArrowRight, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useDeleteTripRow, useSaveTripRow, type TripBundle } from '@/lib/queries'
import { formatDay, formatTime, localTimeZone, shortZone } from '@/lib/dates'
import { googleMapsUrl } from '@/lib/places'
import { TRANSPORT_MODES, TRANSPORT_MODE_LABELS, type Transport, type TransportMode } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input, Label, Select, field } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { Fab } from '@/components/ui/fab'
import { confirmAction } from '@/components/ui/confirm'
import { PlaceSearch } from '@/components/PlaceSearch'
import { MODE_FIELDS, MODE_ICONS } from './modes'

export function TransportTab({ trip }: { trip: TripBundle }) {
  const [editing, setEditing] = useState<Transport | 'new' | null>(null)
  const remove = useDeleteTripRow('travel_transport', trip.id)

  async function onDelete(t: Transport) {
    if (await confirmAction({ title: 'Delete this leg?' })) remove.mutate(t.id, { onError: (e) => toast.error(e.message) })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-slate-500">Flights, drives, trains and boats, in order. They show up on the schedule.</p>
        <Button onClick={() => setEditing('new')} className="max-md:hidden">
          <Plus className="h-4 w-4" /> Add travel
        </Button>
      </div>
      {trip.transport.length === 0 ? (
        <Card className="px-6 py-12 text-center text-slate-500">No travel added yet.</Card>
      ) : (
        trip.transport.map((t) => (
          <TransportCard key={t.id} leg={t} onEdit={() => setEditing(t)} onDelete={() => onDelete(t)} />
        ))
      )}
      <Fab label="Add travel" onClick={() => setEditing('new')} className="md:hidden" />
      {editing && (
        <TransportDialog trip={trip} leg={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

function Endpoint({
  label,
  location,
  date,
  time,
  tz,
  placeId,
}: {
  label: string
  location: string | null
  date: string | null
  time: string | null
  tz: string | null
  placeId: string | null
}) {
  const maps = location ? googleMapsUrl({ name: location, place_id: placeId }) : null
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{label}</div>
      <div className="flex items-center gap-1.5 truncate font-medium text-slate-800">
        <span className="truncate">{location || '—'}</span>
        {maps && (
          <a href={maps} target="_blank" rel="noreferrer" className="shrink-0 text-slate-400 hover:text-brand-700" title="Open in Google Maps">
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      {date && (
        <div className="text-xs text-slate-500">
          {formatDay(date)}
          {time && ` · ${formatTime(time)}`}
          {time && tz && <span className="text-slate-400"> {shortZone(tz, date)}</span>}
        </div>
      )}
    </div>
  )
}

function TransportCard({ leg, onEdit, onDelete }: { leg: Transport; onEdit: () => void; onDelete: () => void }) {
  const Icon = MODE_ICONS[leg.mode]
  const title = [leg.carrier, leg.number].filter(Boolean).join(' ') || TRANSPORT_MODE_LABELS[leg.mode]
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="truncate font-semibold text-slate-900">{title}</h4>
              {leg.confirmation && <p className="text-xs text-slate-500">Confirmation {leg.confirmation}</p>}
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
          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-start gap-3">
            <Endpoint
              label="From"
              location={leg.depart_location}
              date={leg.depart_date}
              time={leg.depart_time}
              tz={leg.depart_tz}
              placeId={leg.depart_place_id}
            />
            <ArrowRight className="mt-5 h-4 w-4 text-slate-300" />
            <Endpoint
              label="To"
              location={leg.arrive_location}
              date={leg.arrive_date}
              time={leg.arrive_time}
              tz={leg.arrive_tz}
              placeId={leg.arrive_place_id}
            />
          </div>
          {leg.notes && <p className="mt-2 text-xs text-slate-500">{leg.notes}</p>}
        </div>
      </div>
    </Card>
  )
}

interface Draft {
  mode: TransportMode
  carrier: string
  number: string
  confirmation: string
  depart_location: string
  depart_place_id: string | null
  depart_date: string
  depart_time: string
  depart_tz: string
  arrive_location: string
  arrive_place_id: string | null
  arrive_date: string
  arrive_time: string
  arrive_tz: string
  notes: string
}

function TransportDialog({ trip, leg, onClose }: { trip: TripBundle; leg: Transport | null; onClose: () => void }) {
  const save = useSaveTripRow<Transport>('travel_transport', trip.id)
  const firstDest = trip.destinations[0]
  const [draft, setDraft] = useState<Draft>(() => {
    const home = localTimeZone()
    return {
      mode: leg?.mode ?? 'plane',
      carrier: leg?.carrier ?? '',
      number: leg?.number ?? '',
      confirmation: leg?.confirmation ?? '',
      depart_location: leg?.depart_location ?? '',
      depart_place_id: leg?.depart_place_id ?? null,
      depart_date: leg ? (leg.depart_date ?? '') : (firstDest?.start_date ?? ''),
      depart_time: leg?.depart_time?.slice(0, 5) ?? '',
      depart_tz: leg?.depart_tz ?? home,
      arrive_location: leg?.arrive_location ?? (leg ? '' : (firstDest?.name ?? '')),
      arrive_place_id: leg?.arrive_place_id ?? null,
      arrive_date: leg ? (leg.arrive_date ?? '') : (firstDest?.start_date ?? ''),
      arrive_time: leg?.arrive_time?.slice(0, 5) ?? '',
      arrive_tz: leg?.arrive_tz ?? firstDest?.timezone ?? home,
      notes: leg?.notes ?? '',
    }
  })
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  /** Sets fields on one end of the leg: `setEnd('arrive', { tz })` sets `arrive_tz`. */
  const setEnd = (end: 'depart' | 'arrive', patch: Partial<Record<'location' | 'place_id' | 'date' | 'time' | 'tz', string | null>>) =>
    set(Object.fromEntries(Object.entries(patch).map(([k, v]) => [`${end}_${k}`, v])) as Partial<Draft>)
  const labels = MODE_FIELDS[draft.mode]

  const zones = [...new Set([localTimeZone(), ...trip.destinations.map((d) => d.timezone), draft.depart_tz, draft.arrive_tz].filter(Boolean) as string[])]

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = (s: string) => s.trim() || null
    save.mutate(
      {
        ...(leg ? { id: leg.id } : {}),
        mode: draft.mode,
        carrier: trimmed(draft.carrier),
        number: labels.number ? trimmed(draft.number) : null,
        confirmation: trimmed(draft.confirmation),
        depart_location: trimmed(draft.depart_location),
        depart_place_id: draft.depart_place_id,
        depart_date: draft.depart_date || null,
        depart_time: (draft.depart_date && draft.depart_time) || null,
        depart_tz: draft.depart_tz || null,
        arrive_location: trimmed(draft.arrive_location),
        arrive_place_id: draft.arrive_place_id,
        arrive_date: draft.arrive_date || null,
        arrive_time: (draft.arrive_date && draft.arrive_time) || null,
        arrive_tz: draft.arrive_tz || null,
        notes: trimmed(draft.notes),
      },
      { onSuccess: onClose, onError: (err) => toast.error(err.message) },
    )
  }

  const zoneSelect = (id: string, value: string, onChange: (v: string) => void) => (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="w-full">
      {zones.map((z) => (
        <option key={z} value={z}>
          {z.replace(/_/g, ' ')} ({shortZone(z)})
        </option>
      ))}
    </Select>
  )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={leg ? 'Edit travel' : 'Add travel'} className="max-w-xl" fullScreenOnMobile>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="t-mode">Type</Label>
              <Select id="t-mode" value={draft.mode} onChange={(e) => set({ mode: e.target.value as TransportMode })} className="w-full">
                {TRANSPORT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {TRANSPORT_MODE_LABELS[m]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="t-carrier">{labels.carrier}</Label>
              <Input id="t-carrier" value={draft.carrier} onChange={(e) => set({ carrier: e.target.value })} />
            </div>
            {labels.number && (
              <div>
                <Label htmlFor="t-number">{labels.number}</Label>
                <Input id="t-number" value={draft.number} onChange={(e) => set({ number: e.target.value })} />
              </div>
            )}
            <div>
              <Label htmlFor="t-conf">Confirmation</Label>
              <Input id="t-conf" value={draft.confirmation} onChange={(e) => set({ confirmation: e.target.value })} />
            </div>
          </div>

          {(['depart', 'arrive'] as const).map((end) => (
            <fieldset key={end} className="space-y-3 rounded-xl border border-slate-200/80 p-3">
              <legend className="px-1 text-xs font-semibold text-slate-600">{end === 'depart' ? 'Departs' : 'Arrives'}</legend>
              <div>
                <Label htmlFor={`t-${end}-loc`}>{end === 'depart' ? 'From' : 'To'}</Label>
                <PlaceSearch
                  id={`t-${end}-loc`}
                  kind="any"
                  value={draft[`${end}_location`]}
                  placeholder={draft.mode === 'plane' ? 'Airport' : 'Station, port or address'}
                  onChange={(location) => setEnd(end, { location, place_id: null })}
                  onPick={(p) => setEnd(end, { location: p.name, place_id: p.placeId })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_7rem_1fr]">
                <div>
                  <Label htmlFor={`t-${end}-date`}>Date</Label>
                  <DateInput
                    id={`t-${end}-date`}
                    value={draft[`${end}_date`]}
                    onChange={(date) => {
                      setEnd(end, { date })
                      if (end === 'depart' && !draft.arrive_date) set({ arrive_date: date })
                    }}
                    clearable
                    className={`${field} w-full`}
                  />
                </div>
                <div>
                  <Label htmlFor={`t-${end}-time`}>Time</Label>
                  <Input id={`t-${end}-time`} type="time" value={draft[`${end}_time`]} onChange={(e) => setEnd(end, { time: e.target.value })} />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <Label htmlFor={`t-${end}-tz`}>Time zone</Label>
                  {zoneSelect(`t-${end}-tz`, draft[`${end}_tz`], (tz) => setEnd(end, { tz }))}
                </div>
              </div>
            </fieldset>
          ))}

          <div>
            <Label htmlFor="t-notes">Notes</Label>
            <Input id="t-notes" value={draft.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Seats, terminal, pickup details..." />
          </div>
          <div className="flex justify-end gap-2 max-md:pb-4">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {leg ? 'Save' : 'Add travel'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
