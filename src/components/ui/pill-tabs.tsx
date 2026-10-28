import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

/** Rounded segmented tab bar; the caller renders the panel for `value`. */
export function PillTabs<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T
  options: readonly (readonly [T, string])[]
  onChange: (value: T) => void
  className?: string
}) {
  const list = useRef<HTMLDivElement>(null)

  // A bar wider than its container scrolls sideways, so keep the selected tab in view (e.g. when a link opens the last one).
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [value])

  return (
    <div ref={list} role="tablist" className={cn('inline-flex rounded-full bg-slate-100 p-1', className)}>
      {options.map(([id, label]) => (
        <button
          key={id}
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={cn(
            'whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors max-md:px-3 max-md:py-2.5',
            value === id ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500 hover:text-slate-800',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
