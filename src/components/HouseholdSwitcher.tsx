import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronsUpDown } from 'lucide-react'
import { useHousehold } from '@/features/auth/HouseholdProvider'
import { cn } from '@/lib/utils'

/** Household name lockup at the top of the sidebar. It only becomes a switcher when there are several households. */
export function HouseholdSwitcher() {
  const { household, households, switchHousehold } = useHousehold()
  const [open, setOpen] = useState(false)

  const lockup = (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[17px] font-bold leading-tight tracking-tight text-slate-900">
        {household.name}
      </span>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-700">Travel</span>
    </span>
  )

  if (households.length < 2) return <div className="flex min-w-0 flex-1 py-1">{lockup}</div>

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className="-mx-1.5 flex min-w-0 flex-1 items-center gap-1 rounded-lg px-1.5 py-1 text-left outline-none transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-500/40 data-[state=open]:bg-slate-50"
        aria-label="Switch household"
      >
        {lockup}
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-pop"
        >
          <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Households
          </div>
          <ul role="listbox" aria-label="Households">
            {households.map((h) => (
              <li key={h.id}>
                <button
                  role="option"
                  aria-selected={h.id === household.id}
                  onClick={() => {
                    setOpen(false)
                    switchHousehold(h.id)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-brand-50 hover:text-brand-900',
                    h.id === household.id ? 'font-medium text-brand-800' : 'text-slate-700',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{h.name}</span>
                  {h.id === household.id && <Check className="h-4 w-4 shrink-0" />}
                </button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
