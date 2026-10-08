import type { ReactNode } from 'react'
import { Logo } from './Logo'

/** Centered card on a soft off-white background, used by sign-in and onboarding. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="relative h-full overflow-y-auto overflow-x-hidden bg-slate-50">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-brand-100/60 blur-3xl" />
      <div className="flex min-h-full items-center justify-center px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))]">
        <div className="relative w-full max-w-sm">
          <div className="mb-7 flex flex-col items-center">
            <Logo className="h-16 w-16" />
            <span className="mt-3 text-[26px] font-bold leading-tight tracking-tight text-slate-900">Team Lavine</span>
            <span className="mt-0.5 text-xs font-semibold uppercase tracking-[0.3em] pl-[0.3em] text-brand-700">
              Travel
            </span>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-7 shadow-card max-md:p-5">
            <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
            {subtitle && <p className="mt-1 text-slate-500">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
