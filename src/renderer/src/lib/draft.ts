import {
  type CalendarEvent,
  type CalendarInfo,
  type Config,
  matchesCalendar,
  type NewEvent,
  type Person,
  type Place,
} from '@shared/types'
import { parseQuickAdd, type QuickAdd } from './quickadd'

/** A new event being typed: the line plus everything resolved from it. */
export interface Draft {
  line: string
  quick: QuickAdd
  calendar?: CalendarInfo
  /** one entry per `@` token; `person` unset while unresolved */
  people: { token: string; person?: Person }[]
  /** meeting link when the line asks for video */
  video?: string
  /** the place picked for the location, with its full label and GEO */
  place?: Place
}

export const DRAFT_ID = 'bcal-draft'

/** `@Simon Müller` is inserted as `@SimonMüller`; this key finds the choice again. */
export function handleFor(person: Person): string {
  const base = person.name ?? person.email?.split('@')[0] ?? 'person'
  return base.replace(/[^\p{L}\p{N}._-]/gu, '')
}

export function pickCalendar(
  ref: string | undefined,
  calendars: CalendarInfo[],
  config: Config,
  /** used without `#`; an edited event stays in its calendar */
  fallback?: string,
): CalendarInfo | undefined {
  const find = (r: string | undefined) =>
    r ? calendars.find((c) => matchesCalendar(c, r)) : undefined
  return find(ref) ?? find(fallback) ?? find(config.defaultCalendar) ?? calendars[0]
}

export function buildDraft(
  line: string,
  context: {
    calendars: CalendarInfo[]
    config: Config
    /** people chosen from completion, by handle (lower case) */
    chosen: Record<string, Person>
    /** places chosen from completion, by name (lower case) */
    places?: Record<string, Place>
    /** calendar of the edited event, kept unless the line names another */
    calendarId?: string
    videoCode: string
    now?: Date
  },
): Draft {
  const quick = parseQuickAdd(line, {
    now: context.now,
    defaultDuration: context.config.defaultDuration,
    places: Object.values(context.places ?? {}).map((p) => p.name),
  })
  return {
    line,
    quick,
    calendar: pickCalendar(quick.calendar, context.calendars, context.config, context.calendarId),
    people: quick.people.map((token) => ({ token, person: context.chosen[token.toLowerCase()] })),
    video:
      quick.video && context.config.video
        ? `${context.config.video.replace(/\/?$/, '/')}${context.videoCode}`
        : undefined,
    place: quick.location ? context.places?.[quick.location.toLowerCase()] : undefined,
  }
}

/** What to geocode: a contact's address without the name in front, else the label. */
export function placeAddress(place: Place): string {
  if (place.source !== 'contacts') return place.label
  return place.label.slice(place.name.length).replace(/^,\s*/, '') || place.label
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Local wall-clock time as the writer expects it. */
export function localStamp(date: Date, allDay: boolean): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return allDay ? day : `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`
}

/** Title for an empty line part: the people, else a placeholder. */
function title(draft: Draft): string {
  if (draft.quick.title) return draft.quick.title
  const names = draft.people.map((p) => p.person?.name ?? p.token)
  return names.length ? names.join(', ') : 'Termin'
}

export function toNewEvent(draft: Draft, config: Config): NewEvent | undefined {
  if (!draft.calendar) return undefined
  const { quick } = draft
  const description = draft.video ? `Video: ${draft.video}` : undefined
  return {
    calendarId: draft.calendar.id,
    title: title(draft),
    start: localStamp(quick.start, quick.allDay),
    end: localStamp(quick.end, quick.allDay),
    allDay: quick.allDay,
    location: draft.place?.label ?? quick.location ?? draft.video,
    geo: draft.place?.geo,
    description,
    rrule: quick.rrule,
    attendees: draft.people.flatMap((p) => (p.person ? [p.person] : [{ name: p.token }])),
    alarm: config.defaultAlarm,
  }
}

/** The draft shaped like a stored event, for the details panel and the grid. */
export function draftAsEvent(draft: Draft, config: Config): CalendarEvent | undefined {
  const event = toNewEvent(draft, config)
  if (!event) return undefined
  return {
    id: DRAFT_ID,
    uid: DRAFT_ID,
    calendarId: event.calendarId,
    title: event.title,
    start: draft.quick.allDay ? event.start : draft.quick.start.toISOString(),
    end: draft.quick.allDay ? event.end : draft.quick.end.toISOString(),
    allDay: event.allDay,
    location: event.location,
    description: event.description,
    rrule: event.rrule,
    geo: event.geo,
    organizer: event.attendees.some((a) => a.email) ? config.organizer : undefined,
    attendees: event.attendees,
    links: draft.video ? [draft.video] : [],
  }
}
