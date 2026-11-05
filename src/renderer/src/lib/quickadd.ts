import * as chrono from 'chrono-node'

/** What a quick-add line like `nächsten Freitag 14 Uhr 1h Planung @Simon #family` means. */
export interface QuickAdd {
  title: string
  start: Date
  end: Date
  allDay: boolean
  /** `@` tokens as typed, without the `@`; resolved to people by the caller */
  people: string[]
  /** `#` token as typed, resolved to a calendar by the caller */
  calendar?: string
  location?: string
  /** RRULE value, e.g. `FREQ=WEEKLY;BYDAY=MO` */
  rrule?: string
  /** the line named a date, time, person or calendar, so it reads like an event */
  explicit: boolean
  /** `video`, `call` or `jitsi` was given */
  video: boolean
  /** which parts the line names itself, rather than filled in by default */
  given: { date: boolean; time: boolean; end: boolean }
  /** minutes, when the line names a duration (`1h`, `90min`) */
  duration?: number
}

export interface QuickAddOptions {
  now?: Date
  /** minutes, used when neither duration nor end is given */
  defaultDuration?: number
  /** names of places picked from completion; matched whole, even with small words */
  places?: string[]
  /** how far a date without a year may lie back: `month` or days; default `month` */
  backdate?: 'month' | number
}

/** The `@`/`#` token or place the cursor is in, for completion. */
export interface ActiveToken {
  kind: 'person' | 'calendar' | 'place'
  query: string
  from: number
  to: number
}

const MINUTE = 60_000
const DAY = 86_400_000
/** stands in for a known `bei <host>` until the title is built */
const HOST = '\u0001'

const weekdayCodes: Record<string, string> = {
  montag: 'MO',
  monday: 'MO',
  dienstag: 'TU',
  tuesday: 'TU',
  mittwoch: 'WE',
  wednesday: 'WE',
  donnerstag: 'TH',
  thursday: 'TH',
  freitag: 'FR',
  friday: 'FR',
  samstag: 'SA',
  saturday: 'SA',
  sonntag: 'SU',
  sunday: 'SU',
}
const codeOrder = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const months = new Set(
  'januar jänner februar märz april mai juni juli august september oktober november dezember january february march may june july october december'.split(
    ' ',
  ),
)

const monthNumbers: Record<string, number> = {
  januar: 1,
  january: 1,
  jänner: 1,
  jan: 1,
  februar: 2,
  february: 2,
  feb: 2,
  märz: 3,
  march: 3,
  mär: 3,
  mar: 3,
  april: 4,
  apr: 4,
  mai: 5,
  may: 5,
  juni: 6,
  june: 6,
  jun: 6,
  juli: 7,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  oktober: 10,
  october: 10,
  okt: 10,
  oct: 10,
  november: 11,
  nov: 11,
  dezember: 12,
  december: 12,
  dez: 12,
  dec: 12,
}

const frequencies: Record<string, string> = {
  täglich: 'DAILY',
  daily: 'DAILY',
  tag: 'DAILY',
  tage: 'DAILY',
  day: 'DAILY',
  days: 'DAILY',
  wöchentlich: 'WEEKLY',
  weekly: 'WEEKLY',
  woche: 'WEEKLY',
  wochen: 'WEEKLY',
  week: 'WEEKLY',
  weeks: 'WEEKLY',
  monatlich: 'MONTHLY',
  monthly: 'MONTHLY',
  monat: 'MONTHLY',
  monate: 'MONTHLY',
  month: 'MONTHLY',
  months: 'MONTHLY',
  jährlich: 'YEARLY',
  yearly: 'YEARLY',
  jahr: 'YEARLY',
  jahre: 'YEARLY',
  year: 'YEARLY',
  years: 'YEARLY',
}

const numberWords: Record<string, number> = {
  ein: 1,
  eine: 1,
  einer: 1,
  an: 1,
  a: 1,
  one: 1,
  zwei: 2,
  two: 2,
  drei: 3,
  three: 3,
  anderthalb: 1.5,
  eineinhalb: 1.5,
  halbe: 0.5,
  half: 0.5,
}

const L = '\\p{L}'

/** Removes `match` from `text`, keeping the rest readable. */
function cut(text: string, match: { index?: number; 0: string }): string {
  const at = match.index ?? text.indexOf(match[0])
  return `${text.slice(0, at)} ${text.slice(at + match[0].length)}`
}

function untilValue(date: Date): string {
  // end of that local day, in UTC as RFC 5545 wants with a zoned DTSTART
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59)
  return `${end.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`
}

type MonthDay = [month: number, day: number]

function endsBefore([startMonth, startDay]: MonthDay, [endMonth, endDay]: MonthDay): boolean {
  return endMonth < startMonth || (endMonth === startMonth && endDay < startDay)
}

/** What decides the year of a date typed without one. */
interface YearRule {
  now: Date
  /** the line says the date lies behind us */
  past: boolean
  /** earliest day a date may end on without moving to the next year */
  limit: Date
}

function backdateLimit(now: Date, backdate: 'month' | number): Date {
  return backdate === 'month'
    ? new Date(now.getFullYear(), now.getMonth(), 1)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate() - backdate)
}

/**
 * The years of a date or range typed without one: the first that does not end
 * before the limit, or with `past` the last one that has started.
 */
function pickYears(start: MonthDay, end: MonthDay, rule: YearRule): [number, number] {
  const wrap = endsBefore(start, end) ? 1 : 0
  if (rule.past) {
    let year = rule.now.getFullYear() + 1
    while (new Date(year, start[0] - 1, start[1]) > rule.now) year--
    return [year, year + wrap]
  }
  let year = rule.now.getFullYear() - 1
  while (new Date(year + wrap, end[0] - 1, end[1]) < rule.limit) year++
  return [year, year + wrap]
}

/** `12.11.` → `12.11.2026`, which chrono understands. */
function completeDottedDates(text: string, rule: YearRule): string {
  return text.replace(/(^|\s)(\d{1,2})\.(\d{1,2})\.(?!\d)/g, (_m, lead, d, m) => {
    const day: MonthDay = [Number(m), Number(d)]
    return `${lead}${d}.${m}.${pickYears(day, day, rule)[0]}`
  })
}

/** One side of a date range; the start may leave its month to the end (`2.-6.11.`). */
function rangeSide(n: number, month: string): string {
  const names = Object.keys(monthNumbers).join('|')
  return (
    `(?<day${n}>\\d{1,2})\\.` +
    `(?:(?<month${n}>\\d{1,2})\\.(?<year${n}>\\d{2,4})?|\\s*(?<name${n}>${names})(?:\\s+(?<long${n}>\\d{4}))?)${month}` +
    `(?:\\s+(?:um\\s+)?(?<clock${n}>\\d{1,2}(?:[:.]\\d{2})?\\s*uhr|\\d{1,2}:\\d{2}))?`
  )
}

const weekdayAtEnd = new RegExp(`(${Object.keys(weekdayCodes).join('|')})\\W*$`)

/** `<2.10.`, `letzter 2.10.`, `last Nov 2`, `letzten Montag`: the date lies behind us. */
const pastMarker = new RegExp(
  `(?<=\\s)(?:<\\s*|(?:letzte[nrs]?|last)\\s+)(?=\\d{1,2}\\.|(?:${Object.keys(monthNumbers).join('|')})\\s+\\d|(?:${Object.keys(weekdayCodes).join('|')})\\s)`,
  'iu',
)

const dateRange = new RegExp(
  `(?<=\\s)${rangeSide(1, '?')}\\s*(?:-|–|bis(?:\\s+zum)?|to|until)\\s*${rangeSide(2, '')}(?=\\s)`,
  'giu',
)

function fullYear(short: string | undefined): number | undefined {
  if (!short) return undefined
  return short.length === 2 ? 2000 + Number(short) : Number(short)
}

function clockOf(text: string | undefined): string | undefined {
  const m = text?.match(/(\d{1,2})(?:[:.](\d{2}))?/)
  return m ? `${m[1]?.padStart(2, '0')}:${m[2] ?? '00'}` : undefined
}

function validDay(year: number, month: number, day: number): boolean {
  return new Date(year, month - 1, day).getMonth() === month - 1
}

/**
 * `2.11. bis 6.11.`, `2.-6.11.`, `2. bis 6. November` or
 * `10.11. 9 Uhr bis 12.11. 17 Uhr` with years and times spelled out so chrono
 * reads one range. The years are chosen for the range as a whole.
 */
function completeDateRanges(text: string, rule: YearRule): string {
  return text.replace(dateRange, (match, ...args) => {
    const g = args.at(-1) as Record<string, string | undefined>
    const monthOf = (n: 1 | 2) =>
      Number(g[`month${n}`]) || monthNumbers[g[`name${n}`]?.toLowerCase() ?? '']
    const endMonth = monthOf(2)
    const startMonth = monthOf(1) ?? endMonth
    if (!startMonth || !endMonth) return match
    const startDay = Number(g.day1)
    const endDay = Number(g.day2)

    const wrap = endsBefore([startMonth, startDay], [endMonth, endDay]) ? 1 : 0
    let startYear = fullYear(g.year1 ?? g.long1)
    let endYear = fullYear(g.year2 ?? g.long2)
    if (startYear === undefined && endYear === undefined) {
      ;[startYear, endYear] = pickYears([startMonth, startDay], [endMonth, endDay], rule)
    }
    startYear ??= (endYear as number) - wrap
    endYear ??= startYear + wrap
    if (!validDay(startYear, startMonth, startDay) || !validDay(endYear, endMonth, endDay)) {
      return match
    }

    const startClock = clockOf(g.clock1) ?? clockOf(g.clock2)
    if (!startClock) {
      return `${startDay}.${startMonth}.${startYear} bis ${endDay}.${endMonth}.${endYear}`
    }
    const iso = (year: number, month: number, day: number) =>
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const endClock = clockOf(g.clock2) ?? startClock
    return `${iso(startYear, startMonth, startDay)}T${startClock} - ${iso(endYear, endMonth, endDay)}T${endClock}`
  })
}

/**
 * Start and end of a chrono result: a weekday end is the first one from the
 * start on, and without a year the years are picked for the date or range as
 * a whole.
 */
function settleDates(result: chrono.ParsedResult, rule: YearRule): { start: Date; end?: Date } {
  const { start: s, end: e } = result
  const start = s.date()
  const end = e?.date()
  if (e && end && e.isCertain('weekday') && !e.isCertain('day')) {
    // chrono loses the weekday of the end when the start has a time
    const name = result.text.toLowerCase().match(weekdayAtEnd)?.[1] ?? ''
    const weekday = codeOrder.indexOf(weekdayCodes[name] ?? '')
    const ahead = ((weekday < 0 ? (e.get('weekday') ?? 0) : weekday) - start.getDay() + 7) % 7
    end.setFullYear(start.getFullYear(), start.getMonth(), start.getDate() + ahead)
  } else if (s.isCertain('month') && s.isCertain('day') && !s.isCertain('year')) {
    const first: MonthDay = [start.getMonth() + 1, start.getDate()]
    const last: MonthDay = end ? [end.getMonth() + 1, end.getDate()] : first
    const [startYear, endYear] = pickYears(first, last, rule)
    start.setFullYear(startYear)
    end?.setFullYear(endYear)
  }
  if (rule.past && s.isCertain('weekday') && !s.isCertain('day')) {
    while (start > rule.now) {
      start.setDate(start.getDate() - 7)
      end?.setDate(end.getDate() - 7)
    }
  }
  return { start, end }
}

/**
 * Finds the token that ends at the cursor, for completion: `@person`,
 * `#calendar`, or up to four words after `bei`/`in`/`im`/`at` that do not read
 * as a date or time (`in zwei Wochen`, `at 3pm`, `bei Simon morgen`).
 */
export function activeToken(text: string, cursor = text.length): ActiveToken | undefined {
  const before = text.slice(0, cursor)
  const match = before.match(new RegExp(`(^|\\s)([@#])([${L}\\p{N}._-]*)$`, 'u'))
  if (match) {
    const query = match[3] ?? ''
    return {
      kind: match[2] === '@' ? 'person' : 'calendar',
      query,
      from: cursor - query.length - 1,
      to: cursor,
    }
  }
  const place = before.match(
    new RegExp(`(?:^|\\s)(in|im|bei|at)\\s+(${L}[^\\s@#]*(?:\\s+[^\\s@#]+){0,3})$`, 'iu'),
  )
  const query = place?.[2]
  if (!query || /\d/.test(query) || readsAsDate(`${place[1]} ${query}`)) return undefined
  return { kind: 'place', query, from: cursor - query.length, to: cursor }
}

/** True when chrono finds a date or time anywhere in `text`. */
function readsAsDate(text: string): boolean {
  if (
    text
      .toLowerCase()
      .split(/\s+/)
      .some((w) => w in weekdayCodes || months.has(w))
  )
    return true
  const sample = `${text} `
  return chrono.de.parse(sample).length > 0 || chrono.en.parse(sample).length > 0
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function parseQuickAdd(input: string, options: QuickAddOptions = {}): QuickAdd {
  const now = options.now ?? new Date()
  const defaultDuration = options.defaultDuration ?? 60
  let text = ` ${input} `

  // people and calendar
  const people: string[] = []
  for (const m of [...text.matchAll(new RegExp(`(?<=\\s)@([${L}\\p{N}._-]+)`, 'gu'))]) {
    if (m[1]) people.push(m[1])
  }
  text = text.replace(new RegExp(`(?<=\\s)@[${L}\\p{N}._-]*`, 'gu'), ' ')
  const calendarMatch = text.match(new RegExp(`(?<=\\s)#([${L}\\p{N}._-]+)`, 'u'))
  const calendar = calendarMatch?.[1]
  text = text.replace(new RegExp(`(?<=\\s)#[${L}\\p{N}._-]*`, 'gu'), ' ')

  // a place picked from completion, matched whole before dates are looked
  // for, so "Café am Neuen See" or "Montagsbar" stay intact
  let location: string | undefined
  const known = [...(options.places ?? [])].sort((a, b) => b.length - a.length)
  const knownMatch = known.length
    ? text.match(
        new RegExp(`\\s(in|im|bei|at)\\s+(${known.map(escapeRegExp).join('|')})(?=\\s)`, 'iu'),
      )
    : null
  // "bei Simon" names a host and stays in the title, hidden from chrono meanwhile
  let host: string | undefined
  if (knownMatch?.[2]) {
    location = known.find((name) => name.toLowerCase() === knownMatch[2]?.toLowerCase())
    text = cut(text, knownMatch)
    if (knownMatch[1]?.toLowerCase() === 'bei') {
      host = knownMatch[0].trim()
      text = `${text.slice(0, knownMatch.index)} ${HOST} ${text.slice(knownMatch.index)}`
    }
  }

  // video keyword
  const videoPattern = /\s(video|call|jitsi|videocall|videokonferenz)(?=\s)/i
  const video = videoPattern.test(text)
  text = text.replace(new RegExp(videoPattern.source, 'gi'), ' ')

  // recurrence: jeden Montag / every monday / wöchentlich / alle 2 Wochen / every 2 weeks
  let rrule: string | undefined
  const everyDay = text.match(
    new RegExp(`\\s(?:jeden|jede|every)\\s+(${Object.keys(weekdayCodes).join('|')})(?=\\s)`, 'iu'),
  )
  const everyN = text.match(
    new RegExp(
      `\\s(?:alle|every)\\s+(\\d+)\\s+(${Object.keys(frequencies).join('|')})(?=\\s)`,
      'iu',
    ),
  )
  const everyUnit = text.match(
    new RegExp(
      `\\s(?:jeden|jede|jedes|every)\\s+(tag|woche|monat|jahr|day|week|month|year)(?=\\s)`,
      'iu',
    ),
  )
  const adverb = text.match(
    /\s(täglich|wöchentlich|monatlich|jährlich|daily|weekly|monthly|yearly)(?=\s)/iu,
  )
  if (everyDay?.[1]) {
    const day = weekdayCodes[everyDay[1].toLowerCase()]
    rrule = `FREQ=WEEKLY;BYDAY=${day}`
    // keep the weekday so the date parser picks the first occurrence
    text = cut(text, { index: everyDay.index, 0: everyDay[0] }) + ` ${everyDay[1]} `
  } else if (everyN?.[1] && everyN[2]) {
    rrule = `FREQ=${frequencies[everyN[2].toLowerCase()]};INTERVAL=${everyN[1]}`
    text = cut(text, everyN)
  } else if (everyUnit?.[1]) {
    rrule = `FREQ=${frequencies[everyUnit[1].toLowerCase()]}`
    text = cut(text, everyUnit)
  } else if (adverb?.[1]) {
    rrule = `FREQ=${frequencies[adverb[1].toLowerCase()]}`
    text = cut(text, adverb)
  }

  const rule: YearRule = {
    now,
    past: pastMarker.test(text),
    limit: backdateLimit(now, options.backdate ?? 'month'),
  }
  text = text.replace(pastMarker, '')
  if (!rrule) text = completeDateRanges(text, rule)
  text = completeDottedDates(text, rule)

  // until: only with a recurrence; "bis 16 Uhr" stays an end time
  let until: Date | undefined
  if (rrule) {
    const untilMatch = text.match(
      /\s(?:bis|until)\s+(\d{1,2}\.\d{1,2}\.\d{2,4}|\d{4}-\d{2}-\d{2})(?=\s)/i,
    )
    if (untilMatch?.[1]) {
      const parsed =
        chrono.de.parseDate(untilMatch[1], now) ?? chrono.en.parseDate(untilMatch[1], now)
      if (parsed) until = parsed
      text = cut(text, untilMatch)
    }
  }

  // duration: 1h, 90min, 1,5 Stunden, eine Stunde, halbe Stunde, an hour, half an hour
  let duration: number | undefined
  const durationPattern = new RegExp(
    `\\s(?:(\\d+(?:[.,]\\d+)?)\\s*|(${Object.keys(numberWords).join('|')})\\s+(?:an\\s+)?)` +
      '(h|std\\.?|stunden?|hours?|hrs?|min\\.?|minuten?|minutes?|mins?)(?=\\s)',
    'iu',
  )
  const durationMatch = text.match(durationPattern)
  if (durationMatch) {
    const amount = durationMatch[1]
      ? Number(durationMatch[1].replace(',', '.'))
      : (numberWords[(durationMatch[2] ?? '').toLowerCase()] ?? 1)
    const unit = (durationMatch[3] ?? '').toLowerCase()
    duration = unit.startsWith('m') ? amount : amount * 60
    text = cut(text, durationMatch)
  }

  // date and time: whichever language recognises more of the line; chrono.de
  // drops "morgen" after a run of spaces, which the cuts above leave behind
  text = ` ${text.replace(/\s+/g, ' ').trim()} `
  const de = chrono.de.parse(text, now, { forwardDate: true })
  const en = chrono.en.parse(text, now, { forwardDate: true })
  const covered = (results: chrono.ParsedResult[]) => results.reduce((n, r) => n + r.text.length, 0)
  const results = covered(en) > covered(de) ? en : de

  let start: Date | undefined
  let end: Date | undefined
  let hasTime = false
  let hasDate = false
  let endOpen = false
  const used: chrono.ParsedResult[] = []
  for (const result of results) {
    const s = result.start
    const timed = s.isCertain('hour')
    const dated = s.isCertain('day') || s.isCertain('weekday') || s.isCertain('month')
    if (!start) {
      ;({ start, end } = settleDates(result, rule))
      hasTime = timed
      hasDate = dated
      if (end && result.end) {
        endOpen = !result.end.isCertain('hour')
        if (timed && endOpen) end.setHours(start.getHours(), start.getMinutes(), 0, 0)
      }
    } else if (timed && endOpen) {
      // "Montag 9 Uhr bis Freitag 17 Uhr": chrono leaves the end time on its own
      end?.setHours(s.get('hour') ?? 0, s.get('minute') ?? 0, 0, 0)
      endOpen = false
    } else if (timed && !hasTime) {
      start = new Date(start)
      start.setHours(s.get('hour') ?? 0, s.get('minute') ?? 0, 0, 0)
      hasTime = true
      if (result.end) {
        end = new Date(start)
        end.setHours(result.end.get('hour') ?? 0, result.end.get('minute') ?? 0, 0, 0)
      }
    } else if (dated && !hasDate) {
      const d = s.date()
      start = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        start.getHours(),
        start.getMinutes(),
      )
      hasDate = true
    } else {
      continue
    }
    used.push(result)
  }

  // cut from the back so earlier indices stay valid
  for (const result of used.sort((a, b) => b.index - a.index)) {
    text = cut(text, { index: result.index, 0: result.text })
  }

  // place, after dates are cut so "bei Friedi Sonntag" keeps the Sunday:
  // "in Büro", "im Café Kranzler", "at Office" (capitalized words) only set the
  // location; "bei Friedi" names a host, so it stays in the title as well
  const locationMatch = location
    ? null
    : text.match(/\s(in|im|bei|at)\s+([A-ZÄÖÜ][\p{L}\d.'-]*(?:\s+[A-ZÄÖÜ][\p{L}\d.'-]*)*)(?=\s)/u)
  if (locationMatch?.[2] && !(locationMatch[2].toLowerCase() in weekdayCodes)) {
    location = locationMatch[2]
    if (locationMatch[1] !== 'bei') text = cut(text, locationMatch)
  }

  // already past: a bare time means tomorrow, a bare weekday next week
  if (start && hasTime && !rule.past && start.getTime() < now.getTime()) {
    const weekdayOnly =
      hasDate && used.some((r) => r.start.isCertain('weekday') && !r.start.isCertain('day'))
    const shift = !hasDate ? DAY : weekdayOnly ? 7 * DAY : 0
    start = new Date(start.getTime() + shift)
    if (end) end = new Date(end.getTime() + shift)
  }

  const given = { date: hasDate, time: hasTime, end: Boolean(end) }
  let allDay = false
  if (!start) {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    allDay = true
  } else if (!hasTime) {
    start = new Date(start.getFullYear(), start.getMonth(), start.getDate())
    allDay = true
  }

  if (allDay) {
    const days = duration && duration >= 24 * 60 ? Math.round(duration / (24 * 60)) : 1
    end =
      end && end >= start
        ? new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1)
        : new Date(start.getFullYear(), start.getMonth(), start.getDate() + days)
  } else if (!end || end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + (duration ?? defaultDuration) * MINUTE)
  }

  if (rrule) {
    if (rrule.startsWith('FREQ=WEEKLY') && !rrule.includes('BYDAY')) {
      rrule += `;BYDAY=${codeOrder[start.getDay()]}`
    }
    if (until) rrule += `;UNTIL=${untilValue(until)}`
  }

  // title: what is left, minus filler words at the edges
  const filler =
    /^(?:um|am|an|ab|von|vom|at|on|from|for|für|mit|with|und|and|,|-|–)\s+|\s+(?:um|am|an|ab|von|vom|at|on|from|for|für|mit|with|und|and|,|-|–)$/iu
  let title = text.replace(/\s+/g, ' ').trim()
  for (let previous = ''; previous !== title; ) {
    previous = title
    title = title.replace(filler, '').trim()
  }
  if (host) title = title.replace(HOST, host).replace(/\s+/g, ' ').trim()

  const explicit =
    used.length > 0 || people.length > 0 || calendar !== undefined || rrule !== undefined
  return {
    title,
    start,
    end,
    allDay,
    people,
    calendar,
    location,
    rrule,
    video,
    explicit,
    given,
    duration,
  }
}
