import { cn } from '@/lib/utils'

export function NotBooked({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 rounded-full border border-dashed border-amber-400 px-1.5 text-[10px] font-medium leading-4 text-amber-700 dark:border-amber-400/60 dark:text-amber-300',
        className,
      )}
    >
      Not booked
    </span>
  )
}
