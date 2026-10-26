import type { CalendarEvent, CalendarInfo, Config, DateRange } from './types'

export interface Api {
  config: () => Promise<Config>
  calendars: () => Promise<CalendarInfo[]>
  events: (range: DateRange) => Promise<CalendarEvent[]>
  /** fires when files in the vdir changed (pimsync wrote something) */
  onChange: (listener: () => void) => () => void
  /** fires when config.yml was saved */
  onConfigChange: (listener: () => void) => () => void
}
