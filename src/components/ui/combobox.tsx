import * as React from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Command } from 'cmdk'
import { cn, focusNextField, normalizePath } from '@/lib/utils'

export interface ComboOption {
  value: string
  label: string
  hint?: string
}

interface ComboboxProps {
  options: ComboOption[]
  value: string | null
  /** Display text when value is set but not present in options (e.g. special values like "Split"). */
  displayLabel?: string
  onChange: (value: string | null, option?: ComboOption) => void
  /** When provided, typing text that matches no option offers to create it. */
  onCreate?: (text: string) => void
  extraItems?: { value: string; label: string; onSelect: () => void }[]
  placeholder?: string
  className?: string
  autoFocus?: boolean
  /** Show the list as soon as the field gets focus instead of on the first keystroke. */
  openOnFocus?: boolean
  /** `inline` is the borderless style used inside register rows. */
  variant?: 'field' | 'inline'
}

/** Time of the latest key press or pointer press, to tell a user moving focus from a script doing it. */
let lastUserInput = 0
if (typeof window !== 'undefined') {
  const mark = () => (lastUserInput = performance.now())
  window.addEventListener('keydown', mark, true)
  window.addEventListener('pointerdown', mark, true)
}

const VARIANTS = {
  field:
    'h-9 max-md:h-11 rounded-lg border border-slate-200 bg-white px-3 hover:border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20',
  inline:
    'h-8 rounded-md border border-transparent bg-white/70 px-2 hover:border-slate-200 focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20',
}

/**
 * Type-ahead lookup used for Payee and Category cells. The trigger is a plain text input so
 * keyboard entry works like Quicken: type, arrow to a match, Enter/Tab to accept.
 */
export function Combobox({
  options,
  value,
  displayLabel,
  onChange,
  onCreate,
  extraItems,
  placeholder,
  className,
  autoFocus,
  openOnFocus,
  variant = 'field',
}: ComboboxProps) {
  const selected = options.find((o) => o.value === value)
  const label = selected?.label ?? displayLabel ?? ''
  const [open, setOpen] = React.useState(false)
  const [text, setText] = React.useState(label)
  const [active, setActive] = React.useState('')
  /** Whether the user has edited the text since the list opened; until then the text tracks the value. */
  const [dirty, setDirty] = React.useState(false)

  // The value can change while the list is open but untouched, e.g. a memorized payee fills the category in the
  // same moment focus lands here.
  React.useEffect(() => {
    if (!open || !dirty) setText(label)
  }, [label, open, dirty])

  // Category labels display "A › B" but may be typed as "A:B"; compare in the stored form.
  const norm = (s: string) => normalizePath(s).toLowerCase()
  const q = norm(text.trim())
  const filtered = React.useMemo(() => {
    if (!q || q === norm(label)) return options.slice(0, 200)
    const starts: ComboOption[] = []
    const contains: ComboOption[] = []
    for (const o of options) {
      const l = norm(o.label)
      if (l.startsWith(q) || l.split(':').some((seg) => seg.startsWith(q))) starts.push(o)
      else if (l.includes(q)) contains.push(o)
    }
    return [...starts, ...contains].slice(0, 200)
  }, [options, q, label])

  const exact = options.some((o) => norm(o.label) === q)
  const canCreate = Boolean(onCreate && q && !exact)
  const typed = dirty && q !== norm(label)
  const [navigated, setNavigated] = React.useState(false)
  /** The list only owns Enter/Escape once the user has typed or arrowed; until then they belong to the form. */
  const engaged = open && (typed || navigated)

  React.useEffect(() => {
    if (!open) {
      setNavigated(false)
      setDirty(false)
    }
  }, [open])

  const inputRef = React.useRef<HTMLInputElement>(null)
  /** Where focus went when this field was last left, to undo cmdk handing it straight back (see onFocus). */
  const leftTo = React.useRef<{ el: Element; at: number } | null>(null)

  function commit(itemValue: string) {
    if (itemValue.startsWith('__extra__')) {
      extraItems?.find((e) => `__extra__${e.value}` === itemValue)?.onSelect()
    } else if (itemValue === '__create__') {
      onCreate?.(text.trim())
    } else {
      const opt = options.find((o) => o.value === itemValue)
      if (opt) {
        onChange(opt.value, opt)
        setText(opt.label)
      }
    }
    setOpen(false)
  }

  /** Picking from the list (Enter or click) accepts the value and moves on, like Tab. */
  function pick(itemValue: string) {
    commit(itemValue)
    if (itemValue.startsWith('__extra__')) return
    const input = inputRef.current
    if (input) setTimeout(() => focusNextField(input), 0)
  }

  // While typing, extra items stay on top but are disabled so cmdk highlights the first match instead; a click
  // still runs them (cmdk ignores clicks on disabled items, so mousedown handles it).
  const extras = extraItems?.map((e) => (
    <Command.Item
      key={e.value}
      value={`__extra__${e.value}`}
      disabled={typed}
      onMouseDown={(ev) => {
        ev.preventDefault()
        if (typed) pick(`__extra__${e.value}`)
      }}
      onSelect={pick}
      className="cursor-pointer rounded-lg px-2.5 py-1.5 font-medium text-brand-700 max-md:py-2.5 data-[selected=true]:bg-brand-50 data-[selected=true]:text-brand-900"
    >
      {e.label}
    </Command.Item>
  ))
  /**
   * Tab and blur accept the highlighted match only after typing or arrowing (so hovering or clearing the text
   * doesn't pick something); only Enter or a click runs an extra item.
   */
  const acceptable = engaged && (q || navigated) && active && !active.startsWith('__extra__') ? active : ''

  function handleBlur(e: React.FocusEvent) {
    leftTo.current = e.relatedTarget ? { el: e.relatedTarget, at: performance.now() } : null
    if (!open) return
    if (dirty && !text.trim()) {
      onChange(null)
    } else if (acceptable) {
      commit(acceptable)
      return
    }
    setOpen(false)
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Command shouldFilter={false} value={active} onValueChange={setActive} loop>
        <Popover.Anchor asChild>
          <Command.Input
            ref={inputRef}
            value={text}
            data-open={engaged}
            autoFocus={autoFocus}
            placeholder={placeholder}
            onValueChange={(v) => {
              setText(v)
              setDirty(true)
              if (!open) setOpen(true)
            }}
            onFocus={(e) => {
              // cmdk refocuses its own input when its selection changes while any lookup has focus, which yanks
              // focus back here right after the user moved on to the next lookup. Send it back where it went.
              const left = leftTo.current
              leftTo.current = null
              if (left && e.relatedTarget === left.el && lastUserInput < left.at && performance.now() - left.at < 300) {
                ;(left.el as HTMLElement).focus()
                return
              }
              e.currentTarget.select()
              if (openOnFocus) setOpen(true)
            }}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Home' || e.key === 'End') {
                // cmdk turns these into first/last item and cancels the caret move; keep them for editing the text.
                e.stopPropagation()
                return
              }
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') setNavigated(true)
              if (e.key === 'Enter' && open && !engaged) {
                // Keep cmdk from running the highlighted item; Enter carries on to the form (e.g. saves the row).
                e.preventDefault()
                setOpen(false)
                return
              }
              if (e.key === 'Tab' && !e.shiftKey && open && acceptable) {
                // Accepting can re-render sibling cells (e.g. a memorized payee fills the category),
                // so move focus explicitly once the update has landed instead of relying on native Tab.
                e.preventDefault()
                pick(acceptable)
                return
              }
              if (e.key === 'Tab' && open && acceptable) commit(acceptable)
              if (e.key === 'Escape') {
                setText(label)
                setOpen(false)
              }
              if (e.key === 'ArrowDown' && !open) setOpen(true)
            }}
            className={cn(
              'w-full text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400',
              VARIANTS[variant],
              className,
            )}
          />
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            // The input's handler closes on Escape; letting Radix close first can hand the key to the row as a cancel.
            onEscapeKeyDown={(e) => e.preventDefault()}
            onInteractOutside={(e) => {
              if ((e.target as HTMLElement).closest('[cmdk-input]')) e.preventDefault()
            }}
            sideOffset={4}
            collisionPadding={8}
            className="z-50 max-h-[min(18rem,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] min-w-64 overflow-auto max-md:min-w-0 rounded-xl border border-slate-200 bg-white p-1.5 shadow-pop"
          >
            <Command.List>
              {extras}
              {filtered.map((o) => (
                <Command.Item
                  key={o.value}
                  value={o.value}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onSelect={pick}
                  className="flex cursor-pointer justify-between gap-2 rounded-lg px-2.5 py-1.5 max-md:py-2.5 data-[selected=true]:bg-brand-50 data-[selected=true]:text-brand-900"
                >
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="shrink-0 text-xs text-slate-400">{o.hint}</span>}
                </Command.Item>
              ))}
              {canCreate && (
                <Command.Item
                  value="__create__"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onSelect={pick}
                  className="cursor-pointer rounded-lg px-2.5 py-1.5 italic max-md:py-2.5 data-[selected=true]:bg-brand-50 data-[selected=true]:text-brand-900"
                >
                  Create "{text.trim()}"
                </Command.Item>
              )}
              {filtered.length === 0 && !canCreate && (
                <div className="px-2 py-1 text-slate-400">No matches</div>
              )}
            </Command.List>
          </Popover.Content>
        </Popover.Portal>
      </Command>
    </Popover.Root>
  )
}
