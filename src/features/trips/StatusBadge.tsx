import { TRIP_STATUS_LABELS, type TripStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

export const STATUS_STYLES: Record<TripStatus, string> = {
  dreaming: 'bg-slate-100 text-slate-600',
  planning: 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300',
  happening: 'bg-brand-fill text-on-brand',
  complete: 'bg-brand-50 text-brand-700',
}

export function StatusBadge({ status, className }: { status: TripStatus; className?: string }) {
  return (
    <span
      className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium', STATUS_STYLES[status], className)}
    >
      {TRIP_STATUS_LABELS[status]}
    </span>
  )
}
