import { useEffect, useId, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import * as Popover from '@radix-ui/react-popover'
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/lib/useIsMobile'

const ISO = 'yyyy-MM-dd'
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

/** Arrow keys and Page Up/Down move the highlighted day while the calendar is open. */
const MOVES: Record<string, (d: Date) => Date> = {
  ArrowLeft: (d) => addDays(d, -1),
  ArrowRight: (d) => addDays(d, 1),
  ArrowUp: (d) => addDays(d, -7),
  ArrowDown: (d) => addDays(d, 7),
  PageUp: (d) => addMonths(d, -1),
  PageDown: (d) => addMonths(d, 1),
}

type Props = Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  value: string
  onChange: (value: string) => void
  /** Open the calendar when the user tabs or clicks into the field (not for `autoFocus`). */
  openOnFocus?: boolean
  /** Offer a Clear button in the calendar, for optional dates. */
  clearable?: boolean
}

/**
 * A date field that keeps the native input for typing and replaces its browser-drawn calendar with one that matches
 * the app. Focus stays in the input while the calendar is open, like the lookups, so autosave-on-blur rows are unaffected.
 * Phones keep the native picker, which is already a good touch control.
 */
export function DateInput({
  value,
  onChange,
  openOnFocus,
  clearable,
  className,
  onKeyDown,
  onFocus,
  onBlur,
  onClick,
  ref,
  ...props
}: Props) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(() => parse(value) ?? new Date())
  // Typing or the row's +/-/T shortcuts change the value directly; keep the highlight on it.
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    setShown(value)
    const next = parse(value)
    if (next) setActive(next)
  }
  const wrapper = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement | null>(null)
  const calendarId = useId()
  // A row that autofocuses its date on open shouldn't also pop the calendar over the rows below.
  const skipFocus = useRef(!!props.autoFocus)
  useEffect(() => {
    skipFocus.current = false
  }, [])
  const setInput = (el: HTMLInputElement | null) => {
    input.current = el
    assignRef(ref, el)
  }

  if (isMobile) {
    return (
      <input
        ref={setInput}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={onClick}
        className={className}
        {...props}
      />
    )
  }

  function show() {
    setActive(parse(value) ?? new Date())
    setOpen(true)
  }

  function pick(date: Date) {
    onChange(format(date, ISO))
    setOpen(false)
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (open) {
      const move = MOVES[e.key]
      if (move) {
        e.preventDefault()
        setActive(move)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        pick(active)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        return
      }
    } else if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault()
      show()
      return
    }
    onKeyDown?.(e)
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div ref={wrapper} className="relative w-full">
          <input
            {...props}
            ref={setInput}
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKey}
            onFocus={(e) => {
              if (openOnFocus && !skipFocus.current) show()
              onFocus?.(e)
            }}
            onBlur={(e) => {
              setOpen(false)
              onBlur?.(e)
            }}
            onClick={(e) => {
              // Clicking a field that already has focus (e.g. the autofocused one) still opens it.
              if (openOnFocus && !open) show()
              onClick?.(e)
            }}
            data-open={open}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? calendarId : undefined}
            aria-activedescendant={open ? dayId(calendarId, active) : undefined}
            className={cn('no-native-picker pr-8', className)}
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label="Choose date"
            // Keep the caret where it is; the click below moves focus into this field if it was elsewhere.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (document.activeElement !== input.current) {
                // Focusing opens it when `openOnFocus` is set; don't toggle it straight back.
                input.current?.focus()
                if (!openOnFocus) show()
              } else if (open) setOpen(false)
              else show()
            }}
            className={cn(
              'absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700',
              open && 'bg-brand-50 text-brand-700',
            )}
          >
            <CalendarDays className="h-4 w-4" />
          </button>
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          id={calendarId}
          aria-label="Calendar"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          // The input's own handler closes on Escape, so the key never reaches the row and undoes its edits.
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (wrapper.current?.contains(e.target as Node)) e.preventDefault()
          }}
          onMouseDown={(e) => e.preventDefault()}
          className="z-50 w-[17.5rem] rounded-2xl border border-slate-200 bg-white p-3 shadow-pop"
        >
          <Calendar
            id={calendarId}
            value={parse(value)}
            active={active}
            onActiveChange={setActive}
            onPick={pick}
            onClear={
              clearable && value
                ? () => {
                    onChange('')
                    setOpen(false)
                  }
                : undefined
            }
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function Calendar({
  id,
  value,
  active,
  onActiveChange,
  onPick,
  onClear,
}: {
  id: string
  value: Date | null
  active: Date
  onActiveChange: (date: Date) => void
  onPick: (date: Date) => void
  onClear?: () => void
}) {
  const today = new Date()
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(active)),
    end: endOfWeek(endOfMonth(active)),
  })

  return (
    <div className="select-none">
      <div className="mb-2 flex items-center justify-between pl-1.5">
        <div className="text-sm font-semibold text-slate-900" aria-live="polite">
          {format(active, 'MMMM yyyy')}
        </div>
        <div className="flex">
          <NavButton label="Previous month" onClick={() => onActiveChange(addMonths(active, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </NavButton>
          <NavButton label="Next month" onClick={() => onActiveChange(addMonths(active, 1))}>
            <ChevronRight className="h-4 w-4" />
          </NavButton>
        </div>
      </div>

      <div
        className="grid grid-cols-7 text-center text-[11px] font-medium uppercase tracking-wide text-slate-400"
        aria-hidden
      >
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((day) => {
          const selected = !!value && isSameDay(day, value)
          const highlighted = isSameDay(day, active)
          const isToday = isSameDay(day, today)
          return (
            <button
              key={day.toISOString()}
              id={dayId(id, day)}
              type="button"
              tabIndex={-1}
              aria-pressed={selected}
              aria-label={format(day, 'EEEE, MMMM d, yyyy')}
              onClick={() => onPick(day)}
              className={cn(
                'num relative mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors',
                isSameMonth(day, active) ? 'text-slate-700' : 'text-slate-300',
                selected
                  ? 'bg-brand-fill font-semibold text-white hover:bg-brand-fill-hover'
                  : highlighted
                    ? 'bg-brand-50 text-slate-900 ring-1 ring-inset ring-brand-400'
                    : 'hover:bg-slate-100',
                isToday && !selected && 'font-semibold text-brand-700',
              )}
            >
              {format(day, 'd')}
              {isToday && (
                <span className={cn('absolute bottom-1 h-1 w-1 rounded-full', selected ? 'bg-white' : 'bg-brand-500')} />
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
        <button
          type="button"
          tabIndex={-1}
          onClick={() => onPick(today)}
          className="rounded-md px-2 py-1 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
        >
          Today
        </button>
        {onClear ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={onClear}
            className="rounded-md px-2 py-1 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
          >
            Clear
          </button>
        ) : (
          <span className="pr-1 text-xs text-slate-400">Arrows move · Enter picks</span>
        )}
      </div>
    </div>
  )
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
    >
      {children}
    </button>
  )
}

function parse(value: string) {
  if (!value) return null
  const date = parseISO(value)
  return isValid(date) ? date : null
}

const dayId = (calendarId: string, day: Date) => `${calendarId}-${format(day, ISO)}`

function assignRef<T>(ref: Ref<T> | undefined, value: T) {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}
