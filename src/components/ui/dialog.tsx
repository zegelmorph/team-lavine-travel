import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useVisualViewport } from '@/lib/useVisualViewport'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close
export const DialogTitle = DialogPrimitive.Title
export const DialogDescription = DialogPrimitive.Description

/**
 * Below `md`, dialogs slide up from the bottom edge; `fullScreenOnMobile` takes the whole screen instead. Both track
 * the visual viewport so the on-screen keyboard can't push them out of reach.
 */
const MOBILE_SHEET =
  'max-md:inset-x-0 max-md:bottom-[calc(100%-var(--vv-top,0px)-var(--vv-height,100%))] max-md:top-auto max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:max-h-[min(92dvh,var(--vv-height,100dvh))] max-md:rounded-b-none max-md:p-4 max-md:pb-[max(1rem,env(safe-area-inset-bottom))]'
const MOBILE_FULL =
  'max-md:inset-x-0 max-md:top-[var(--vv-top,0px)] max-md:bottom-auto max-md:h-[var(--vv-height,100dvh)] max-md:max-h-none max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:overflow-x-hidden max-md:rounded-none max-md:border-0 max-md:p-4 max-md:pt-[max(1rem,env(safe-area-inset-top))] max-md:pb-0'

export function DialogContent({
  className,
  title,
  children,
  fullScreenOnMobile,
  hideHeader,
  overlayClassName,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  title: string
  fullScreenOnMobile?: boolean
  /** Drop the title row and close button, for dialogs that render their own `DialogTitle`. */
  hideHeader?: boolean
  overlayClassName?: string
}) {
  useVisualViewport()
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn('fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-sm dark:bg-black/50', overlayClassName)}
      />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-pop',
          className,
          fullScreenOnMobile ? MOBILE_FULL : MOBILE_SHEET,
        )}
        aria-describedby={undefined}
        {...props}
      >
        {!hideHeader && (
          <div className="mb-5 flex items-center justify-between max-md:mb-4">
            <DialogPrimitive.Title className="text-base font-semibold text-slate-900">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 max-md:p-2.5">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
        )}
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
