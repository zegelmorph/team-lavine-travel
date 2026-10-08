import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MapPin, Plus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateTrip, useTrips, useTripsWeather } from '@/lib/queries'
import { formatDateRange, todayISO } from '@/lib/dates'
import { describeWeather, formatTemp, useTempUnit } from '@/lib/weather'
import { TRIP_STATUS_LABELS, type TripStatus, type TripSummary, type WeatherDay } from '@/lib/types'
import { Card, PageHeader, eyebrow } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'
import { Fab } from '@/components/ui/fab'
import { MapEmbed } from '@/components/MapEmbed'
import { NotSavedOffline } from '@/components/Offline'
import { googleMapsEmbedUrl } from '@/lib/mapLinks'
import { cn } from '@/lib/utils'
import { countdown, groupTrips } from './model'
import { StatusBadge } from './StatusBadge'

export function TripsPage() {
  const { data: trips, isPending, isPaused } = useTrips()
  const [creating, setCreating] = useState(false)
  const groups = useMemo(() => groupTrips(trips ?? []), [trips])
  const glanceIds = useMemo(() => (trips ?? []).filter((t) => t.status === 'happening' || t.status === 'planning').map((t) => t.id), [trips])
  const { data: weather } = useTripsWeather(glanceIds)
  const today = todayISO()

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-3 pb-24 md:p-6 lg:p-8">
      <PageHeader
        title="Trips"
        subtitle="Dream it, plan it, live it."
        actions={
          <Button needsOnline onClick={() => setCreating(true)} className="max-md:hidden">
            <Plus className="h-4 w-4" /> New trip
          </Button>
        }
      />

      {isPending && isPaused ? (
        <NotSavedOffline />
      ) : isPending ? (
        <p className="text-slate-400">Loading...</p>
      ) : groups.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <MapPin className="h-8 w-8 text-brand-500" />
          <p className="text-base font-medium text-slate-800">Where to next?</p>
          <p className="max-w-sm text-slate-500">
            Start with a dream destination. Add dates, places to stay and a packing list as the plan comes together.
          </p>
          <Button needsOnline onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New trip
          </Button>
        </Card>
      ) : (
        groups.map((g) => (
          <section key={g.status}>
            <h2 className={cn(eyebrow, 'mb-2 px-1')}>
              {TRIP_STATUS_LABELS[g.status]} · {g.trips.length}
            </h2>
            <div className="grid gap-3">
              {g.trips.map((t) => (
                <TripCard key={t.id} trip={t} today={today} weather={weather?.filter((w) => w.trip_id === t.id)} />
              ))}
            </div>
          </section>
        ))
      )}

      <Fab label="New trip" onClick={() => setCreating(true)} className="md:hidden" />
      {creating && <NewTripDialog onClose={() => setCreating(false)} />}
    </div>
  )
}

function TripCard({ trip, today, weather }: { trip: TripSummary; today: string; weather?: WeatherDay[] }) {
  const until = countdown(trip.start_date, trip.end_date, today)
  // Today's weather while the trip is on, otherwise the first day's.
  const glance = weather?.find((w) => w.date === today) ?? weather?.find((w) => w.date >= today)
  const unit = useTempUnit()
  const Icon = glance ? describeWeather(glance.weather_code).icon : null

  return (
    <Link
      to={`/trips/${trip.id}`}
      className="group flex gap-4 rounded-card border border-slate-200/80 bg-white p-4 shadow-card transition-colors hover:border-brand-300 max-md:flex-col"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="min-w-0 truncate text-base font-semibold text-slate-900 group-hover:text-brand-800">{trip.name}</h3>
          <StatusBadge status={trip.status} className="shrink-0" />
          {glance && Icon && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
              title={describeWeather(glance.weather_code).label}
            >
              <Icon className="h-3.5 w-3.5" />
              {describeWeather(glance.weather_code).label} ·
              <span className="num">
                {formatTemp(glance.temp_max_c, unit)} / {formatTemp(glance.temp_min_c, unit)}
              </span>
            </span>
          )}
        </div>
        <p className="mt-0.5 text-slate-500">{formatDateRange(trip.start_date, trip.end_date)}</p>
        {trip.destinations.length > 0 && (
          <p className="mt-2 flex items-center gap-1.5 truncate text-slate-600">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate">{trip.destinations.join(' → ')}</span>
          </p>
        )}
        {trip.notes && <p className="mt-2 line-clamp-3 whitespace-pre-line text-slate-600">{trip.notes}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs text-slate-500">
          {until && trip.status !== 'dreaming' && <span className="font-medium text-brand-700">{until}</span>}
          {trip.participants.length > 0 && (
            <span className="flex min-w-0 items-center gap-1">
              <Users className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{listNames(trip.participants)}</span>
            </span>
          )}
        </div>
      </div>
      {trip.destinations.length > 0 && (
        <div className="-mb-1 flex shrink-0 gap-2 overflow-x-auto pb-1 max-md:-mx-4 max-md:px-4 md:max-w-[50%]">
          {trip.destinations.map((name, i) => (
            <figure key={`${name}-${i}`} className="w-44 shrink-0">
              <MapEmbed title={`Map of ${name}`} src={googleMapsEmbedUrl({ name }, undefined, 11)} className="h-28 rounded-lg" />
              <figcaption className="mt-1 truncate text-xs text-slate-500">{name}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </Link>
  )
}

/** "Jolene", "Jolene and Jessica", "Jolene, Jessica and Sam". */
function listNames(names: string[]) {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

const NEW_STATUSES: TripStatus[] = ['dreaming', 'planning']

function NewTripDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const create = useCreateTrip()
  const [name, setName] = useState('')
  const [status, setStatus] = useState<TripStatus>('dreaming')

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    create.mutate(
      { name, status },
      {
        onSuccess: (trip) => navigate(`/trips/${trip.id}`),
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="New trip" className="max-w-md">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="trip-name">Name</Label>
            <Input id="trip-name" autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="Summer in Italy" />
          </div>
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-slate-500">Where is it at?</legend>
            <div className="grid grid-cols-2 gap-2">
              {NEW_STATUSES.map((s) => (
                <label
                  key={s}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors',
                    status === s ? 'border-brand-400 bg-brand-50/60' : 'border-slate-200 hover:border-slate-300',
                  )}
                >
                  <input type="radio" name="status" checked={status === s} onChange={() => setStatus(s)} />
                  <span>
                    <span className="block font-medium text-slate-900">{TRIP_STATUS_LABELS[s]}</span>
                    <span className="block text-xs text-slate-500">
                      {s === 'dreaming' ? 'Just an idea for now' : "It's happening, sorting details"}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" needsOnline disabled={!name.trim() || create.isPending}>
              Create trip
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
