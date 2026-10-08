import { useEffect, useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Loader2, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { PlacesNotConfigured, placeDetails, searchPlaces, type PlaceKind, type PlaceSuggestion } from '@/lib/places'
import type { PlaceDetails } from '@/lib/types'
import { field } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Set once per page load when the Places function reports it has no API key, so we stop asking. */
let placesUnavailable = false

/**
 * A text field that suggests Google places as you type. The typed text is always kept (so it works as a plain field
 * when lookup isn't set up); picking a suggestion also hands back the place details.
 */
export function PlaceSearch({
  id,
  value,
  onChange,
  onPick,
  kind,
  placeholder,
  autoFocus,
}: {
  id?: string
  value: string
  onChange: (text: string) => void
  onPick: (place: PlaceDetails) => void
  kind: PlaceKind
  placeholder?: string
  autoFocus?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const [typed, setTyped] = useState(false)
  // Google bills autocomplete keystrokes plus the final details call as one session.
  const session = useRef(crypto.randomUUID())

  useEffect(() => {
    if (!typed || placesUnavailable || value.trim().length < 2) {
      setSuggestions([])
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const found = await searchPlaces(value.trim(), kind, session.current)
        if (!cancelled) {
          setSuggestions(found)
          setActive(0)
          setOpen(found.length > 0)
        }
      } catch (e) {
        if (e instanceof PlacesNotConfigured) placesUnavailable = true
        else if (!cancelled) toast.error((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [value, kind, typed])

  async function pick(s: PlaceSuggestion) {
    setOpen(false)
    setTyped(false)
    onChange(s.primary)
    setLoading(true)
    try {
      onPick(await placeDetails(s.placeId, session.current))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
      session.current = crypto.randomUUID()
    }
  }

  return (
    <Popover.Root open={open && suggestions.length > 0} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div className="relative">
          <input
            id={id}
            autoFocus={autoFocus}
            autoComplete="off"
            value={value}
            placeholder={placeholder}
            onChange={(e) => {
              setTyped(true)
              onChange(e.target.value)
            }}
            onBlur={() => setOpen(false)}
            onKeyDown={(e) => {
              if (!open || suggestions.length === 0) return
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => (a + 1) % suggestions.length)
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => (a - 1 + suggestions.length) % suggestions.length)
              } else if (e.key === 'Enter') {
                e.preventDefault()
                void pick(suggestions[active])
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setOpen(false)
              }
            }}
            className={cn(field, 'w-full pr-9')}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          </span>
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="z-[55] max-h-[min(18rem,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-pop"
        >
          <ul role="listbox">
            {suggestions.map((s, i) => (
              <li key={s.placeId}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => void pick(s)}
                  className={cn(
                    'flex w-full flex-col rounded-lg px-2.5 py-1.5 text-left max-md:py-2.5',
                    i === active && 'bg-brand-50 text-brand-900',
                  )}
                >
                  <span className="truncate text-sm text-slate-800">{s.primary}</span>
                  {s.secondary && <span className="truncate text-xs text-slate-400">{s.secondary}</span>}
                </button>
              </li>
            ))}
          </ul>
          <p className="px-2.5 pb-0.5 pt-1 text-right text-[10px] text-slate-400">Powered by Google</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
