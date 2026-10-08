import { useId } from 'react'
import { cn } from '@/lib/utils'

/** Globe with a paper plane circling it, in the finance app's greens. Colors lift slightly in dark mode. */
export function Logo({ className }: { className?: string }) {
  const wing = `${useId()}-wing`
  return (
    <svg viewBox="0 0 64 64" className={cn('shrink-0', className)} role="img" aria-label="Team Lavine Travel">
      <defs>
        <linearGradient id={wing} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#8fd173" />
          <stop offset="1" stopColor="#4fae4a" />
        </linearGradient>
      </defs>
      <circle cx="30" cy="34" r="20" fill="none" strokeWidth="4" className="stroke-[#1d6b37] dark:stroke-[#2f8a4b]" />
      <path
        d="M10.5 30h39M13 43h34M30 14c-7 6-7 34 0 40M30 14c7 6 7 34 0 40"
        fill="none"
        strokeWidth="2.5"
        className="stroke-[#6cbf5a] dark:stroke-[#7fcd6c]"
      />
      <path d="M62 4 34 15l9 4z" fill={`url(#${wing})`} />
      <path d="M62 4 43 19l2 10z" className="fill-[#2e9e4f] dark:fill-[#3aad5c]" />
    </svg>
  )
}
