import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { useOnline } from '@/lib/useOnline'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
  {
    variants: {
      variant: {
        default: 'bg-brand-fill text-on-brand shadow-sm hover:bg-brand-fill-hover',
        secondary: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
        outline: 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
        ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        destructive: 'bg-danger-fill text-on-brand hover:bg-danger-fill-hover',
      },
      size: {
        default: 'h-9 px-3.5 max-md:h-10',
        sm: 'h-7 px-2.5 text-xs max-md:h-10 max-md:px-3',
        icon: 'h-8 w-8 rounded-full max-md:h-10 max-md:w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Changes saved data, so it's disabled while offline (the app is read-only then). */
  needsOnline?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, needsOnline = false, disabled, ...props }, ref) => {
    const online = useOnline()
    const Comp = asChild ? Slot : 'button'
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || (needsOnline && !online)} {...props} />
  },
)
Button.displayName = 'Button'
