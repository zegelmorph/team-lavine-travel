import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAutoRefreshWeather, useDeleteTrip, useTrip, useUpdateTrip, type TripBundle } from '@/lib/queries'
import { formatDateRange, todayISO } from '@/lib/dates'
import { TRIP_STATUSES, TRIP_STATUS_LABELS, type TripStatus } from '@/lib/types'
import { PillTabs } from '@/components/ui/pill-tabs'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input, Label, Select } from '@/components/ui/input'
import { confirmAction } from '@/components/ui/confirm'
import { NotSavedOffline } from '@/components/Offline'
import { useOnline } from '@/lib/useOnline'
import { cn } from '@/lib/utils'
import { countdown } from './model'
import { STATUS_STYLES } from './StatusBadge'
import { tripRange } from './tripRange'
import { OverviewTab } from './overview/OverviewTab'
import { ScheduleTab } from '@/features/schedule/ScheduleTab'

const TABS = [
  ['overview', 'Overview'],
  ['schedule', 'Schedule'],
] as const
type TripTab = (typeof TABS)[number][0]

export function TripPage() {
  const { tripId = '' } = useParams()
  const { data: trip, isPending, isPaused, error } = useTrip(tripId)
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find(([id]) => id === params.get('tab'))?.[0] ?? 'overview') as TripTab
  const setTab = (id: TripTab) => setParams(id === 'overview' ? {} : { tab: id }, { replace: true })
  useAutoRefreshWeather(tripId, Boolean(trip?.destinations.some((d) => d.lat != null && d.start_date)))

  if (isPending && isPaused) return <NotSavedOffline />
  if (isPending) return <div className="p-6 text-slate-400">Loading...</div>
  if (error) return <div className="p-6 text-red-700">{(error as Error).message}</div>
  if (!trip) {
    return (
      <div className="p-6 text-slate-500">
        This trip doesn't exist anymore.{' '}
        <Link to="/" className="font-medium text-brand-700">
          Back to trips
        </Link>
      </div>
    )
  }

  return (
    <div className={cn('mx-auto space-y-4 p-3 pb-24 md:space-y-6 md:p-6 lg:p-8', tab === 'schedule' ? 'max-w-none' : 'max-w-5xl')}>
      <TripHeader trip={trip} />
      <div className="-mx-3 overflow-x-auto px-3 md:mx-0 md:px-0">
        <PillTabs value={tab} options={TABS} onChange={setTab} />
      </div>
      {tab === 'overview' && <OverviewTab trip={trip} />}
      {tab === 'schedule' && <ScheduleTab trip={trip} onShowOverview={() => setTab('overview')} />}
    </div>
  )
}

function TripHeader({ trip }: { trip: TripBundle }) {
  const navigate = useNavigate()
  const update = useUpdateTrip(trip.id)
  const remove = useDeleteTrip()
  const [editing, setEditing] = useState(false)
  const online = useOnline()
  const { start, end } = tripRange(trip)
  const until = countdown(start, end, todayISO())

  function setStatus(status: TripStatus) {
    update.mutate({ status }, { onError: (e) => toast.error(e.message) })
  }

  async function onDelete() {
    const ok = await confirmAction({
      title: `Delete ${trip.name}?`,
      message: 'Destinations, travel, lodging, the schedule and the packing list all go with it.',
      confirmLabel: 'Delete trip',
    })
    if (!ok) return
    remove.mutate(trip.id, {
      onSuccess: () => {
        toast.success(`${trip.name} deleted`)
        navigate('/', { replace: true })
      },
      onError: (e) => toast.error(e.message),
    })
  }

  return (
    <div>
      <Link
        to="/"
        className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 max-md:-ml-1 max-md:mb-0 max-md:py-2.5 max-md:pl-1 max-md:pr-3 max-md:text-sm"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Trips
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">
            <span className="truncate">{trip.name}</span>
            <Button variant="ghost" size="icon" needsOnline onClick={() => setEditing(true)} title="Rename trip">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" needsOnline onClick={onDelete} title="Delete trip" className="-ml-1.5">
              <Trash2 className="h-4 w-4" />
            </Button>
          </h1>
          <p className="text-slate-500">
            {formatDateRange(start, end)}
            {until && trip.status !== 'dreaming' && <span className="ml-2 font-medium text-brand-700">· {until}</span>}
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 md:items-end">
          <Select
            aria-label="Status"
            aria-describedby="status-hint"
            value={trip.status}
            disabled={!online}
            onChange={(e) => setStatus(e.target.value as TripStatus)}
            className={cn('h-8 rounded-full border-0 pl-3 text-xs font-medium max-md:h-9', STATUS_STYLES[trip.status])}
          >
            {TRIP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TRIP_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          <span id="status-hint" className="text-[11px] text-slate-400">
            Updates from the destination dates
          </span>
        </div>
      </div>
      {editing && <EditTripDialog trip={trip} onClose={() => setEditing(false)} />}
    </div>
  )
}

function EditTripDialog({ trip, onClose }: { trip: TripBundle; onClose: () => void }) {
  const update = useUpdateTrip(trip.id)
  const [name, setName] = useState(trip.name)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    update.mutate({ name: name.trim() }, { onSuccess: onClose, onError: (err) => toast.error(err.message) })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Rename trip" className="max-w-md">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="trip-name">Name</Label>
            <Input id="trip-name" autoFocus required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" needsOnline disabled={!name.trim() || update.isPending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
