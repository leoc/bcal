import { existsSync, type FSWatcher, watch } from 'node:fs'
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import ICAL from 'ical.js'
import type {
  CalendarEvent,
  CalendarInfo,
  Created,
  DateRange,
  EventInput,
  EventRef,
  Geo,
  NewEvent,
  Person,
  Scope,
} from '../shared/types'
import { attendees, links, person } from './details'
import { deleteEvent, type EditOptions, editEvent, registerTimezones } from './editor'
import { parseGeo } from './places'
import { buildIcs, type WriteOptions } from './writer'

// Safety net for open-ended RRULEs that start long before the range.
const MAX_OCCURRENCES = 100_000

interface Change {
  path: string
  /** new text; null removes the file (into the trash) */
  ics: string | null
  /** a new file; it must not exist yet */
  fresh?: boolean
}

interface Written {
  path: string
  /** the text before; null when the file was new */
  before: string | null
}

interface Item {
  calendarId: string
  path: string
  event: ICAL.Event
}

/**
 * Reads a vdir tree `<root>/<account>/<collection>/*.ics` (as written by
 * pimsync/vdirsyncer) into memory and expands recurring events on demand.
 */
export class Vdir {
  private calendarList: CalendarInfo[] = []
  private items: Item[] = []
  /** writes of this session, newest last, for undo */
  private history: { label: string; files: Written[] }[] = []
  private watcher?: FSWatcher

  constructor(
    private readonly root: string,
    /** where removed files go; nothing is deleted for good */
    private readonly trash = join(homedir(), '_nobackup', '_deletable', 'bcal'),
  ) {}

  async load(): Promise<void> {
    const calendars: CalendarInfo[] = []
    const items: Item[] = []
    for (const account of await subdirs(this.root)) {
      for (const collection of await subdirs(join(this.root, account))) {
        const dir = join(this.root, account, collection)
        const id = `${account}/${collection}`
        const files = (await readdir(dir)).filter((f) => f.endsWith('.ics'))
        let eventCount = 0
        for (const file of files) {
          const parsed = await parseFile(join(dir, file), id)
          eventCount += parsed.length
          items.push(...parsed)
        }
        calendars.push({
          id,
          account,
          name: (await readMeta(dir, 'displayname')) ?? collection,
          color: await readMeta(dir, 'color'),
          eventCount,
        })
      }
    }
    this.calendarList = calendars.sort((a, b) => a.name.localeCompare(b.name))
    this.items = items
  }

  calendars(): CalendarInfo[] {
    return this.calendarList
  }

  events(range: DateRange): CalendarEvent[] {
    const rangeStart = ICAL.Time.fromJSDate(new Date(range.start), true)
    const rangeEnd = ICAL.Time.fromJSDate(new Date(range.end), true)
    const result: CalendarEvent[] = []
    for (const { calendarId, event } of this.items) {
      if (!event.isRecurring()) {
        if (overlaps(event.startDate, event.endDate, rangeStart, rangeEnd)) {
          result.push(toEvent(calendarId, event, event.startDate, event.endDate, event))
        }
        continue
      }
      if (event.startDate.compare(rangeEnd) >= 0) continue
      // Occurrences starting before this cannot reach into the range; skip
      // them without the costly override lookup. Overrides may move an
      // occurrence, so allow a week of slack on top of the duration.
      const lookFrom = rangeStart.clone()
      lookFrom.adjust(-7, 0, 0, 0)
      const duration = event.duration
      lookFrom.adjust(-duration.days - 7 * duration.weeks, -duration.hours, 0, 0)
      const iterator = event.iterator()
      for (
        let i = 0, next = iterator.next();
        next && i < MAX_OCCURRENCES;
        i++, next = iterator.next()
      ) {
        if (next.compare(rangeEnd) >= 0) break
        if (next.compare(lookFrom) < 0) continue
        const occurrence = event.getOccurrenceDetails(next)
        if (!overlaps(occurrence.startDate, occurrence.endDate, rangeStart, rangeEnd)) continue
        result.push(
          toEvent(
            calendarId,
            event,
            occurrence.startDate,
            occurrence.endDate,
            occurrence.item,
            next,
          ),
        )
      }
    }
    return result
  }

  /**
   * Events whose title, location or description contain every word of
   * `query`. A series is represented by its next occurrence (or its last one
   * if it is over). Upcoming matches come first, soonest first, then past
   * ones, most recent first.
   */
  search(query: string, limit = 50, now = new Date()): CalendarEvent[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return []
    const nowTime = ICAL.Time.fromJSDate(now, true)
    const upcoming: CalendarEvent[] = []
    const past: CalendarEvent[] = []
    for (const { calendarId, event } of this.items) {
      const haystack = [event.summary, event.location, event.description].join('\n').toLowerCase()
      if (!words.every((w) => haystack.includes(w))) continue
      const [start, end, item, recurrenceId] = this.representative(event, nowTime)
      const result = toEvent(calendarId, event, start, end, item, recurrenceId)
      if ((end ?? start).compare(nowTime) >= 0) upcoming.push(result)
      else past.push(result)
    }
    const byStart = (a: CalendarEvent, b: CalendarEvent) => a.start.localeCompare(b.start)
    return [...upcoming.sort(byStart), ...past.sort((a, b) => byStart(b, a))].slice(0, limit)
  }

  private representative(
    event: ICAL.Event,
    now: ICAL.Time,
  ): [ICAL.Time, ICAL.Time, ICAL.Event, ICAL.Time?] {
    if (!event.isRecurring()) return [event.startDate, event.endDate, event]
    const iterator = event.iterator()
    let last: ICAL.Time | undefined
    for (
      let i = 0, next = iterator.next();
      next && i < MAX_OCCURRENCES;
      i++, next = iterator.next()
    ) {
      last = next
      const end = next.clone()
      end.addDuration(event.duration)
      if (end.compare(now) >= 0) break
    }
    const occurrence = event.getOccurrenceDetails(last ?? event.startDate)
    return [occurrence.startDate, occurrence.endDate, occurrence.item, last ?? event.startDate]
  }

  /**
   * Expands the coming weeks once. ical.js is slow on its first timezone
   * conversions (~1 s for 1600 events); doing this while the renderer boots
   * makes the first real request fast.
   */
  warmUp(now = new Date()): void {
    const day = 86_400_000
    this.events({
      start: new Date(now.getTime() - 7 * day).toISOString(),
      end: new Date(now.getTime() + 42 * day).toISOString(),
    })
  }

  /** Reloads everything after a burst of file changes. */
  watch(onChange: () => void): void {
    let timer: NodeJS.Timeout | undefined
    this.watcher = watch(this.root, { recursive: true }, () => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        await this.load()
        onChange()
      }, 500)
    })
  }

  /** Organizers and attendees of all events, one entry per appearance. */
  participants(): Person[] {
    return this.items.flatMap(({ event }) => {
      const organizer = person(event.component.getFirstProperty('organizer'))
      return [...(organizer ? [organizer] : []), ...attendees(event.component)].map((p) => ({
        name: p.name,
        email: p.email?.toLowerCase(),
      }))
    })
  }

  /** LOCATION (and GEO) of every event that has one, one entry per event. */
  locations(): { location: string; geo?: Geo }[] {
    return this.items.flatMap(({ event }) =>
      event.location ? [{ location: event.location, geo: geoOf(event.component) }] : [],
    )
  }

  /** Writes a new event as `<uid>.ics` into its calendar; pimsync uploads it. */
  async create(input: NewEvent, options: WriteOptions = {}): Promise<Created> {
    this.calendar(input.calendarId)
    const { uid, ics } = buildIcs(input, options)
    const path = join(this.root, input.calendarId, `${uid}.ics`)
    await this.write('Neuer Termin', [{ path, ics, fresh: true }])
    return { id: `${input.calendarId}/${uid}/${input.start}`, path }
  }

  /**
   * Changes an event in its file (see `editEvent`). A new calendar moves the
   * whole event: written there, removed here.
   */
  async update(
    ref: EventRef,
    input: EventInput,
    scope: Scope,
    options: EditOptions = {},
  ): Promise<Created> {
    const item = this.find(ref)
    this.calendar(input.calendarId)
    const moving = input.calendarId !== ref.calendarId
    if (moving && item.event.isRecurring() && scope !== 'all') {
      throw new Error('Kalender wechselt nur die ganze Serie')
    }
    const result = editEvent(await readFile(item.path, 'utf8'), ref, input, scope, options)
    const changes: Change[] = []
    if (moving) {
      const target = join(this.root, input.calendarId, basename(item.path))
      changes.push({ path: target, ics: result.ics, fresh: true }, { path: item.path, ics: null })
    } else {
      changes.push({ path: item.path, ics: result.ics })
    }
    if (result.split) {
      const path = join(this.root, input.calendarId, `${result.split.uid}.ics`)
      changes.push({ path, ics: result.split.ics, fresh: true })
    }
    await this.write('Änderung', changes)
    return { id: `${input.calendarId}/${result.uid}/${result.start}`, path: changes[0]?.path ?? '' }
  }

  /** Deletes an event, one occurrence, or a series from an occurrence on. */
  async remove(ref: EventRef, scope: Scope, options: EditOptions = {}): Promise<void> {
    const item = this.find(ref)
    const ics = deleteEvent(await readFile(item.path, 'utf8'), ref, scope, options)
    await this.write('Löschen', [{ path: item.path, ics }])
  }

  /**
   * Takes back the last write of this session: changed files get their old
   * text back, new ones move to the trash, deleted ones come back.
   * Returns what was undone, or undefined when there is nothing left.
   */
  async undo(): Promise<string | undefined> {
    const last = this.history.pop()
    if (!last) return undefined
    for (const { path, before } of [...last.files].reverse()) {
      if (before === null) await this.trashFile(path)
      else await atomicWrite(path, before)
    }
    await this.refresh(last.files.map((f) => f.path))
    return last.label
  }

  private calendar(id: string): CalendarInfo {
    const calendar = this.calendarList.find((c) => c.id === id)
    if (!calendar) throw new Error(`unknown calendar ${id}`)
    return calendar
  }

  private find(ref: EventRef): Item {
    const item = this.items.find((i) => i.calendarId === ref.calendarId && i.event.uid === ref.uid)
    if (!item) throw new Error('Termin nicht gefunden (inzwischen geändert?)')
    return item
  }

  /**
   * Applies changes and remembers the files as they were, for undo. `null`
   * removes a file: it moves to the trash, nothing is deleted for good.
   */
  private async write(label: string, changes: Change[]): Promise<void> {
    const files: Written[] = []
    for (const change of changes) {
      const before = change.fresh ? null : await readFile(change.path, 'utf8')
      if (change.fresh && existsSync(change.path)) throw new Error(`${change.path} exists`)
      if (change.ics === null) await this.trashFile(change.path)
      else await atomicWrite(change.path, change.ics)
      files.push({ path: change.path, before })
    }
    this.history.push({ label, files })
    if (this.history.length > 50) this.history.shift()
    // show the result right away instead of waiting for the watcher's reload
    await this.refresh(changes.map((c) => c.path))
  }

  private async trashFile(path: string): Promise<void> {
    let target = join(this.trash, path.slice(this.root.length).replace(/^\/+/, ''))
    if (existsSync(target)) target = `${target}.${Date.now()}`
    await mkdir(join(target, '..'), { recursive: true })
    await move(path, target)
  }

  /** Re-reads the given files into the in-memory list. */
  private async refresh(paths: string[]): Promise<void> {
    const changed = new Set(paths)
    this.items = this.items.filter((item) => !changed.has(item.path))
    for (const path of changed) {
      if (!existsSync(path)) continue
      const calendarId = path
        .slice(this.root.length)
        .replace(/^\/+/, '')
        .split('/')
        .slice(0, 2)
        .join('/')
      this.items.push(...(await parseFile(path, calendarId)))
    }
  }

  close(): void {
    this.watcher?.close()
  }
}

async function subdirs(path: string): Promise<string[]> {
  const names = (await readdir(path).catch(() => [])).filter((name) => !name.startsWith('.'))
  // stat (not lstat) so symlinked accounts or collections count as directories
  const isDir = await Promise.all(
    names.map((name) =>
      stat(join(path, name)).then(
        (s) => s.isDirectory(),
        () => false,
      ),
    ),
  )
  return names.filter((_, i) => isDir[i])
}

async function readMeta(dir: string, name: string): Promise<string | undefined> {
  try {
    const value = (await readFile(join(dir, name), 'utf8')).trim()
    return value || undefined
  } catch {
    return undefined
  }
}

async function parseFile(path: string, calendarId: string): Promise<Item[]> {
  try {
    if (!(await stat(path)).isFile()) return []
    const root = new ICAL.Component(ICAL.parse(await readFile(path, 'utf8')))
    registerTimezones(root)
    const vevents = root.getAllSubcomponents('vevent')
    const master = vevents.find((v) => !v.hasProperty('recurrence-id'))
    // A file without master holds only detached overrides: show each as is.
    if (!master) return vevents.map((v) => ({ calendarId, path, event: new ICAL.Event(v) }))
    const exceptions = vevents.filter((v) => v !== master)
    return [{ calendarId, path, event: new ICAL.Event(master, { exceptions }) }]
  } catch (error) {
    console.warn(`bcal: cannot parse ${path}:`, error)
    return []
  }
}

function overlaps(start: ICAL.Time, end: ICAL.Time, rangeStart: ICAL.Time, rangeEnd: ICAL.Time) {
  const effectiveEnd = end ?? start
  return start.compare(rangeEnd) < 0 && effectiveEnd.compare(rangeStart) > 0
}

function toEvent(
  calendarId: string,
  master: ICAL.Event,
  start: ICAL.Time,
  end: ICAL.Time,
  item: ICAL.Event,
  recurrenceId?: ICAL.Time,
): CalendarEvent {
  const allDay = start.isDate
  const format = (t: ICAL.Time) => (allDay ? t.toString() : t.toJSDate().toISOString())
  const component = item.component
  const url = component.getFirstPropertyValue('url')
  const status = component.getFirstPropertyValue('status')
  const rrule = master.component.getFirstPropertyValue('rrule')
  return {
    id: `${calendarId}/${master.uid}/${start.toString()}`,
    calendarId,
    uid: master.uid,
    recurrenceId: recurrenceId?.toString(),
    title: item.summary || '(ohne Titel)',
    start: format(start),
    end: format(end ?? start),
    allDay,
    location: item.location || undefined,
    description: item.description || undefined,
    rrule: rrule ? rrule.toString() : undefined,
    geo: geoOf(component) ?? geoOf(master.component),
    status: typeof status === 'string' ? status : undefined,
    organizer: person(component.getFirstProperty('organizer')),
    attendees: attendees(component),
    links: links(typeof url === 'string' ? url : undefined, item.location, item.description),
  }
}

function geoOf(component: ICAL.Component): Geo | undefined {
  const value = component.getFirstPropertyValue('geo')
  if (!Array.isArray(value)) return undefined
  return parseGeo(value.join(';'))
}

/** rename, or copy and remove across file systems (EXDEV) */
async function move(from: string, to: string): Promise<void> {
  try {
    await rename(from, to)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
    await copyFile(from, to)
    await unlink(from)
  }
}

/** Writes through a hidden temp file, so pimsync never reads half a file. */
async function atomicWrite(path: string, text: string): Promise<void> {
  const temp = join(path, '..', `.${basename(path)}.${process.pid}.tmp`)
  await writeFile(temp, text)
  await rename(temp, path)
}
