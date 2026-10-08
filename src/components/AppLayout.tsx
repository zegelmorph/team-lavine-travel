import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { LogOut, Menu, Plane, Settings, type LucideIcon } from 'lucide-react'
import { HouseholdSwitcher } from './HouseholdSwitcher'
import { Logo } from './Logo'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { TripsNav } from '@/features/trips/TripsNav'
import { usePrefetchActiveTrips } from '@/lib/queries'
import { OfflineBanner } from './Offline'

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Trips', icon: Plane, end: true },
]

export const navItemClass = (active: boolean) =>
  cn(
    'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors max-md:py-2.5',
    active ? 'bg-brand-50 font-medium text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  )

export function AppLayout() {
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => setDrawerOpen(false), [location.pathname])
  usePrefetchActiveTrips()

  return (
    <div className="flex h-dvh max-md:flex-col">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200/80 bg-white md:flex">
        <SidebarContent />
      </aside>

      <header className="flex shrink-0 items-center gap-2 border-b border-slate-200/80 bg-white px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:hidden">
        <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DialogPrimitive.Trigger
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </DialogPrimitive.Trigger>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-sm dark:bg-black/50" />
            <DialogPrimitive.Content
              className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-white pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-pop"
              aria-describedby={undefined}
              // Tapping the trip that's already open doesn't change the route, so close on any link tap too.
              onClick={(e) => (e.target as HTMLElement).closest('a') && setDrawerOpen(false)}
            >
              <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
              <SidebarContent />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
        <Logo className="h-8 w-8" />
        <HouseholdSwitcher />
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <OfflineBanner className="shrink-0 border-b border-amber-100 dark:border-amber-900/50" />
        <main className="min-h-0 min-w-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)]">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function SidebarContent() {
  return (
    <>
      <div className="flex items-center gap-3 px-5 pb-4 pt-5">
        <Logo className="h-10 w-10" />
        <HouseholdSwitcher />
      </div>

      <nav className="space-y-0.5 px-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => navItemClass(isActive)}>
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mx-5 my-4 border-t border-slate-100" />

      <TripsNav />

      <div className="space-y-1 border-t border-slate-100 p-3">
        <NavLink to="/settings" className={({ isActive }) => navItemClass(isActive)}>
          <Settings className="h-4 w-4" />
          Settings
        </NavLink>
        <button onClick={() => supabase.auth.signOut()} className={cn(navItemClass(false), 'w-full')}>
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </>
  )
}
