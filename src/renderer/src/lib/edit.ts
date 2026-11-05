import type { CalendarEvent, Config, EventInput } from '@shared/types'
import { DRAFT_ID, type Draft, localStamp } from './draft'
import { toDate } from './format'

const MINUTE = 60_000
const DAY = 86_400_000

function ownAddresses(config: Config): (string | undefined)[] {
  return [config.organizer?.email?.toLowerCase(), ...config.emails]
}

/** Organized by someone else: bcal may delete it from the calendar, not change it. */
export function isLocked(event: CalendarEvent, config: Config): boolean {
  const organizer = event.organizer?.email?.toLowerCase()
  return Boolean(organizer && !ownAddresses(config).includes(organizer))
}

/**
 * My PARTSTAT, when the event is someone else's and asks me to answer:
 * I am on the list and the organizer has not cancelled it.
 */
export function invitationAnswer(event: CalendarEvent, config: Config): string | undefined {
  if (event.cancelled || !isLocked(event, config)) return undefined
  const own = ownAddresses(config)
  const attendee = event.attendees.find((a) => own.includes(a.email?.toLowerCase()))
  return attendee && (attendee.status?.toUpperCase() ?? 'NEEDS-ACTION')
}

function midnight(date: Date, days = 0): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/** New start and end: the times the line names, the rest from the event. */
function mergedTimes(
  quick: Draft['quick'],
  original: CalendarEvent,
  config: Config,
): { start: Date; end: Date; allDay: boolean } {
  const { given } = quick
  const oldStart = toDate(original.start)
  const oldEnd = toDate(original.end)
  const allDay = given.time ? false : given.end || original.allDay
  const day = given.date ? quick.start : oldStart
  const clock = given.time ? quick.start : oldStart

  if (allDay) {
    if (given.end) return { start: quick.start, end: quick.end, allDay }
    const start = midnight(day)
    const days = quick.duration
      ? Math.max(1, Math.round(quick.duration / (24 * 60)))
      : Math.max(1, Math.round((midnight(oldEnd).getTime() - midnight(oldStart).getTime()) / DAY))
    return { start, end: midnight(start, days), allDay }
  }

  const start = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    clock.getHours(),
    clock.getMinutes(),
  )
  const length = given.end
    ? quick.end.getTime() - quick.start.getTime()
    : quick.duration
      ? quick.duration * MINUTE
      : original.allDay
        ? config.defaultDuration * MINUTE
        : oldEnd.getTime() - oldStart.getTime()
  return { start, end: new Date(start.getTime() + length), allDay }
}

/**
 * The change an edit line makes to `original`: only what the line names
 * (date, time, duration or end, title, place, people, calendar, recurrence,
 * video) is replaced, everything else stays as it was.
 */
export function mergeEdit(
  draft: Draft,
  original: CalendarEvent,
  config: Config,
): EventInput | undefined {
  if (!draft.calendar) return undefined
  const { quick } = draft
  const times = mergedTimes(quick, original, config)
  const video = draft.video && !original.links.length ? draft.video : undefined
  const location = quick.location
    ? (draft.place?.label ?? quick.location)
    : (original.location ?? video)
  const people = quick.people.length
    ? draft.people.flatMap((p) => (p.person?.email ? [p.person] : []))
    : original.attendees.filter((a) => a.email && a.email.toLowerCase() !== me(config))
  return {
    calendarId: draft.calendar.id,
    title: quick.title || original.title,
    start: localStamp(times.start, times.allDay),
    end: localStamp(times.end, times.allDay),
    allDay: times.allDay,
    location,
    geo: quick.location ? draft.place?.geo : original.geo,
    description:
      [original.description, video && `Video: ${video}`].filter(Boolean).join('\n\n') || undefined,
    // the writer keeps the recurrence unless one is given
    rrule: quick.rrule,
    attendees: people.map(({ name, email }) => ({ name, email })),
  }
}

/** The edited event as it will look, for the details panel and the grid. */
export function editPreview(
  draft: Draft,
  original: CalendarEvent,
  config: Config,
): CalendarEvent | undefined {
  const input = mergeEdit(draft, original, config)
  if (!input) return undefined
  const status = new Map(original.attendees.map((a) => [a.email?.toLowerCase(), a]))
  const video = draft.video && !original.links.length ? draft.video : undefined
  return {
    ...original,
    id: DRAFT_ID,
    calendarId: input.calendarId,
    title: input.title,
    start: input.allDay ? input.start : new Date(input.start).toISOString(),
    end: input.allDay ? input.end : new Date(input.end).toISOString(),
    allDay: input.allDay,
    location: input.location,
    geo: input.geo,
    description: input.description,
    rrule: input.rrule ?? original.rrule,
    attendees: [
      ...original.attendees.filter((a) => a.email?.toLowerCase() === me(config)),
      ...input.attendees.map((a) => status.get(a.email?.toLowerCase()) ?? a),
    ],
    links: video ? [...original.links, video] : original.links,
  }
}

function me(config: Config): string | undefined {
  return config.organizer?.email?.toLowerCase()
}

/** The event with new times, e.g. after dragging it. */
export function movedInput(
  event: CalendarEvent,
  start: Date,
  end: Date | null,
  allDay: boolean,
): EventInput {
  const fallback = allDay
    ? DAY
    : event.allDay
      ? 60 * MINUTE
      : toDate(event.end).getTime() - toDate(event.start).getTime()
  const finish = end ?? new Date(start.getTime() + fallback)
  return {
    calendarId: event.calendarId,
    title: event.title,
    start: localStamp(start, allDay),
    end: localStamp(finish, allDay),
    allDay,
    location: event.location,
    geo: event.geo,
    description: event.description,
    attendees: event.attendees.filter((a) => a.email).map(({ name, email }) => ({ name, email })),
  }
}
