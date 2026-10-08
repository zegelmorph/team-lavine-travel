import { MapPinOff } from 'lucide-react'
import { useOnline } from '@/lib/useOnline'
import { cn } from '@/lib/utils'

/**
 * Google Maps iframe. The keyless embed has no dark style, so dark mode inverts it and rotates the hues back
 * (water stays blue, parks green).
 *
 * Non-interactive by default so a map in a scrolling page can't swallow the swipe; pass `interactive` where
 * panning is wanted (or `"desktop"` to keep phones scrolling past it).
 */
export function MapEmbed({
  src,
  title,
  className,
  interactive = false,
}: {
  src: string
  title: string
  className?: string
  interactive?: boolean | 'desktop'
}) {
  const online = useOnline()
  if (!online) {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-1 rounded-xl bg-slate-50 text-center text-xs text-slate-400', className)}>
        <MapPinOff className="h-4 w-4" />
        Map unavailable offline
      </div>
    )
  }
  return (
    <iframe
      title={title}
      src={src}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      // A thumbnail inside a button or link: keep keyboard and screen readers out of the Google page.
      inert={!interactive || undefined}
      aria-hidden={!interactive || undefined}
      className={cn(
        'w-full rounded-xl bg-slate-50 dark:brightness-95 dark:contrast-90 dark:invert-[0.9] dark:hue-rotate-180',
        !interactive && 'pointer-events-none',
        interactive === 'desktop' && 'max-md:pointer-events-none',
        className,
      )}
    />
  )
}
