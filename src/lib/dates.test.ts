import { describe, expect, it } from 'vitest'
import { formatClock, formatHour, formatTime, parseTimeInput } from './dates'

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

  it('reads typed times', () => {
    expect(parseTimeInput('14:30')).toBe('14:30')
    expect(parseTimeInput('1430')).toBe('14:30')
    expect(parseTimeInput('930')).toBe('09:30')
    expect(parseTimeInput('9')).toBe('09:00')
    expect(parseTimeInput('2:05 pm')).toBe('14:05')
    expect(parseTimeInput('2P')).toBe('14:00')
    expect(parseTimeInput(' 10:45 AM ')).toBe('10:45')
    expect(parseTimeInput('12am')).toBe('00:00')
    expect(parseTimeInput('12:30 pm')).toBe('12:30')
  })

  it('rejects things that are not times', () => {
    for (const bad of ['', 'abc', '25:00', '24', '9:60', '13pm', '0am', '12:3', '1:2:3', '9m', '2.', '2 m'])
      expect(parseTimeInput(bad)).toBeNull()
  })

  it('needs am/pm for ambiguous hours in 12h mode', () => {
    expect(parseTimeInput('7:30', '12h')).toBeNull()
    expect(parseTimeInput('12', '12h')).toBeNull()
    expect(parseTimeInput('7:30 pm', '12h')).toBe('19:30')
    expect(parseTimeInput('13:30', '12h')).toBe('13:30')
    expect(parseTimeInput('0030', '12h')).toBe('00:30')
    expect(parseTimeInput('7:30', '24h')).toBe('07:30')
  })

  it('formats grid hours', () => {
    expect(formatHour(0)).toBe('12 AM')
    expect(formatHour(12)).toBe('Noon')
    expect(formatHour(17)).toBe('5 PM')
    expect(formatHour(0, '24h')).toBe('00:00')
    expect(formatHour(17, '24h')).toBe('17:00')
  })
})
