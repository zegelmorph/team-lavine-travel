import { Plus } from 'lucide-react'
import { useOnline } from '@/lib/useOnline'
import { cn } from '@/lib/utils'

/** Floating add button pinned bottom-right on phones; pages add bottom padding so it doesn't cover the last row. */
export function Fab({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  const online = useOnline()
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      disabled={!online}
      className={cn(
        'fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-fill text-on-brand shadow-pop transition-colors active:bg-brand-fill-hover disabled:opacity-50',
        className,
      )}
    >
      <Plus className="h-6 w-6" />
    </button>
  )
}
