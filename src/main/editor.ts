import { randomUUID } from 'node:crypto'
import ICAL from 'ical.js'
import type { EventInput, EventRef, Person, Scope } from '../shared/types'
import { addPerson, BERLIN, time } from './writer'

/**
 * Edits on the text of one `.ics` file. Everything not named in the input
 * (alarms, X-properties, PARTSTAT of attendees, other components) stays as
 * it was; times are only rewritten when they changed.
 */

export interface EditOptions {
  /** the user; events organized by someone else cannot be edited */
  organizer?: Person
  now?: Date
  /** UID for the new series when "following" splits one */
  newUid?: string
}

export interface EditResult {
  /** the file's new text; null when nothing of it is left */
  ics: string | null
  /** a second file, when "following" split a series */
  split?: { uid: string; ics: string }
  /** start of the edited occurrence as `events()` reports it */
  start: string
  uid: string
}

export class LockedError extends Error {}

/** Registers the file's own zones so its times convert correctly. */
export function registerTimezones(root: ICAL.Component): void {
  for (const tz of root.getAllSubcomponents('vtimezone')) {
    const tzid = tz.getFirstPropertyValue('tzid')
    if (typeof tzid === 'string' && !ICAL.TimezoneService.has(tzid)) {
      ICAL.TimezoneService.register(tz)
    }
  }
}

/** Who organizes the event, without `mailto:`; undefined when nobody does. */
export function organizerOf(component: ICAL.Component): string | undefined {
  const value = component.getFirstPropertyValue('organizer')
  if (typeof value !== 'string') return undefined
  return value.replace(/^(mailto:)+/i, '').toLowerCase() || undefined
}

function isLocked(component: ICAL.Component, me: Person | undefined): boolean {
  const organizer = organizerOf(component)
  return organizer !== undefined && organizer !== me?.email?.toLowerCase()
}

function parse(ics: string) {
  const root = new ICAL.Component(ICAL.parse(ics))
  registerTimezones(root)
  return root
}

function serialize(root: ICAL.Component): string {
  return root.toString().replace(/\r?\n/g, '\r\n')
}

interface Found {
  root: ICAL.Component
  /** the series (or the single event); undefined for a file of detached overrides */
  master?: ICAL.Component
  /** the override for `ref.recurrenceId`, if there is one */
  override?: ICAL.Component
  /** RECURRENCE-ID as a time in the zone of the master's DTSTART */
  rid?: ICAL.Time
}

function find(ics: string, ref: EventRef): Found {
  const root = parse(ics)
  const ours = root
    .getAllSubcomponents('vevent')
    .filter((v) => v.getFirstPropertyValue('uid') === ref.uid)
  if (!ours.length) throw new Error(`event ${ref.uid} is not in its file any more`)
  const master = ours.find((v) => !v.hasProperty('recurrence-id'))
  const reference = master ?? ours[0]
  const rid = ref.recurrenceId && reference ? ridTime(ref.recurrenceId, reference) : undefined
  const override = rid
    ? ours.find((v) => {
        const value = v.getFirstPropertyValue('recurrence-id')
        return value instanceof ICAL.Time && value.compare(rid) === 0
      })
    : undefined
  return { root, master, override, rid }
}

/** `2026-10-28T09:30:00` in the zone of the component's DTSTART. */
function ridTime(value: string, component: ICAL.Component): ICAL.Time {
  const start = component.getFirstPropertyValue('dtstart') as ICAL.Time
  const parsed = ICAL.Time.fromString(value, null)
  if (value.endsWith('Z') || parsed.isDate) return parsed
  const t = start.clone()
  t.resetTo(
    parsed.year,
    parsed.month,
    parsed.day,
    parsed.hour,
    parsed.minute,
    parsed.second,
    start.zone,
  )
  return t
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** A time as the renderer writes it: local wall clock, or a date. */
function stamp(t: ICAL.Time): string {
  if (t.isDate) return t.toString()
  const d = t.toJSDate()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function ensureBerlin(root: ICAL.Component): void {
  const has = root
    .getAllSubcomponents('vtimezone')
    .some((tz) => tz.getFirstPropertyValue('tzid') === 'Europe/Berlin')
  if (!has) {
    const tz = new ICAL.Component(ICAL.parse(BERLIN))
    root.addSubcomponent(tz)
    registerTimezones(root)
  }
}

function setTime(
  root: ICAL.Component,
  component: ICAL.Component,
  name: 'dtstart' | 'dtend',
  value: string,
  allDay: boolean,
): void {
  const current = component.getFirstPropertyValue(name)
  if (current instanceof ICAL.Time && current.isDate === allDay && stamp(current) === value) return
  component.removeAllProperties(name)
  const property = component.addPropertyWithValue(name, time(value, allDay))
  if (!allDay) {
    ensureBerlin(root)
    property.setParameter('tzid', 'Europe/Berlin')
  }
}

function setText(component: ICAL.Component, name: string, value: string | undefined): void {
  const current = component.getFirstPropertyValue(name)
  if ((current ?? undefined) === (value || undefined)) return
  component.removeAllProperties(name)
  if (value) component.addPropertyWithValue(name, value)
  // Outlook's HTML copy of the description would contradict the new text
  if (name === 'description') component.removeAllProperties('x-alt-desc')
}

function emailOf(property: ICAL.Property): string {
  return String(property.getFirstValue() ?? '')
    .replace(/^(mailto:)+/i, '')
    .toLowerCase()
}

/** Keeps known attendees as they are (PARTSTAT!), adds new ones, drops removed ones. */
function syncAttendees(component: ICAL.Component, people: Person[], me: Person | undefined): void {
  const wanted = new Map(
    people.filter((p) => p.email).map((p) => [p.email?.toLowerCase() ?? '', p] as const),
  )
  const myself = me?.email?.toLowerCase()
  for (const property of component.getAllProperties('attendee')) {
    const email = emailOf(property)
    if (email === myself) continue
    if (wanted.has(email)) wanted.delete(email)
    else component.removeProperty(property)
  }
  for (const person of wanted.values()) addPerson(component, 'attendee', person)
  const others = component.getAllProperties('attendee').filter((p) => emailOf(p) !== myself)
  if (others.length && !component.hasProperty('organizer') && me?.email) {
    addPerson(component, 'organizer', me)
  }
}

function touch(component: ICAL.Component, now: Date): void {
  const sequence = Number(component.getFirstPropertyValue('sequence') ?? 0)
  component.updatePropertyWithValue('sequence', (Number.isFinite(sequence) ? sequence : 0) + 1)
  component.updatePropertyWithValue('dtstamp', ICAL.Time.fromJSDate(now, true))
  component.updatePropertyWithValue('last-modified', ICAL.Time.fromJSDate(now, true))
}

function apply(
  root: ICAL.Component,
  component: ICAL.Component,
  input: EventInput,
  times: { start: string; end: string },
  options: EditOptions,
): void {
  setText(component, 'summary', input.title)
  setTime(root, component, 'dtstart', times.start, input.allDay)
  setTime(root, component, 'dtend', times.end, input.allDay)
  component.removeAllProperties('duration')
  setText(component, 'location', input.location)
  const geo = component.getFirstPropertyValue('geo')
  const same =
    Array.isArray(geo) && input.geo && geo[0] === input.geo.lat && geo[1] === input.geo.lon
  if (!same) {
    component.removeAllProperties('geo')
    if (input.geo) component.addPropertyWithValue('geo', [input.geo.lat, input.geo.lon])
  }
  setText(component, 'description', input.description)
  syncAttendees(component, input.attendees, options.organizer)
  touch(component, options.now ?? new Date())
}

function clone(component: ICAL.Component): ICAL.Component {
  return new ICAL.Component(ICAL.parse(component.toString()))
}

/** Local wall clock plus `ms`, keeping the form (date or date-time). */
function shiftStamp(value: string, ms: number, allDay: boolean): string {
  const t = time(value, allDay)
  if (allDay) {
    t.adjust(Math.round(ms / 86_400_000), 0, 0, 0)
    return t.toString()
  }
  const d = new Date(new Date(value).getTime() + ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function millis(value: string): number {
  return value.length === 10 ? new Date(`${value}T00:00:00`).getTime() : new Date(value).getTime()
}

/** Moves a time by `ms`, keeping its zone. */
function shifted(t: ICAL.Time, ms: number): ICAL.Time {
  const copy = t.clone()
  if (copy.isDate) copy.adjust(Math.round(ms / 86_400_000), 0, 0, 0)
  else copy.adjust(0, 0, 0, Math.round(ms / 1000))
  return copy
}

function exdates(master: ICAL.Component): ICAL.Time[] {
  return master
    .getAllProperties('exdate')
    .flatMap((p) => p.getValues())
    .filter((v): v is ICAL.Time => v instanceof ICAL.Time)
}

function setExdates(master: ICAL.Component, values: ICAL.Time[]): void {
  const tzid = master.getFirstProperty('dtstart')?.getParameter('tzid')
  master.removeAllProperties('exdate')
  for (const value of values) {
    const property = master.addPropertyWithValue('exdate', value)
    if (typeof tzid === 'string' && !value.isDate && value.zone !== ICAL.Timezone.utcTimezone)
      property.setParameter('tzid', tzid)
  }
}

function overridesOf(root: ICAL.Component, uid: string): ICAL.Component[] {
  return root
    .getAllSubcomponents('vevent')
    .filter((v) => v.getFirstPropertyValue('uid') === uid && v.hasProperty('recurrence-id'))
}

function ridOf(component: ICAL.Component): ICAL.Time {
  return component.getFirstPropertyValue('recurrence-id') as ICAL.Time
}

function setRid(component: ICAL.Component, value: ICAL.Time, master: ICAL.Component): void {
  component.removeAllProperties('recurrence-id')
  const property = component.addPropertyWithValue('recurrence-id', value)
  const tzid = master.getFirstProperty('dtstart')?.getParameter('tzid')
  if (typeof tzid === 'string' && !value.isDate) property.setParameter('tzid', tzid)
}

/** Ends the series before `rid`: COUNT counts the remaining ones, else UNTIL. */
function endBefore(master: ICAL.Component, rid: ICAL.Time): { before: number; rule: ICAL.Recur } {
  const rule = master.getFirstPropertyValue('rrule') as ICAL.Recur
  const iterator = new ICAL.Event(master).iterator()
  let before = 0
  for (let next = iterator.next(); next && next.compare(rid) < 0; next = iterator.next()) before++
  const ended = rule.clone()
  if (rule.count) {
    ended.count = before
  } else {
    let until: ICAL.Time
    if (rid.isDate) {
      until = rid.clone()
      until.adjust(-1, 0, 0, 0)
    } else {
      until = rid.convertToZone(ICAL.Timezone.utcTimezone)
      until.adjust(0, 0, 0, -1)
    }
    ended.until = until
  }
  master.updatePropertyWithValue('rrule', ended)
  return { before, rule }
}

function startOf(component: ICAL.Component): ICAL.Time {
  return component.getFirstPropertyValue('dtstart') as ICAL.Time
}

/**
 * Applies `input` to the event `ref` in `ics`. For a series, `scope` says
 * whether only this occurrence changes (an override), all of them (the
 * master, shifted by as much as this occurrence moved), or this and the
 * following ones (the series is split and a new one starts here).
 */
export function editEvent(
  ics: string,
  ref: EventRef,
  input: EventInput,
  scope: Scope,
  options: EditOptions = {},
): EditResult {
  const { root, master, override, rid } = find(ics, ref)
  const target = master ?? override
  if (!target) throw new Error('nothing to edit')
  if (isLocked(target, options.organizer)) throw new LockedError('organized by someone else')
  const recurring = Boolean(master?.hasProperty('rrule') || master?.hasProperty('rdate'))
  const times = { start: input.start, end: input.end }

  // a single event, a detached override, or the first occurrence of the series
  if (
    !recurring ||
    !master ||
    !rid ||
    (scope === 'following' && rid.compare(startOf(master)) === 0)
  ) {
    if (input.rrule) setRrule(target, input.rrule)
    apply(root, target, input, times, options)
    return { ics: serialize(root), start: input.start, uid: ref.uid }
  }

  if (scope === 'this') {
    let component = override
    if (!component) {
      component = clone(master)
      for (const name of ['rrule', 'rdate', 'exdate']) component.removeAllProperties(name)
      setRid(component, rid, master)
      root.addSubcomponent(component)
    }
    apply(root, component, input, times, options)
    return { ics: serialize(root), start: input.start, uid: ref.uid }
  }

  // how far this occurrence moved, applied to the whole series or the new part
  const occurrenceStart = override ? startOf(override) : rid
  const delta = millis(input.start) - millis(stamp(occurrenceStart))

  if (scope === 'all') {
    const start = startOf(master)
    const length = millis(input.end) - millis(input.start)
    const newStart = shiftStamp(stamp(start), delta, input.allDay && start.isDate)
    const newEnd = shiftStamp(newStart, length, input.allDay && start.isDate)
    if (delta && !(input.allDay !== start.isDate)) {
      // keep EXDATEs and overrides attached to their occurrences
      setExdates(
        master,
        exdates(master).map((t) => shifted(t, delta)),
      )
      for (const o of overridesOf(root, ref.uid)) setRid(o, shifted(ridOf(o), delta), master)
    }
    if (input.rrule) setRrule(master, input.rrule)
    apply(
      root,
      master,
      input,
      input.allDay !== start.isDate ? times : { start: newStart, end: newEnd },
      options,
    )
    return { ics: serialize(root), start: input.start, uid: ref.uid }
  }

  // following: end the old series before this occurrence, start a new one here
  const uid = options.newUid ?? randomUUID()
  const fresh = clone(master)
  const { before, rule } = endBefore(master, rid)
  fresh.updatePropertyWithValue('uid', uid)
  const freshRule = rule.clone()
  if (rule.count) freshRule.count = rule.count - before
  fresh.updatePropertyWithValue('rrule', freshRule)
  if (input.rrule) setRrule(fresh, input.rrule)
  fresh.removeAllProperties('sequence')
  const [keep, move] = partition(exdates(master), (t) => t.compare(rid) < 0)
  setExdates(master, keep)
  setExdates(
    fresh,
    move.map((t) => shifted(t, delta)),
  )

  const split = new ICAL.Component('vcalendar')
  for (const name of ['prodid', 'version', 'calscale']) {
    const value = root.getFirstPropertyValue(name)
    if (value) split.addPropertyWithValue(name, value as string)
  }
  for (const tz of root.getAllSubcomponents('vtimezone')) split.addSubcomponent(clone(tz))
  split.addSubcomponent(fresh)
  for (const o of overridesOf(root, ref.uid)) {
    if (ridOf(o).compare(rid) < 0) continue
    root.removeSubcomponent(o)
    if (o === override) continue
    o.updatePropertyWithValue('uid', uid)
    setRid(o, shifted(ridOf(o), delta), fresh)
    split.addSubcomponent(o)
  }
  touch(master, options.now ?? new Date())
  apply(split, fresh, input, times, options)
  return {
    ics: serialize(root),
    split: { uid, ics: serialize(split) },
    start: input.start,
    uid,
  }
}

function setRrule(component: ICAL.Component, value: string): void {
  component.removeAllProperties('rrule')
  component.addProperty(new ICAL.Property(ICAL.parse.property(`RRULE:${value}`)))
}

function partition<T>(list: T[], test: (item: T) => boolean): [T[], T[]] {
  return [list.filter(test), list.filter((item) => !test(item))]
}

/**
 * Removes the event `ref` from `ics`: the whole file's event, only this
 * occurrence (EXDATE), or this and the following ones (series ends before).
 * Events organized by someone else may be removed as well; that only takes
 * them out of this calendar.
 */
export function deleteEvent(
  ics: string,
  ref: EventRef,
  scope: Scope,
  options: EditOptions = {},
): string | null {
  const { root, master, override, rid } = find(ics, ref)
  const recurring = Boolean(master?.hasProperty('rrule') || master?.hasProperty('rdate'))
  const remaining = () => (root.getAllSubcomponents('vevent').length ? serialize(root) : null)

  if (!master && override) {
    root.removeSubcomponent(override)
    return remaining()
  }
  if (!master) return remaining()
  const all =
    !recurring ||
    !rid ||
    scope === 'all' ||
    (scope === 'following' && rid.compare(startOf(master)) <= 0)
  if (all) {
    for (const v of root.getAllSubcomponents('vevent')) {
      if (v.getFirstPropertyValue('uid') === ref.uid) root.removeSubcomponent(v)
    }
    return remaining()
  }
  if (scope === 'this') {
    if (override) root.removeSubcomponent(override)
    setExdates(master, [...exdates(master), rid])
  } else {
    endBefore(master, rid)
    setExdates(
      master,
      exdates(master).filter((t) => t.compare(rid) < 0),
    )
    for (const o of overridesOf(root, ref.uid)) {
      if (ridOf(o).compare(rid) >= 0) root.removeSubcomponent(o)
    }
  }
  touch(master, options.now ?? new Date())
  return serialize(root)
}
