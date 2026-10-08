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
  'max-md:inset-x-0 max-md:top-[var(--vv-top,0px)] max-md:bottom-auto max-md:h-[var(--vv-height,100dvh)] max-md:max-h-none max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:overflow-x-hidden max-md:rounded-none max-md:border-0 max-md:p-4 max-md:pt-[max(1rem,env(safe-area-inset-top))] max-md:pb-[env(safe-area-inset-bottom)]'

const EditedContext = React.createContext<() => void>(() => {})

/**
 * For controls that change a value without an input or change event (calendar days, list picks, switches), so the
 * dialog they're in knows it has been edited. Any new click-driven control used in a dialog should call it. A no-op
 * outside a dialog.
 */
export const useMarkEdited = () => React.useContext(EditedContext)

const SHAKE: Keyframe[] = [0, -6, 6, -4, 4, 0].map((x) => ({ transform: `translateX(${x}px)` }))
const PULSE: Keyframe[] = [
  { outline: '3px solid transparent' },
  { outline: '3px solid var(--color-brand-300)' },
  { outline: '3px solid transparent' },
]

/**
 * Once anything inside has been edited, a click on the backdrop no longer closes the dialog (it shakes instead), so
 * a stray click can't throw the changes away. The close button, Cancel and Escape still close it. "Edited" means any
 * field was typed in or changed, even if it was then put back.
 */
export function DialogContent({
  className,
  title,
  children,
  fullScreenOnMobile,
  hideHeader,
  overlayClassName,
  onChange,
  onPointerDownOutside,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  title: string
  fullScreenOnMobile?: boolean
  /** Drop the title row and close button, for dialogs that render their own `DialogTitle`. */
  hideHeader?: boolean
  overlayClassName?: string
}) {
  useVisualViewport()
  const content = React.useRef<HTMLDivElement>(null)
  const [edited, setEdited] = React.useState(false)
  const markEdited = React.useCallback(() => setEdited(true), [])

  function nudge() {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    content.current?.animate(reduced ? PULSE : SHAKE, { duration: reduced ? 600 : 300, easing: 'ease-in-out' })
  }

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn('fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-sm dark:bg-black/50', overlayClassName)}
        // Keeps focus in the field being typed in when a press on the backdrop is ignored.
        onMouseDown={(e) => edited && e.preventDefault()}
      />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-pop',
          className,
          fullScreenOnMobile ? MOBILE_FULL : MOBILE_SHEET,
        )}
        aria-describedby={undefined}
        ref={content}
        // React's change events bubble through portals, so this also hears fields inside popovers.
        onChange={(e) => {
          markEdited()
          onChange?.(e)
        }}
        onPointerDownOutside={(e) => {
          onPointerDownOutside?.(e)
          if (e.defaultPrevented || !edited) return
          e.preventDefault()
          nudge()
        }}
        {...props}
      >
        <EditedContext value={markEdited}>
          {!hideHeader && (
            <div className="mb-5 flex items-center justify-between max-md:mb-4">
              <DialogPrimitive.Title className="text-base font-semibold text-slate-900">{title}</DialogPrimitive.Title>
              <DialogPrimitive.Close
                className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 max-md:-mr-1.5 max-md:p-3"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>
          )}
          {children}
        </EditedContext>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
