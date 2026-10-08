import { CloudOff } from 'lucide-react'
import { useOnline } from '@/lib/useOnline'
import { cn } from '@/lib/utils'

export function OfflineBanner({ className }: { className?: string }) {
  const online = useOnline()
  if (online) return null
  return (
    <div
      role="status"
      className={cn('flex items-center justify-center gap-2 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-200', className)}
    >
      <CloudOff className="h-3.5 w-3.5 shrink-0" />
      Offline, showing your saved copy. Changes are paused.
    </div>
  )
}

/** For a query that's paused because we're offline and nothing was saved on this device for it. */
export function NotSavedOffline({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-6 py-14 text-center text-slate-500', className)}>
      <CloudOff className="h-7 w-7 text-slate-400" />
      <p className="font-medium text-slate-700">Not saved on this device yet</p>
      <p className="max-w-xs text-sm">You're offline. This will load once you're back online.</p>
    </div>
  )
}
