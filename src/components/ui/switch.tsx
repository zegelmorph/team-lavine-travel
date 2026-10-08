import { cn } from '@/lib/utils'
import { useMarkEdited } from './dialog'

export function Switch({
  checked,
  onChange,
  label,
  description,
  className,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  className?: string
}) {
  const markEdited = useMarkEdited()
  return (
    <label className={cn('flex cursor-pointer items-start justify-between gap-4', className)}>
      <span>
        <span className="block font-medium text-slate-800">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => {
          markEdited()
          onChange(!checked)
        }}
        className={cn(
          'relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30',
          checked ? 'bg-brand-600' : 'bg-slate-200',
        )}
      >
        <span
          className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')}
        />
      </button>
    </label>
  )
}
