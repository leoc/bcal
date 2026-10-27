import type { CalendarEvent, Config, EventInput, Person, Place } from '@shared/types'
import { type Draft, handleFor, localStamp, toNewEvent } from './draft'
import { toDate } from './format'

const MINUTE = 60_000
const DAY = 86_400_000

/** Organized by someone else: bcal may delete it from the calendar, not change it. */
export function isLocked(event: CalendarEvent, config: Config): boolean {
  const organizer = event.organizer?.email?.toLowerCase()
  return Boolean(organizer && organizer !== config.organizer?.email?.toLowerCase())
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function duration(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}min`
}

/**
 * An event as a quick-add line, e.g. `29.10.2026 14:00 1h Kaffee in Café
 * Kranzler @SimonMüller`, plus its place and people as if they had been picked,
 * so the full address, GEO and addresses survive the round trip.
 */
export function editLine(
  event: CalendarEvent,
  config: Config,
): { line: string; chosen: Record<string, Person>; places: Record<string, Place> } {
  const start = toDate(event.start)
  const end = toDate(event.end)
  const date = `${start.getDate()}.${start.getMonth() + 1}.${start.getFullYear()}`
  const when = event.allDay
    ? [
        date,
        ...(end.getTime() - start.getTime() > DAY
          ? [`${Math.round((end.getTime() - start.getTime()) / DAY) * 24}h`]
          : []),
      ]
    : [
        date,
        `${pad(start.getHours())}:${pad(start.getMinutes())}`,
        duration(Math.round((end.getTime() - start.getTime()) / MINUTE)),
      ]

  const parts = [...when, event.title]
  const places: Record<string, Place> = {}
  const location = event.location?.trim()
  if (location && !/^https?:\/\//i.test(location)) {
    const name = location.split(',')[0]?.trim() || location
    places[name.toLowerCase()] = { name, label: location, geo: event.geo, source: 'events' }
    // "Essen bei Friedi" names the place already
    if (!event.title.toLowerCase().includes(`bei ${name.toLowerCase()}`)) parts.push(`in ${name}`)
  }

  const chosen: Record<string, Person> = {}
  const me = config.organizer?.email?.toLowerCase()
  for (const attendee of event.attendees) {
    if (!attendee.email || attendee.email.toLowerCase() === me) continue
    const person = { name: attendee.name, email: attendee.email }
    const handle = handleFor(person)
    chosen[handle.toLowerCase()] = person
    parts.push(`@${handle}`)
  }
  return { line: parts.join(' '), chosen, places }
}

/**
 * The change a draft makes to `original`: what the line says, while things
 * the line cannot show (meeting link as location, description) stay.
 */
export function toEditInput(
  draft: Draft,
  original: CalendarEvent,
  config: Config,
): EventInput | undefined {
  const event = toNewEvent(draft, config)
  if (!event) return undefined
  const { alarm: _alarm, ...input } = event
  const link =
    original.location && /^https?:\/\//i.test(original.location) ? original.location : undefined
  const location = draft.quick.location
    ? input.location
    : (link ?? (draft.video && !original.links.length ? draft.video : undefined))
  const video = draft.video && !original.links.length ? `Video: ${draft.video}` : undefined
  return {
    ...input,
    location,
    geo: draft.quick.location ? input.geo : undefined,
    description: [original.description, video].filter(Boolean).join('\n\n') || undefined,
    attendees: input.attendees.filter((a) => a.email),
  }
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
