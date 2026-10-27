import ICAL from 'ical.js'
import type { Partstat } from '../shared/types'
import { deleteEvent, organizerOf, registerTimezones } from './editor'

/**
 * `.ics` files from outside (mail attachments, downloads): what they hold,
 * and the text bcal writes for each event in them. iTIP methods: PUBLISH and
 * REQUEST add or update, CANCEL removes; the METHOD line itself never goes
 * into the calendar (CalDAV forbids it there).
 */

export interface Incoming {
  uid: string
  /** the series or single event; undefined when the file only holds occurrences */
  master?: ICAL.Component
  /** RECURRENCE-ID components: changed or cancelled occurrences */
  overrides: ICAL.Component[]
}

export interface Parsed {
  method?: string
  events: Incoming[]
  /** the file's VTIMEZONEs, copied along with its events */
  timezones: ICAL.Component[]
}

export function parseImport(text: string): Parsed {
  const root = new ICAL.Component(ICAL.parse(text))
  if (root.name !== 'vcalendar') throw new Error('Keine Kalenderdatei')
  registerTimezones(root)
  const method = root.getFirstPropertyValue('method')
  const byUid = new Map<string, Incoming>()
  for (const vevent of root.getAllSubcomponents('vevent')) {
    const uid = vevent.getFirstPropertyValue('uid')
    if (typeof uid !== 'string' || !uid) continue
    const entry = byUid.get(uid) ?? { uid, overrides: [] }
    if (vevent.hasProperty('recurrence-id')) entry.overrides.push(vevent)
    else entry.master = vevent
    byUid.set(uid, entry)
  }
  if (!byUid.size) throw new Error('Keine Termine in der Datei')
  return {
    method: typeof method === 'string' ? method.toUpperCase() : undefined,
    events: [...byUid.values()],
    timezones: root.getAllSubcomponents('vtimezone'),
  }
}

/** The component that stands for the event: the series, else its first occurrence. */
export function lead(event: Incoming): ICAL.Component {
  const first = event.master ?? event.overrides[0]
  if (!first) throw new Error(`empty event ${event.uid}`)
  return first
}

export function sequenceOf(component: ICAL.Component): number {
  const value = Number(component.getFirstPropertyValue('sequence') ?? 0)
  return Number.isFinite(value) ? value : 0
}

/** The ATTENDEE that is me, if any. */
export function myAttendee(component: ICAL.Component, me: string[]): ICAL.Property | undefined {
  const mine = new Set(me.map((m) => m.toLowerCase()))
  return component.getAllProperties('attendee').find((p) => mine.has(emailOf(p)))
}

export function partstatOf(component: ICAL.Component, me: string[]): string | undefined {
  const value = myAttendee(component, me)?.getParameter('partstat')
  return typeof value === 'string' ? value.toUpperCase() : undefined
}

function emailOf(property: ICAL.Property): string {
  return String(property.getFirstValue() ?? '')
    .replace(/^(mailto:)+/i, '')
    .toLowerCase()
}

/** Asked to answer: someone else organizes and I am on the list. */
export function isInvitation(component: ICAL.Component, me: string[]): boolean {
  const organizer = organizerOf(component)
  const mine = me.map((m) => m.toLowerCase())
  return Boolean(organizer && !mine.includes(organizer) && myAttendee(component, me))
}

export interface ApplyOptions {
  /** my answer, set on my ATTENDEE in every component of the event */
  partstat?: Partstat
  me?: string[]
}

/**
 * The file text for `event` after importing it: a new file when `existing`
 * is null, else the existing file with the event replaced (a full update) or
 * with the given occurrences replaced (an update of single occurrences).
 */
export function importedText(
  parsed: Parsed,
  event: Incoming,
  existing: string | null,
  options: ApplyOptions = {},
): string {
  const root = existing
    ? new ICAL.Component(ICAL.parse(existing))
    : new ICAL.Component(['vcalendar', [], []])
  if (!existing) {
    root.addPropertyWithValue('version', '2.0')
    root.addPropertyWithValue('prodid', '-//bcal//import//EN')
  }
  root.removeAllProperties('method')
  const ours = root
    .getAllSubcomponents('vevent')
    .filter((v) => v.getFirstPropertyValue('uid') === event.uid)
  if (event.master) {
    for (const v of ours) root.removeSubcomponent(v)
  } else {
    const replaced = new Set(event.overrides.map(ridKey))
    for (const v of ours)
      if (v.hasProperty('recurrence-id') && replaced.has(ridKey(v))) root.removeSubcomponent(v)
  }
  const known = new Set(
    root.getAllSubcomponents('vtimezone').map((tz) => tz.getFirstPropertyValue('tzid')),
  )
  for (const tz of parsed.timezones) {
    // in a new file before the events; order does not matter to parsers
    if (!known.has(tz.getFirstPropertyValue('tzid'))) root.addSubcomponent(copy(tz))
  }
  for (const component of [...(event.master ? [event.master] : []), ...event.overrides]) {
    const added = copy(component)
    if (options.partstat && options.me) {
      const attendee = myAttendee(added, options.me)
      if (attendee) {
        attendee.setParameter('partstat', options.partstat)
        attendee.removeParameter('rsvp')
      }
    }
    root.addSubcomponent(added)
  }
  return serialize(root)
}

/**
 * The file after a CANCEL: null when the whole event goes, else the series
 * without the cancelled occurrences.
 */
export function cancelledText(
  event: Incoming,
  existing: string,
  calendarId: string,
): string | null {
  if (event.master) {
    const root = new ICAL.Component(ICAL.parse(existing))
    for (const v of root.getAllSubcomponents('vevent')) {
      if (v.getFirstPropertyValue('uid') === event.uid) root.removeSubcomponent(v)
    }
    return root.getAllSubcomponents('vevent').length ? serialize(root) : null
  }
  let text: string | null = existing
  for (const override of event.overrides) {
    if (text === null) break
    const rid = override.getFirstPropertyValue('recurrence-id') as ICAL.Time
    text = deleteEvent(text, { calendarId, uid: event.uid, recurrenceId: rid.toString() }, 'this')
  }
  return text
}

function ridKey(component: ICAL.Component): string {
  const rid = component.getFirstPropertyValue('recurrence-id') as ICAL.Time | null
  return rid ? rid.toJSDate().toISOString() : ''
}

function copy(component: ICAL.Component): ICAL.Component {
  return new ICAL.Component(ICAL.parse(component.toString()))
}

function serialize(root: ICAL.Component): string {
  return root.toString().replace(/\r?\n/g, '\r\n')
}

/** Titles as mail clients mangle them: prefixes, case, punctuation. */
export function titleWords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(
      /^((updated|new|aktualisiert|geändert|neue?)\s+)?(invitation|einladung|event|termin|abgesagt|canceled|cancelled|re|aw|fw|wg)\s*:\s*/g,
      '',
    )
    .replace(/\s*@.*$/, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1)
}

/** 1 for the same words, 0 for none in common (Jaccard). */
export function titleSimilarity(a: string, b: string): number {
  const left = new Set(titleWords(a))
  const right = new Set(titleWords(b))
  if (!left.size || !right.size) return 0
  const common = [...left].filter((w) => right.has(w)).length
  return common / (left.size + right.size - common)
}
