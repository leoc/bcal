import { type FSWatcher, watch } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import ICAL from 'ical.js'
import type { CalendarEvent, CalendarInfo, DateRange } from '../shared/types'
import { attendees, links, person } from './details'

// Safety net for open-ended RRULEs that start long before the range.
const MAX_OCCURRENCES = 100_000

interface Item {
  calendarId: string
  event: ICAL.Event
}

/**
 * Reads a vdir tree `<root>/<account>/<collection>/*.ics` (as written by
 * pimsync/vdirsyncer) into memory and expands recurring events on demand.
 */
export class Vdir {
  private calendarList: CalendarInfo[] = []
  private items: Item[] = []
  private watcher?: FSWatcher

  constructor(private readonly root: string) {}

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
          toEvent(calendarId, event, occurrence.startDate, occurrence.endDate, occurrence.item),
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
      const [start, end, item] = this.representative(event, nowTime)
      const result = toEvent(calendarId, event, start, end, item)
      if ((end ?? start).compare(nowTime) >= 0) upcoming.push(result)
      else past.push(result)
    }
    const byStart = (a: CalendarEvent, b: CalendarEvent) => a.start.localeCompare(b.start)
    return [...upcoming.sort(byStart), ...past.sort((a, b) => byStart(b, a))].slice(0, limit)
  }

  private representative(event: ICAL.Event, now: ICAL.Time): [ICAL.Time, ICAL.Time, ICAL.Event] {
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
    return [occurrence.startDate, occurrence.endDate, occurrence.item]
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
    for (const tz of root.getAllSubcomponents('vtimezone')) {
      const tzid = tz.getFirstPropertyValue('tzid')
      if (typeof tzid === 'string' && !ICAL.TimezoneService.has(tzid)) {
        ICAL.TimezoneService.register(tz)
      }
    }
    const vevents = root.getAllSubcomponents('vevent')
    const master = vevents.find((v) => !v.hasProperty('recurrence-id'))
    // A file without master holds only detached overrides: show each as is.
    if (!master) return vevents.map((v) => ({ calendarId, event: new ICAL.Event(v) }))
    const exceptions = vevents.filter((v) => v !== master)
    return [{ calendarId, event: new ICAL.Event(master, { exceptions }) }]
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
    title: item.summary || '(ohne Titel)',
    start: format(start),
    end: format(end ?? start),
    allDay,
    location: item.location || undefined,
    description: item.description || undefined,
    rrule: rrule ? rrule.toString() : undefined,
    status: typeof status === 'string' ? status : undefined,
    organizer: person(component.getFirstProperty('organizer')),
    attendees: attendees(component),
    links: links(typeof url === 'string' ? url : undefined, item.location, item.description),
  }
}
