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
