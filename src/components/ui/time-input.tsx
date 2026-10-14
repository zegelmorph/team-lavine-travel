import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { formatTime, parseTimeInput } from '@/lib/dates'
import { useTimeFormat } from '@/lib/userSettings'
import { Input } from './input'

type Props = Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type' | 'ref'> & {
  /** "HH:mm", or "" for no time. */
  value: string
  onChange: (value: string) => void
}

/**
 * A time field that shows and accepts times the way the user's time format setting says ("2:05 PM" or "14:05"),
 * instead of the browser's own locale-bound `type="time"`. Typing is free-form ("1430", "2p", "9:30 am") and is
 * tidied up on blur; the value it reports is always "HH:mm". While the text is unreadable the parent keeps the last
 * good value and the form can't submit. Changing `value` from outside while the user has typed here isn't reflected
 * until the field loses focus.
 */
export function TimeInput({ value, onChange, onBlur, placeholder, className, ...props }: Props) {
  const fmt = useTimeFormat()
  const ref = useRef<HTMLInputElement>(null)
  // The text being typed; null whenever the field just mirrors `value`.
  const [typed, setTyped] = useState<string | null>(null)
  const invalid = typed !== null && typed.trim() !== '' && parseTimeInput(typed, fmt) === null
  const hint = fmt === '24h' ? 'Enter a time like 14:30.' : 'Enter a time like 2:30 PM, with AM or PM.'

  // Lets a form's `required` and submit validation see an unreadable entry.
  useEffect(() => {
    ref.current?.setCustomValidity(invalid ? hint : '')
  }, [invalid, hint])

  return (
    <Input
      {...props}
      ref={ref}
      type="text"
      autoComplete="off"
      autoCapitalize="off"
      spellCheck={false}
      inputMode={fmt === '24h' ? 'numeric' : 'text'}
      placeholder={placeholder}
      value={typed ?? formatTime(value, fmt)}
      aria-invalid={invalid || undefined}
      title={invalid ? hint : undefined}
      className={`aria-invalid:border-red-500 aria-invalid:ring-2 aria-invalid:ring-red-500/20 ${className ?? ''}`}
      onChange={(e) => {
        const text = e.target.value
        setTyped(text)
        if (!text.trim()) onChange('')
        else {
          const parsed = parseTimeInput(text, fmt)
          if (parsed) onChange(parsed)
        }
      }}
      onBlur={(e) => {
        // An unreadable entry stays on screen so the user can see and fix it.
        if (!invalid) setTyped(null)
        onBlur?.(e)
      }}
    />
  )
}
