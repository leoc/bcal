import type { CalendarEvent } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { minutesOf, nearestOnNextDay, sameDay } from '../src/renderer/src/lib/navigate'

const event = (id: string, start: string, allDay = false) =>
  ({ id, start, end: start, allDay }) as CalendarEvent
const d = (day: number) => new Date(2026, 10, day)
const at = (hours: number) => hours * 60

const events = [
  event('tue-all', '2026-11-03', true),
  event('tue-9', '2026-11-03T09:00:00'),
  event('tue-15', '2026-11-03T15:00:00'),
  event('thu-all', '2026-11-05', true),
  event('fri-8', '2026-11-06T08:00:00'),
]

describe('nearestOnNextDay', () => {
  it('picks the event closest to the time on the next day', () => {
    expect(nearestOnNextDay(events, d(2), at(14), 1)?.id).toBe('tue-15')
    expect(nearestOnNextDay(events, d(2), at(10), 1)?.id).toBe('tue-9')
  })

  it('takes the earlier one when two are equally close', () => {
    expect(nearestOnNextDay(events, d(2), at(12), 1)?.id).toBe('tue-9')
  })

  it('skips empty days in both directions', () => {
    expect(nearestOnNextDay(events, d(3), at(14), 1)?.id).toBe('thu-all')
    expect(nearestOnNextDay(events, d(5), at(14), -1)?.id).toBe('tue-15')
  })

  it('leaves the given day out', () => {
    expect(nearestOnNextDay(events, d(6), at(8), 1)).toBeUndefined()
    expect(nearestOnNextDay(events, d(3), at(9), -1)).toBeUndefined()
  })

  it('prefers timed events over all-day ones', () => {
    expect(nearestOnNextDay(events, d(2), at(0), 1)?.id).toBe('tue-9')
  })

  it('falls back to an all-day event on a day without others', () => {
    expect(nearestOnNextDay(events, d(4), at(9), 1)?.id).toBe('thu-all')
  })
})

describe('minutesOf', () => {
  it('counts from midnight', () => {
    expect(minutesOf(new Date(2026, 10, 3, 14, 30))).toBe(870)
  })
})

describe('sameDay', () => {
  it('ignores the time', () => {
    expect(sameDay(new Date(2026, 10, 3, 1), new Date(2026, 10, 3, 23))).toBe(true)
    expect(sameDay(new Date(2026, 10, 3, 23), new Date(2026, 10, 4, 1))).toBe(false)
  })
})
