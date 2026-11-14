import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Wraps a dialog's fields so the same form can show a record to someone who may not change it: with `readOnly`,
 * every field and button inside is disabled (links still work). The dialog's Close button goes outside it.
 * Takes the layout classes the fields need, since it is their container.
 */
export function ReadOnlyFields({ readOnly, className, children }: { readOnly: boolean; className?: string; children: ReactNode }) {
  // min-w-0: a fieldset is otherwise as wide as its widest field, which breaks truncation and grids inside it.
  return (
    <fieldset disabled={readOnly} className={cn('min-w-0', className)}>
      {children}
    </fieldset>
  )
}
