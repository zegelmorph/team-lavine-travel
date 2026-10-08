import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-card border border-slate-200/80 bg-white shadow-card', className)} {...props} />
}

export function CardHeader({ title, actions, className }: { title: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3 max-md:flex-wrap max-md:gap-y-1 max-md:px-4',
        className,
      )}
    >
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {actions}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 max-md:w-full">{actions}</div>}
    </div>
  )
}

/** Small uppercase label used for table headers and section titles. */
export const eyebrow = 'text-[11px] font-medium uppercase tracking-wider text-slate-400'

/** Minimal table header row: no background, uppercase grey labels. */
export const tableHead = `${eyebrow} border-b border-slate-100 text-left`
