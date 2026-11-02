import { describe, expect, it } from 'vitest'
import { monthGrid, rangePart, shadeFor } from '../src/renderer/src/lib/month'

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day)

describe('monthGrid', () => {
  it('starts on the Monday before the first and has six weeks', () => {
    const days = monthGrid(d(2026, 11, 17))
    expect(days).toHaveLength(42)
    expect(days[0]).toEqual(d(2026, 10, 26))
    expect(days[0]?.getDay()).toBe(1)
    expect(days[6]).toEqual(d(2026, 11, 1))
  })

  it('starts on the first itself when it is a Monday', () => {
    expect(monthGrid(d(2027, 2, 10))[0]).toEqual(d(2027, 2, 1))
  })
})

describe('shadeFor', () => {
  it('shades a week or a day but not a month', () => {
    const week = { start: d(2026, 11, 2), end: d(2026, 11, 9) }
    expect(shadeFor(week)).toBe(week)
    expect(shadeFor({ start: d(2026, 11, 3), end: d(2026, 11, 4) })).toBeDefined()
    expect(shadeFor({ start: d(2026, 11, 1), end: d(2026, 12, 1) })).toBeUndefined()
    expect(shadeFor(undefined)).toBeUndefined()
  })
})

describe('rangePart', () => {
  const week = { start: d(2026, 11, 2), end: d(2026, 11, 9) }

  it('rounds the first and last day of the range', () => {
    expect(rangePart(d(2026, 11, 2), week)).toEqual({ inside: true, first: true, last: false })
    expect(rangePart(d(2026, 11, 5), week)).toEqual({ inside: true, first: false, last: false })
    expect(rangePart(d(2026, 11, 8), week)).toEqual({ inside: true, first: false, last: true })
  })

  it('leaves days outside or without a range alone', () => {
    expect(rangePart(d(2026, 11, 9), week).inside).toBe(false)
    expect(rangePart(d(2026, 11, 5), undefined).inside).toBe(false)
  })
})
