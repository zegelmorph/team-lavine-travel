import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** "1 transaction", "1,204 transactions". */
export function plural(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`
}

/** Categories are stored as "Parent:Child"; show them as "Parent › Child". */
export function displayPath(path: string): string {
  return path.split(':').join(' › ')
}

/** Inverse of displayPath, so typed text in either form compares equal. */
export function normalizePath(text: string): string {
  return text.replace(/\s*›\s*/g, ':')
}

const FOCUSABLE = 'input, select, textarea, button, [tabindex]'

/** Moves focus to the next tabbable element in document order, like pressing Tab. */
export function focusNextField(from: HTMLElement): boolean {
  const all = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el === from || (el.tabIndex >= 0 && !el.hasAttribute('disabled') && el.offsetParent !== null),
  )
  const next = all[all.indexOf(from) + 1]
  next?.focus()
  return Boolean(next)
}
