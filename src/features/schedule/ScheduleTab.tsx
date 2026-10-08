import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { BedDouble, CalendarPlus, ExternalLink, LogIn, LogOut, MapPin, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useSaveTripRow, useWeather, type TripBundle } from '@/lib/queries'
import { formatDay, todayISO } from '@/lib/dates'
import { describeWeather, formatTemp, useTempUnit } from '@/lib/weather'
import { useIsMobile } from '@/lib/useIsMobile'
import { useOnline } from '@/lib/useOnline'
import type { Destination, Lodging, Transport, TripEvent, WeatherDay } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn, plural } from '@/lib/utils'
import { MODE_ICONS } from '@/features/transport/modes'
import { TransportDialog } from '@/features/transport/TransportSection'
import { LodgingDialog } from '@/features/lodging/LodgingSection'
import { DestinationDialog } from '@/features/trips/overview/DestinationsPanel'
import {
  buildSchedule,
  clockTime,
  dropStart,
  firstHour,
  movedTimes,
  type ItemKind,
  type PlacedItem,
  type ScheduleDay,
  type ScheduleItem,
} from './model'
import { EventDialog, type EventDraft } from './EventDialog'
import { EVENT_ICONS } from './eventKinds'
import { NotBooked } from './NotBooked'

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

function itemStyle(item: ScheduleItem) {
  return cn(KIND_STYLES[item.kind], item.tentative && 'border border-dashed border-brand-400 bg-brand-50/40 shadow-none ring-0')
}

function hourLabel(h: number) {
  if (h === 0) return '12 AM'
  if (h === 12) return 'Noon'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

function clockLabel(minutes: number) {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  return plural(minutes / 60, 'hour')
}

type Editing =
  | { kind: 'event'; event: TripEvent | null; initial?: EventDraft }
  | { kind: 'transport'; leg: Transport }
  | { kind: 'lodging'; stay: Lodging }
  | { kind: 'destination'; destination: Destination }

export function ScheduleTab({ trip, onShowOverview }: { trip: TripBundle; onShowOverview: () => void }) {
  const isMobile = useIsMobile()
  const days = useMemo(() => buildSchedule(trip), [trip])
  const { data: weather } = useWeather(
    trip.id,
    trip.destinations.map((d) => d.id),
  )
  const [editing, setEditing] = useState<Editing | null>(null)
  const online = useOnline()

  function open(item: ScheduleItem) {
    const id = item.sourceId
    if (item.kind === 'event') {
      const event = trip.events.find((e) => e.id === id)
      if (event) setEditing({ kind: 'event', event })
    } else if (item.kind === 'transport') {
      const leg = trip.transport.find((t) => t.id === id)
      if (leg) setEditing({ kind: 'transport', leg })
    } else if (item.kind === 'destination') {
      const destination = trip.destinations.find((d) => d.id === id)
      if (destination) setEditing({ kind: 'destination', destination })
    } else {
      const stay = trip.lodging.find((l) => l.id === id)
      if (stay) setEditing({ kind: 'lodging', stay })
    }
  }

  const saveEvent = useSaveTripRow<TripEvent>('travel_events', trip.id)
  function moveEvent(item: ScheduleItem, date: string, start: number) {
    const event = trip.events.find((e) => e.id === item.sourceId)
    if (!event) return
    saveEvent.mutate({ id: event.id, date, ...movedTimes(event, start) }, { onError: (e) => toast.error(e.message) })
  }

  const addEvent = (initial: EventDraft) => setEditing({ kind: 'event', event: null, initial })
  const close = () => setEditing(null)
  const weatherFor = (date: string) => weather?.find((w) => w.date === date)

  if (days.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center text-slate-500">
        <CalendarPlus className="h-7 w-7 text-slate-300" />
        Add destination dates, travel or a stay and the schedule fills itself in.
        <Button variant="outline" onClick={onShowOverview}>
          Add destinations
        </Button>
      </Card>
    )
  }

  return (
    <>
      {isMobile ? (
        <Agenda days={days} weatherFor={weatherFor} onOpen={open} onAdd={online ? addEvent : undefined} />
      ) : (
        <Grid days={days} weatherFor={weatherFor} onOpen={open} onAdd={online ? addEvent : undefined} onMove={online ? moveEvent : undefined} />
      )}
      {editing?.kind === 'event' && (
        <EventDialog tripId={trip.id} destinations={trip.destinations} event={editing.event} initial={editing.initial} onClose={close} />
      )}
      {editing?.kind === 'transport' && <TransportDialog trip={trip} leg={editing.leg} onClose={close} />}
      {editing?.kind === 'lodging' && <LodgingDialog trip={trip} stay={editing.stay} onClose={close} />}
      {editing?.kind === 'destination' && <DestinationDialog trip={trip} destination={editing.destination} onClose={close} />}
    </>
  )
}

interface ViewProps {
  days: ScheduleDay[]
  weatherFor: (date: string) => WeatherDay | undefined
  onOpen: (item: ScheduleItem) => void
  /** Unset while offline, which hides every way to add an event. */
  onAdd?: (draft: EventDraft) => void
}

interface GridProps extends ViewProps {
  /** Moves an event to a new day and start time; unset while offline. */
  onMove?: (item: ScheduleItem, date: string, start: number) => void
}

/** How far the pointer travels before a press on an event becomes a drag rather than a click. */
const DRAG_THRESHOLD_PX = 4
/** While dragging, how close to the top or bottom of the hours the pointer gets before the grid scrolls. */
const AUTOSCROLL_EDGE_PX = 40

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
              : EVENT_ICONS[item.eventKind ?? 'other']
  return <Icon className={cn('h-3 w-3 shrink-0', className)} />
}

/** Click/Enter/Space handling for an item block. A div, not a button, so its location can be a real link. */
function openOnActivate(open: () => void) {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: open,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
      e.preventDefault()
      open()
    },
  } as const
}

/** An item's subtitle; for an event with a location, a link that opens it in Google Maps. */
function LocationText({ item }: { item: ScheduleItem }) {
  if (!item.mapUrl) return <span className="opacity-70">{item.subtitle}</span>
  return (
    <a
      href={item.mapUrl}
      target="_blank"
      rel="noreferrer"
      title={`Open ${item.subtitle} in Google Maps`}
      onClick={(e) => e.stopPropagation()}
      className="opacity-80 underline-offset-2 hover:underline hover:opacity-100"
    >
      {item.subtitle}
      <ExternalLink className="ml-0.5 inline h-2.5 w-2.5 align-[-1px]" />
    </a>
  )
}

function DayWeather({ day }: { day?: WeatherDay }) {
  const unit = useTempUnit()
  if (!day) return null
  const { icon: Icon, label } = describeWeather(day.weather_code)
  return (
    <span className="flex items-center gap-1 text-[11px] text-slate-500" title={label}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="md:sr-only">{label}</span>
      <span className="num">{formatTemp(day.temp_max_c, unit)}</span>
    </span>
  )
}

interface Move {
  item: PlacedItem
  /** Minutes between the event's start and the point it was grabbed, so it doesn't jump under the pointer. */
  grab: number
  x: number
  y: number
  date: string
  start: number
  moved: boolean
}

/** A move retargeted to the day column and snapped start under the pointer. Off either side, the nearest day. */
function retarget(columns: Map<string, HTMLDivElement>, x: number, y: number, m: Move): Move {
  const rects = [...columns].map(([date, el]) => ({ date, rect: el.getBoundingClientRect() })).sort((a, b) => a.rect.left - b.rect.left)
  const hit = rects.find((r) => x < r.rect.right) ?? rects[rects.length - 1]
  const start = dropStart(((y - hit.rect.top) / HOUR_PX) * 60 - m.grab, m.item.end - m.item.start)
  return m.moved && hit.date === m.date && start === m.start ? m : { ...m, date: hit.date, start, moved: true }
}

function Grid({ days, weatherFor, onOpen, onAdd, onMove }: GridProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const header = useRef<HTMLDivElement>(null)
  const columnEls = useRef(new Map<string, HTMLDivElement>())
  const [move, setMove] = useState<Move | null>(null)
  const pointer = useRef({ x: 0, y: 0 })
  // The click that ends a drag (or follows Escape) shouldn't also open the event.
  const swallowClick = useRef(false)
  const dragged = move?.moved ? move : null
  const moving = Boolean(dragged)

  useEffect(() => {
    if (!moving) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      swallowClick.current = true
      setMove(null)
    }
    // Each frame: scroll when the pointer is near the top or bottom of the hours, and keep the drop under the pointer.
    let frame = 0
    const tick = () => {
      const el = scroller.current
      if (el && header.current) {
        const { y, x } = pointer.current
        const top = header.current.getBoundingClientRect().bottom
        const bottom = el.getBoundingClientRect().bottom
        if (y < top + AUTOSCROLL_EDGE_PX) el.scrollTop -= Math.min(AUTOSCROLL_EDGE_PX, top + AUTOSCROLL_EDGE_PX - y) / 2
        else if (y > bottom - AUTOSCROLL_EDGE_PX) el.scrollTop += Math.min(AUTOSCROLL_EDGE_PX, y - bottom + AUTOSCROLL_EDGE_PX) / 2
        setMove((m) => m && retarget(columnEls.current, x, y, m))
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKey)
    }
  }, [moving])

  function onItemPointerDown(e: PointerEvent<HTMLDivElement>, item: PlacedItem) {
    if (!onMove || item.kind !== 'event' || e.button !== 0 || (e.target as Element).closest('a')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const top = columnEls.current.get(item.date)!.getBoundingClientRect().top
    const grab = ((e.clientY - top) / HOUR_PX) * 60 - item.start
    pointer.current = { x: e.clientX, y: e.clientY }
    setMove({ item, grab, x: e.clientX, y: e.clientY, date: item.date, start: item.start, moved: false })
  }

  function onItemPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!move) return
    pointer.current = { x: e.clientX, y: e.clientY }
    if (!move.moved && Math.hypot(e.clientX - move.x, e.clientY - move.y) < DRAG_THRESHOLD_PX) return
    const next = retarget(columnEls.current, e.clientX, e.clientY, move)
    if (next !== move) setMove(next)
  }

  function onItemPointerUp() {
    setTimeout(() => (swallowClick.current = false))
    if (!move) return
    setMove(null)
    if (!move.moved) return
    swallowClick.current = true
    if (move.date !== move.item.date || move.start !== move.item.start) onMove?.(move.item, move.date, move.start)
  }

  function onItemPointerCancel() {
    swallowClick.current = false
    setMove(null)
  }

  const today = todayISO()
  const startHour = firstHour(days)

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = startHour * HOUR_PX
  }, [startHour])

  const columns = `3.5rem repeat(${days.length}, minmax(9.5rem, 1fr))`
  const [hover, setHover] = useState<{ date: string; hour: number } | null>(null)
  // `hour` is the hour cell pressed; `half` is the half-hour slot (0–47) under the pointer.
  const [drag, setDrag] = useState<{ date: string; hour: number; startHalf: number; half: number; moved: boolean } | null>(null)

  function halfAt(e: PointerEvent<HTMLDivElement>) {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top
    return Math.min(47, Math.max(0, Math.floor(y / (HOUR_PX / 2))))
  }

  function dragRange(d: NonNullable<typeof drag>) {
    const anchor = d.hour * 60
    // A plain click books the whole hour; once dragged, the far edge follows the pointer in half hours.
    if (!d.moved) return { start: anchor, end: anchor + 60 }
    const pointer = d.half * 30
    return pointer >= anchor ? { start: anchor, end: pointer + 30 } : { start: pointer, end: anchor + 60 }
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>, date: string) {
    if (!onAdd || e.button !== 0 || e.target !== e.currentTarget) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const half = halfAt(e)
    setDrag({ date, hour: Math.floor(half / 2), startHalf: half, half, moved: false })
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>, date: string) {
    const half = halfAt(e)
    if (drag) {
      if (half !== drag.half) setDrag({ ...drag, half, moved: drag.moved || half !== drag.startHalf })
      return
    }
    // Over an existing item: that item is the click target, not the empty slot.
    const hour = Math.floor(half / 2)
    const next = onAdd && e.target === e.currentTarget ? { date, hour } : null
    if (next?.date !== hover?.date || next?.hour !== hover?.hour) setHover(next)
  }

  function onPointerUp() {
    if (!drag || !onAdd) return
    const { start, end } = dragRange(drag)
    setDrag(null)
    setHover(null)
    onAdd({ date: drag.date, start_time: clockTime(start), end_time: clockTime(end) })
  }

  function slotFor(date: string) {
    if (drag) return drag.date === date ? { ...dragRange(drag), dragging: true } : null
    return hover?.date === date ? { start: hover.hour * 60, end: hover.hour * 60 + 60, dragging: false } : null
  }

  return (
    <Card className="overflow-hidden">
      <div ref={scroller} className="max-h-[calc(100dvh-14rem)] min-h-[28rem] overflow-auto">
        <div className="min-w-fit">
          {/* Header: dates, weather and all-day items. Sticky so it stays put while scrolling hours. */}
          <div ref={header} className="sticky top-0 z-20 grid border-b border-slate-200 bg-white" style={{ gridTemplateColumns: columns }}>
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
                      className={cn(
                        'flex w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium',
                        itemStyle(item),
                      )}
                      title={item.tentative ? `${item.title} (not booked)` : item.title}
                    >
                      <ItemIcon item={item} />
                      <span className="truncate">
                        {item.subtitle && <span className="opacity-70">{item.subtitle}: </span>}
                        {item.title}
                        {item.tentative && <span className="sr-only"> (not booked)</span>}
                      </span>
                    </button>
                  ))}
                  {onAdd && (
                    <button
                      type="button"
                      onClick={() => onAdd({ date: d.date, start_time: '', end_time: '' })}
                      className="flex w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-slate-50 hover:text-brand-700"
                    >
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Hours */}
          <div className="grid" style={{ gridTemplateColumns: columns }}>
            <div className="sticky left-0 z-10 bg-white">
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="relative border-t border-transparent pr-1.5 text-right text-[10px] text-slate-400"
                  style={{ height: HOUR_PX }}
                >
                  {h > 0 && <span className="relative -top-2">{hourLabel(h)}</span>}
                </div>
              ))}
            </div>
            {days.map((d) => {
              const slot = slotFor(d.date)
              return (
                <div
                  key={d.date}
                  ref={(el) => {
                    if (el) columnEls.current.set(d.date, el)
                    else columnEls.current.delete(d.date)
                  }}
                  onPointerDown={(e) => onPointerDown(e, d.date)}
                  onPointerMove={(e) => onPointerMove(e, d.date)}
                  onPointerUp={onPointerUp}
                  onPointerCancel={() => setDrag(null)}
                  onPointerLeave={() => setHover(null)}
                  className={cn('relative select-none border-l border-slate-100', onAdd && 'cursor-pointer', d.date === today && 'bg-brand-50/30')}
                  style={{
                    height: 24 * HOUR_PX,
                    backgroundImage: `repeating-linear-gradient(to bottom, var(--color-slate-100) 0 1px, transparent 1px ${HOUR_PX}px)`,
                  }}
                >
                  {slot && (
                    <div
                      className={cn(
                        'pointer-events-none absolute inset-x-0.5 flex flex-col overflow-hidden rounded-md px-1.5 pt-1 text-[11px] leading-tight text-brand-700',
                        slot.dragging ? 'bg-brand-100/70 ring-1 ring-inset ring-brand-300' : 'bg-brand-50/80',
                      )}
                      style={{
                        top: (slot.start / 60) * HOUR_PX + 1,
                        height: ((slot.end - slot.start) / 60) * HOUR_PX - 2,
                      }}
                    >
                      <span className="flex items-center gap-1 truncate font-medium">
                        <Plus className="h-3 w-3 shrink-0" />
                        {slot.dragging ? `${clockLabel(slot.start)} – ${clockLabel(slot.end)}` : 'Add event'}
                      </span>
                      <span className="truncate opacity-70">
                        {slot.dragging ? durationLabel(slot.end - slot.start) : 'Click, or drag to set the time'}
                      </span>
                    </div>
                  )}
                  {dragged?.date === d.date && (
                    <div
                      className={cn(
                        'pointer-events-none absolute inset-x-0.5 z-10 flex flex-col overflow-hidden rounded-md px-1.5 pt-1 text-[11px] leading-tight shadow-md ring-2 ring-brand-400',
                        KIND_STYLES.event,
                      )}
                      style={{
                        top: (dragged.start / 60) * HOUR_PX + 1,
                        height: ((dragged.item.end - dragged.item.start) / 60) * HOUR_PX - 2,
                      }}
                    >
                      <span className="flex items-center gap-1 font-medium">
                        <ItemIcon item={dragged.item} />
                        <span className="truncate">{dragged.item.title}</span>
                      </span>
                      <span className="truncate">{clockLabel(dragged.start)}</span>
                    </div>
                  )}
                  {d.timed.map((item) => {
                    // An hour block fits two title lines plus the time at a 13px line height.
                    const roomy = item.end - item.start >= 60
                    return (
                      <div
                        key={item.key}
                        {...openOnActivate(() => !swallowClick.current && onOpen(item))}
                        onPointerDown={(e) => onItemPointerDown(e, item)}
                        onPointerMove={onItemPointerMove}
                        onPointerUp={onItemPointerUp}
                        onPointerCancel={onItemPointerCancel}
                        className={cn(
                          'absolute flex cursor-pointer flex-col justify-start overflow-hidden rounded-md px-1.5 pb-0.5 pt-1 text-left text-[11px] leading-tight shadow-sm',
                          roomy && 'leading-[13px]',
                          itemStyle(item),
                          onMove && item.kind === 'event' && 'cursor-grab',
                          dragged?.item.key === item.key && 'cursor-grabbing opacity-40',
                        )}
                        style={{
                          top: (item.start / 60) * HOUR_PX + 1,
                          height: Math.max(((item.end - item.start) / 60) * HOUR_PX - 2, 18),
                          left: `calc(${(item.lane / item.lanes) * 100}% + 2px)`,
                          width: `calc(${100 / item.lanes}% - 4px)`,
                        }}
                        title={`${clockLabel(item.start)} ${item.title}${item.tentative ? ' (not booked)' : ''}`}
                      >
                        <span className={cn('flex gap-1 font-medium', roomy ? 'items-start' : 'items-center')}>
                          <ItemIcon item={item} className={cn(roomy && 'mt-px')} />
                          <span className={roomy ? 'line-clamp-2 break-words' : 'truncate'}>
                            {item.title}
                            {item.tentative && <span className="sr-only"> (not booked)</span>}
                          </span>
                        </span>
                        <span className="block truncate">
                          <span className="opacity-70">{clockLabel(item.start)}</span>
                          {item.subtitle && (
                            <>
                              <span className="opacity-70"> · </span>
                              <LocationText item={item} />
                            </>
                          )}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
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
            <span className={cn('font-semibold', d.date === today ? 'text-brand-700' : 'text-slate-800')}>{formatDay(d.date, 'EEEE, MMM d')}</span>
            <span className="flex items-center gap-2">
              <DayWeather day={weatherFor(d.date)} />
              {onAdd && (
                <Button variant="ghost" size="icon" onClick={() => onAdd({ date: d.date, start_time: '', end_time: '' })} aria-label="Add event">
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </span>
          </div>
          <ul className="space-y-1.5 p-3">
            {d.allDay.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => onOpen(item)}
                  className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm', itemStyle(item))}
                >
                  <ItemIcon item={item} className="h-3.5 w-3.5" />
                  <span className="min-w-0 flex-1 truncate">
                    {item.subtitle && <span className="opacity-70">{item.subtitle}: </span>}
                    {item.title}
                  </span>
                  {item.tentative && <NotBooked />}
                  <span className="text-xs opacity-60">All day</span>
                </button>
              </li>
            ))}
            {d.timed.map((item) => (
              <li key={item.key}>
                <div
                  {...openOnActivate(() => onOpen(item))}
                  className={cn('flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm', itemStyle(item))}
                >
                  <span className="num w-16 shrink-0 text-xs font-medium opacity-80">{clockLabel(item.start)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-medium">
                      <ItemIcon item={item} className="h-3.5 w-3.5" />
                      <span className="truncate">{item.title}</span>
                      {item.tentative && <NotBooked />}
                    </span>
                    {item.subtitle && (
                      <span className="block truncate text-xs">
                        <LocationText item={item} />
                      </span>
                    )}
                  </span>
                </div>
              </li>
            ))}
            {d.allDay.length === 0 && d.timed.length === 0 && <li className="px-1 text-xs text-slate-400">Nothing planned yet.</li>}
          </ul>
        </Card>
      ))}
    </div>
  )
}
