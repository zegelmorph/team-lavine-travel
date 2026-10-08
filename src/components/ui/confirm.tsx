import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Info, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog'

export interface ConfirmOptions {
  title: string
  message?: ReactNode
  /** Defaults to "Delete", or "Continue" for the `default` tone. */
  confirmLabel?: string
  /** `danger` (the default) is for deletes and other changes that can't be taken back. */
  tone?: 'danger' | 'default'
}

type Request = ConfirmOptions & { resolve: (ok: boolean) => void; returnFocus: Element | null }

let current: Request | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Asks the user to confirm in the app's own dialog; resolves false on Cancel, Escape, navigation, or a newer request. */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  current?.resolve(false)
  return new Promise((resolve) => {
    current = { ...options, resolve, returnFocus: current?.returnFocus ?? document.activeElement }
    emit()
  })
}

function settle(ok: boolean) {
  const request = current
  if (!request) return
  current = null
  emit()
  request.resolve(ok)
}

/** Renders the dialog for `confirmAction`; mount once, inside the router and only while signed in. */
export function ConfirmHost() {
  const request = useSyncExternalStore(subscribe, () => current)
  const last = useRef<Request | null>(null)
  if (request) last.current = request
  const cancelRef = useRef<HTMLButtonElement>(null)
  const descriptionId = useId()
  const { key } = useLocation()
  const danger = (request?.tone ?? 'danger') === 'danger'
  const Icon = danger ? Trash2 : Info

  // A confirm belongs to the page that asked, so leaving it (or signing out) cancels.
  useEffect(() => () => settle(false), [key])

  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && settle(false)}>
      {request && (
        <DialogContent
          title={request.title}
          hideHeader
          role="alertdialog"
          aria-describedby={request.message ? descriptionId : undefined}
          // Above other dialogs, since it's often opened from one.
          className="z-[60] max-w-sm"
          overlayClassName="z-[60]"
          onOpenAutoFocus={(e) => {
            // Start on Cancel so a stray Enter doesn't delete anything.
            e.preventDefault()
            cancelRef.current?.focus()
          }}
          onCloseAutoFocus={(e) => {
            // There's no trigger for Radix to return focus to, so go back to where the user was.
            e.preventDefault()
            const target = last.current?.returnFocus
            if (target instanceof HTMLElement && target.isConnected) target.focus()
          }}
        >
          <div className="flex gap-4">
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                danger ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-700',
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 pt-1">
              <DialogTitle className="text-base font-semibold text-slate-900">{request.title}</DialogTitle>
              {request.message && (
                <DialogDescription id={descriptionId} className="mt-1 text-sm leading-relaxed text-slate-500">
                  {request.message}
                </DialogDescription>
              )}
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2 max-md:[&>button]:h-11 max-md:[&>button]:flex-1">
            <Button ref={cancelRef} variant="outline" onClick={() => settle(false)}>
              Cancel
            </Button>
            <Button variant={danger ? 'destructive' : 'default'} onClick={() => settle(true)}>
              {request.confirmLabel ?? (danger ? 'Delete' : 'Continue')}
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  )
}
