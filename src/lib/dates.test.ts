import { describe, expect, it } from 'vitest'
import { formatClock, formatHour, formatTime } from './dates'

describe('time formats', () => {
  it('formats stored times in 12h by default', () => {
    expect(formatTime('09:30:00')).toBe('9:30 AM')
    expect(formatTime('15:05')).toBe('3:05 PM')
    expect(formatTime('00:00')).toBe('12:00 AM')
  })

  it('formats stored times in 24h', () => {
    expect(formatTime('09:30:00', '24h')).toBe('09:30')
    expect(formatTime('15:05', '24h')).toBe('15:05')
    expect(formatTime('00:00', '24h')).toBe('00:00')
  })

  it('handles empty and invalid times', () => {
    expect(formatTime(null, '24h')).toBe('')
    expect(formatTime('nope', '24h')).toBe('nope')
  })

  it('formats minutes since midnight', () => {
    expect(formatClock(0)).toBe('12:00 AM')
    expect(formatClock(13 * 60 + 5)).toBe('1:05 PM')
    expect(formatClock(0, '24h')).toBe('00:00')
    expect(formatClock(13 * 60 + 5, '24h')).toBe('13:05')
  })

  it('formats grid hours', () => {
    expect(formatHour(0)).toBe('12 AM')
    expect(formatHour(12)).toBe('Noon')
    expect(formatHour(17)).toBe('5 PM')
    expect(formatHour(0, '24h')).toBe('00:00')
    expect(formatHour(17, '24h')).toBe('17:00')
  })
})
