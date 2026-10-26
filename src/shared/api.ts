import type { CalendarEvent, CalendarInfo, DateRange } from './types'

export interface Api {
  calendars: () => Promise<CalendarInfo[]>
  events: (range: DateRange) => Promise<CalendarEvent[]>
  /** fires when files in the vdir changed (pimsync wrote something) */
  onChange: (listener: () => void) => () => void
}
