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
  uid: string
  /** original start of this occurrence of a series (RECURRENCE-ID), as ical.js prints it */
  recurrenceId?: string
  title: string
  /** ISO date-time, or `YYYY-MM-DD` for all-day events */
  start: string
  end: string
  allDay: boolean
  location?: string
  description?: string
  /** RRULE of the series, e.g. `FREQ=WEEKLY;BYDAY=MO` */
  rrule?: string
  /** GEO of the event, for the map */
  geo?: Geo
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
  /** an add-on group: its key switches it on/off instead of showing it alone */
  toggle: boolean
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
  /** calendar for new events, matched like groups; else the first one */
  defaultCalendar?: string
  /** minutes, when a new event names neither duration nor end */
  defaultDuration: number
  /** reminder in minutes before start; none when unset */
  defaultAlarm?: number
  /** who invites when a new event has attendees */
  organizer?: Person
  /** own places offered after `bei`/`in`/`im`/`at` */
  places: Place[]
  /** map searches prefer places near this point (default: Berlin) */
  near: Geo
}

export function matchesCalendar(calendar: CalendarInfo, ref: string): boolean {
  return calendar.id === ref || calendar.name === ref || calendar.id.endsWith(`/${ref}`)
}

export interface Person {
  name?: string
  /** without `mailto:`; people without address can only be noted, not invited */
  email?: string
}

/** A new event as the renderer drafts it; times are local wall-clock times. */
export interface NewEvent {
  calendarId: string
  title: string
  /** `YYYY-MM-DDTHH:mm:ss` (local) or `YYYY-MM-DD` for all-day */
  start: string
  end: string
  allDay: boolean
  location?: string
  description?: string
  rrule?: string
  /** coordinates of the location, written as GEO */
  geo?: Geo
  attendees: Person[]
  /** minutes before start; no alarm when undefined */
  alarm?: number
}

export interface Created {
  /** id of the first occurrence, as `events()` reports it */
  id: string
  path: string
}

export interface Geo {
  lat: number
  lon: number
}

export type PlaceSource = 'contacts' | 'events' | 'config' | 'map'

/** A place for `bei Simon` or `im Café Kranzler`: contacts, past events, config.yml or the map. */
export interface Place {
  /** short name that goes into the line, e.g. `Café Kranzler` */
  name: string
  /** what LOCATION gets: `Name, Straße Nr, PLZ Ort` */
  label: string
  geo?: Geo
  source: PlaceSource
}

/** Which event, and for a series which occurrence. */
export interface EventRef {
  calendarId: string
  uid: string
  recurrenceId?: string
}

/** For a series: only this occurrence, the whole series, or this and the following. */
export type Scope = 'this' | 'all' | 'following'

/** The fields an edit sets; alarms, X-properties and everything else stay as they are. */
export type EventInput = Omit<NewEvent, 'alarm'>
