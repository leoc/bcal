export interface CalendarInfo {
  /** `<account>/<collection>`, stable across runs */
  id: string
  account: string
  name: string
  /** hex color from the vdir `color` file, if any */
  color?: string
  eventCount: number
}

export interface Attendee {
  name?: string
  email?: string
  /** PARTSTAT: ACCEPTED, DECLINED, TENTATIVE, NEEDS-ACTION, ... */
  status?: string
  role?: string
}

export interface CalendarEvent {
  /** calendar, UID and occurrence start, unique per occurrence */
  id: string
  calendarId: string
  title: string
  /** ISO date-time, or `YYYY-MM-DD` for all-day events */
  start: string
  end: string
  allDay: boolean
  location?: string
  description?: string
  /** RRULE of the series, e.g. `FREQ=WEEKLY;BYDAY=MO` */
  rrule?: string
  status?: string
  organizer?: Attendee
  attendees: Attendee[]
  /** http(s) links from URL, LOCATION and DESCRIPTION, meeting links first */
  links: string[]
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
