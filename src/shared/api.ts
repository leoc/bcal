import type { CalendarEvent, CalendarInfo, Config, DateRange } from './types'

export interface Api {
  config: () => Promise<Config>
  calendars: () => Promise<CalendarInfo[]>
  events: (range: DateRange) => Promise<CalendarEvent[]>
  search: (query: string) => Promise<CalendarEvent[]>
  /** fires when files in the vdir changed (pimsync wrote something) */
  onChange: (listener: () => void) => () => void
  /** fires when config.yml was saved */
  onConfigChange: (listener: () => void) => () => void
  /** calendar toggles from the UI, kept per machine */
  visibility: () => Promise<Record<string, boolean>>
  setVisibility: (visibility: Record<string, boolean>) => Promise<void>
  /** opens an http(s) link in the default browser */
  openLink: (url: string) => Promise<void>
}
