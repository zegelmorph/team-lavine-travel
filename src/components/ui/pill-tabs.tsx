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
  return (
    <div role="tablist" className={cn('inline-flex rounded-full bg-slate-100 p-1', className)}>
      {options.map(([id, label]) => (
        <button
          key={id}
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={cn(
            'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
            value === id ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500 hover:text-slate-800',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
