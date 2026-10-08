import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { BedDouble, CalendarPlus, LogIn, LogOut, MapPin, Plus, Star } from 'lucide-react'
import { useWeather, type TripBundle } from '@/lib/queries'
import { formatDay, todayISO } from '@/lib/dates'
import { describeWeather, formatTemp, useTempUnit } from '@/lib/weather'
import { useIsMobile } from '@/lib/useIsMobile'
import type { TripEvent, WeatherDay } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MODE_ICONS } from '@/features/transport/modes'
import type { TripTab } from '@/features/trips/TripPage'
import { buildSchedule, firstHour, type ItemKind, type ScheduleDay, type ScheduleItem } from './model'
import { EventDialog, type EventDraft } from './EventDialog'

const HOUR_PX = 48
const HOURS = Array.from({ length: 24 }, (_, h) => h)

const KIND_STYLES: Record<ItemKind, string> = {
  destination: 'bg-slate-100 text-slate-700',
  lodging: 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/20',
  checkin: 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/20',
  checkout: 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/20',
  transport: 'bg-sky-50 text-sky-900 ring-1 ring-inset ring-sky-200 dark:bg-sky-400/10 dark:text-sky-200 dark:ring-sky-400/20',
  event: 'bg-brand-50 text-brand-900 ring-1 ring-inset ring-brand-200',
}

function hourLabel(h: number) {
  if (h === 0) return '12 AM'
  if (h === 12) return 'Noon'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

function clock(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function clockLabel(minutes: number) {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export function ScheduleTab({ trip, onOpenTab }: { trip: TripBundle; onOpenTab: (tab: TripTab) => void }) {
  const isMobile = useIsMobile()
  const days = useMemo(() => buildSchedule(trip), [trip])
  const { data: weather } = useWeather(trip.id, trip.destinations.map((d) => d.id))
  const [editing, setEditing] = useState<{ event: TripEvent | null; initial?: EventDraft } | null>(null)

  function open(item: ScheduleItem) {
    if (item.kind === 'event') {
      const event = trip.events.find((e) => e.id === item.sourceId)
      if (event) setEditing({ event })
    } else if (item.kind === 'transport') onOpenTab('transport')
    else if (item.kind === 'destination') onOpenTab('overview')
    else onOpenTab('lodging')
  }

  const addEvent = (initial: EventDraft) => setEditing({ event: null, initial })
  const weatherFor = (date: string) => weather?.find((w) => w.date === date)

  if (days.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center text-slate-500">
        <CalendarPlus className="h-7 w-7 text-slate-300" />
        Add destination dates, travel or a stay and the schedule fills itself in.
        <Button variant="outline" onClick={() => onOpenTab('overview')}>
          Add destinations
        </Button>
      </Card>
    )
  }

  return (
    <>
      {isMobile ? (
        <Agenda days={days} weatherFor={weatherFor} onOpen={open} onAdd={addEvent} />
      ) : (
        <Grid days={days} weatherFor={weatherFor} onOpen={open} onAdd={addEvent} />
      )}
      {editing && (
        <EventDialog tripId={trip.id} event={editing.event} initial={editing.initial} onClose={() => setEditing(null)} />
      )}
    </>
  )
}

interface ViewProps {
  days: ScheduleDay[]
  weatherFor: (date: string) => WeatherDay | undefined
  onOpen: (item: ScheduleItem) => void
  onAdd: (draft: EventDraft) => void
}

function ItemIcon({ item, className }: { item: ScheduleItem; className?: string }) {
  const Icon =
    item.kind === 'destination'
      ? MapPin
      : item.kind === 'lodging'
        ? BedDouble
        : item.kind === 'checkin'
          ? LogIn
          : item.kind === 'checkout'
            ? LogOut
            : item.kind === 'transport'
              ? MODE_ICONS[item.mode ?? 'other']
              : Star
  return <Icon className={cn('h-3 w-3 shrink-0', className)} />
}

function DayWeather({ day }: { day?: WeatherDay }) {
  const unit = useTempUnit()
  if (!day) return null
  const { icon: Icon, label } = describeWeather(day.weather_code)
  return (
    <span className="flex items-center gap-1 text-[11px] text-slate-500" title={label}>
      <Icon className="h-3.5 w-3.5" />
      <span className="num">{formatTemp(day.temp_max_c, unit)}</span>
    </span>
  )
}

function Grid({ days, weatherFor, onOpen, onAdd }: ViewProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const today = todayISO()
  const startHour = firstHour(days)

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = startHour * HOUR_PX
  }, [startHour])

  const columns = `3.5rem repeat(${days.length}, minmax(9.5rem, 1fr))`

  function onColumnClick(e: MouseEvent<HTMLDivElement>, date: string) {
    if (e.target !== e.currentTarget) return
    const y = e.nativeEvent.offsetY
    const minutes = Math.min(23 * 60 + 30, Math.max(0, Math.floor((y / HOUR_PX) * 2) * 30))
    onAdd({ date, start_time: clock(minutes), end_time: clock(Math.min(24 * 60 - 1, minutes + 60)) })
  }

  return (
    <Card className="overflow-hidden">
      <div ref={scroller} className="max-h-[calc(100dvh-14rem)] min-h-[28rem] overflow-auto">
        <div className="min-w-fit">
          {/* Header: dates, weather and all-day items. Sticky so it stays put while scrolling hours. */}
          <div className="sticky top-0 z-20 grid border-b border-slate-200 bg-white" style={{ gridTemplateColumns: columns }}>
            <div className="sticky left-0 z-10 bg-white" />
            {days.map((d) => (
              <div key={d.date} className={cn('border-l border-slate-100 px-1.5 pb-1.5 pt-2', d.date === today && 'bg-brand-50/50')}>
                <div className="flex items-center justify-between gap-1 px-0.5">
                  <span className={cn('text-xs font-semibold', d.date === today ? 'text-brand-700' : 'text-slate-700')}>
                    {formatDay(d.date, 'EEE, MMM d')}
                  </span>
                  <DayWeather day={weatherFor(d.date)} />
                </div>
                <div className="mt-1.5 space-y-1">
                  {d.allDay.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => onOpen(item)}
                      className={cn('flex w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium', KIND_STYLES[item.kind])}
                      title={item.title}
                    >
                      <ItemIcon item={item} />
                      <span className="truncate">
                        {item.subtitle && <span className="opacity-70">{item.subtitle}: </span>}
                        {item.title}
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => onAdd({ date: d.date, start_time: '', end_time: '' })}
                    className="flex w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-slate-50 hover:text-brand-700"
                  >
                    <Plus className="h-3 w-3" /> Add
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Hours */}
          <div className="grid" style={{ gridTemplateColumns: columns }}>
            <div className="sticky left-0 z-10 bg-white">
              {HOURS.map((h) => (
                <div key={h} className="relative border-t border-transparent pr-1.5 text-right text-[10px] text-slate-400" style={{ height: HOUR_PX }}>
                  {h > 0 && <span className="relative -top-2">{hourLabel(h)}</span>}
                </div>
              ))}
            </div>
            {days.map((d) => (
              <div
                key={d.date}
                onClick={(e) => onColumnClick(e, d.date)}
                className={cn('relative cursor-cell border-l border-slate-100', d.date === today && 'bg-brand-50/30')}
                style={{
                  height: 24 * HOUR_PX,
                  backgroundImage: `repeating-linear-gradient(to bottom, var(--color-slate-100) 0 1px, transparent 1px ${HOUR_PX}px)`,
                }}
              >
                {d.timed.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onOpen(item)}
                    className={cn(
                      'absolute overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm',
                      KIND_STYLES[item.kind],
                    )}
                    style={{
                      top: (item.start / 60) * HOUR_PX + 1,
                      height: Math.max(((item.end - item.start) / 60) * HOUR_PX - 2, 18),
                      left: `calc(${(item.lane / item.lanes) * 100}% + 2px)`,
                      width: `calc(${100 / item.lanes}% - 4px)`,
                    }}
                    title={`${clockLabel(item.start)} ${item.title}`}
                  >
                    <span className="flex items-center gap-1 font-medium">
                      <ItemIcon item={item} />
                      <span className="truncate">{item.title}</span>
                    </span>
                    <span className="block truncate opacity-70">
                      {clockLabel(item.start)}
                      {item.subtitle && ` · ${item.subtitle}`}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}

function Agenda({ days, weatherFor, onOpen, onAdd }: ViewProps) {
  const today = todayISO()
  return (
    <div className="space-y-3">
      {days.map((d) => (
        <Card key={d.date} className={cn('overflow-hidden', d.date === today && 'ring-2 ring-brand-300')}>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className={cn('font-semibold', d.date === today ? 'text-brand-700' : 'text-slate-800')}>
              {formatDay(d.date, 'EEEE, MMM d')}
            </span>
            <span className="flex items-center gap-2">
              <DayWeather day={weatherFor(d.date)} />
              <Button variant="ghost" size="icon" onClick={() => onAdd({ date: d.date, start_time: '', end_time: '' })} aria-label="Add event">
                <Plus className="h-4 w-4" />
              </Button>
            </span>
          </div>
          <ul className="space-y-1.5 p-3">
            {d.allDay.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => onOpen(item)}
                  className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm', KIND_STYLES[item.kind])}
                >
                  <ItemIcon item={item} className="h-3.5 w-3.5" />
                  <span className="min-w-0 flex-1 truncate">
                    {item.subtitle && <span className="opacity-70">{item.subtitle}: </span>}
                    {item.title}
                  </span>
                  <span className="text-xs opacity-60">All day</span>
                </button>
              </li>
            ))}
            {d.timed.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => onOpen(item)}
                  className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm', KIND_STYLES[item.kind])}
                >
                  <span className="num w-16 shrink-0 text-xs font-medium opacity-80">{clockLabel(item.start)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.title}</span>
                    {item.subtitle && <span className="block truncate text-xs opacity-70">{item.subtitle}</span>}
                  </span>
                </button>
              </li>
            ))}
            {d.allDay.length === 0 && d.timed.length === 0 && (
              <li className="px-1 text-xs text-slate-400">Nothing planned yet.</li>
            )}
          </ul>
        </Card>
      ))}
    </div>
  )
}
