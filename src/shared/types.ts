export interface CalendarInfo {
  /** `<account>/<collection>`, stable across runs */
  id: string
  account: string
  name: string
  /** hex color from the vdir `color` file, if any */
  color?: string
  eventCount: number
}

export interface CalendarEvent {
  /** UID plus occurrence start for recurring events */
  id: string
  calendarId: string
  title: string
  /** ISO date-time, or `YYYY-MM-DD` for all-day events */
  start: string
  end: string
  allDay: boolean
  location?: string
  description?: string
  recurring: boolean
}

export interface DateRange {
  start: string
  end: string
}

export type ViewName = 'week' | 'month' | 'day' | 'agenda'

export interface CalendarGroup {
  name: string
  /** displayname, collection name or `<account>/<collection>` */
  calendars: string[]
}

export interface Config {
  startView: ViewName
  groups: CalendarGroup[]
  /** calendars hidden until toggled on (same matching as groups) */
  hidden: string[]
  /** key -> action overrides, e.g. `{ n: next }`; action `none` unbinds */
  keymap: Record<string, string>
}

export function matchesCalendar(calendar: CalendarInfo, ref: string): boolean {
  return calendar.id === ref || calendar.name === ref || calendar.id.endsWith(`/${ref}`)
}
