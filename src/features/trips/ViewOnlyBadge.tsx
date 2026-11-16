import { Eye } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Marks a trip the signed-in user is travelling on as a viewer: they neither manage it nor edit it. */
export function ViewOnlyBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium tracking-normal text-slate-600',
        className,
      )}
      title="You're travelling on this trip. You can check off packing items and to-dos; its owner and editors make the other changes."
    >
      <Eye className="h-3 w-3" /> View only
    </span>
  )
}
