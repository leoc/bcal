import type { CalendarEvent } from '@shared/types'
import { toDate } from './format'
import { startOfDay } from './goto'

export function minutesOf(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

export function sameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime()
}

/** How far `event` is from `minutes` on its day; all-day events only when nothing else is there. */
function distance(event: CalendarEvent, minutes: number): number {
  return event.allDay ? 24 * 60 : Math.abs(minutesOf(toDate(event.start)) - minutes)
}

/**
 * The event closest to `minutes` on the next day after (`step` 1) or before
 * (`step` -1) `day` that has events.
 */
export function nearestOnNextDay(
  events: CalendarEvent[],
  day: Date,
  minutes: number,
  step: 1 | -1,
): CalendarEvent | undefined {
  const from = startOfDay(day).getTime()
  const dayOf = (e: CalendarEvent) => startOfDay(toDate(e.start)).getTime()
  const days = events.map(dayOf).filter((d) => (d - from) * step > 0)
  if (!days.length) return undefined
  const target = step > 0 ? Math.min(...days) : Math.max(...days)
  return events
    .filter((e) => dayOf(e) === target)
    .reduce((best, e) => (distance(e, minutes) < distance(best, minutes) ? e : best))
}
