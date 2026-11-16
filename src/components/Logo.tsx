import { cn } from '@/lib/utils'

/**
 * A folded paper plane in the brand greens. The shades are fixed rather than taken from the brand scale, which flips
 * in dark mode and would turn the shading inside out; each one lifts a little there instead. The same drawing is in
 * `public/favicon.svg`, and the PNG icons in `public/` are rendered from it in the light shades. On the home-screen
 * icons the plane itself (its drawn bounds, not the 64-unit box around it) is centered on a white tile and spans 56%
 * of the tile's width: much larger and the nose leaves the circle a maskable icon can be cropped to. All three use
 * that size so they look alike. `email-logo.png` is the plane alone on a transparent square.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn('shrink-0', className)}
      role="img"
      aria-label="Team Lavine Travel"
      fill="currentColor"
      // A hairline in each facet's own color closes the seams between them and softens the points.
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    >
      <path d="M59 5 23 34 28 53Z" className="text-[#1e5539] dark:text-[#2f6443]" />
      <path d="M59 5 28 53 33 40Z" className="text-[#256b46] dark:text-[#3a8058]" />
      <path d="M59 5 5 26 23 34Z" className="text-[#6fbb8c] dark:text-[#94d4ad]" />
      <path d="M59 5 33 40 46 58Z" className="text-[#2f8556] dark:text-[#4fa771]" />
    </svg>
  )
}
