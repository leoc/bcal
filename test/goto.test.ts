import { describe, expect, it } from 'vitest'
import { parseGoto } from '../src/renderer/src/lib/goto'

const now = new Date(2026, 9, 26, 12) // Mon 2026-10-26
const day = (input: string) => parseGoto(input, now)?.toDateString()
const date = (y: number, m: number, d: number) => new Date(y, m - 1, d).toDateString()

describe('parseGoto', () => {
  it('handles relative offsets', () => {
    expect(day('+3')).toBe(date(2026, 10, 29))
    expect(day('-2w')).toBe(date(2026, 10, 12))
    expect(day('+1m')).toBe(date(2026, 11, 26))
  })

  it('handles German dates, weeks, weekdays and months', () => {
    expect(day('12.11.')).toBe(date(2026, 11, 12))
    expect(day('1.2.27')).toBe(date(2027, 2, 1))
    expect(day('31.2.')).toBeUndefined()
    expect(day('kw 45')).toBe(date(2026, 11, 2))
    expect(day('KW1 2027')).toBe(date(2027, 1, 4))
    expect(day('fr')).toBe(date(2026, 10, 30))
    expect(day('mo')).toBe(date(2026, 10, 26))
    expect(day('dez')).toBe(date(2026, 12, 1))
    expect(day('märz')).toBe(date(2027, 3, 1))
  })

  it('falls back to chrono for phrases', () => {
    expect(day('übermorgen')).toBe(date(2026, 10, 28))
    expect(day('nächsten Freitag')).toBe(date(2026, 11, 6))
    expect(day('3. Dezember')).toBe(date(2026, 12, 3))
    expect(day('')).toBeUndefined()
    expect(day('quatsch')).toBeUndefined()
  })
})
