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
  /** `video`, `call` or `jitsi` was given */
  video: boolean
}

export interface QuickAddOptions {
  now?: Date
  /** minutes, used when neither duration nor end is given */
  defaultDuration?: number
}

/** The `@`/`#` token the cursor is in, for completion. */
export interface ActiveToken {
  kind: 'person' | 'calendar'
  query: string
  from: number
  to: number
}

const MINUTE = 60_000
const DAY = 86_400_000

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

/** `12.11.` → `12.11.2026` (next occurrence), which chrono understands. */
function completeDottedDates(text: string, now: Date): string {
  return text.replace(/(^|\s)(\d{1,2})\.(\d{1,2})\.(?!\d)/g, (_m, lead, d, m) => {
    let year = now.getFullYear()
    const candidate = new Date(year, Number(m) - 1, Number(d))
    if (
      candidate.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    ) {
      year += 1
    }
    return `${lead}${d}.${m}.${year}`
  })
}

/** Finds the `@`/`#` token that ends at the cursor, for completion. */
export function activeToken(text: string, cursor = text.length): ActiveToken | undefined {
  const before = text.slice(0, cursor)
  const match = before.match(new RegExp(`(^|\\s)([@#])([${L}\\p{N}._-]*)$`, 'u'))
  if (!match) return undefined
  const query = match[3] ?? ''
  return {
    kind: match[2] === '@' ? 'person' : 'calendar',
    query,
    from: cursor - query.length - 1,
    to: cursor,
  }
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

  text = completeDottedDates(text, now)

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

  // location: "in Büro", "im Café Kranzler", "bei Simon", "at Office" (capitalized words)
  let location: string | undefined
  const locationMatch = text.match(
    /\s(?:in|im|bei|at)\s+((?:[A-ZÄÖÜ][\p{L}\d.'-]*)(?:\s+[A-ZÄÖÜ\d][\p{L}\d.'-]*)*)(?=\s)/u,
  )
  if (locationMatch?.[1] && !/^\d/.test(locationMatch[1])) {
    const candidate = locationMatch[1]
    // "Freitag", "Montag" etc. are dates, not places
    if (!(candidate.toLowerCase() in weekdayCodes)) {
      location = candidate
      text = cut(text, locationMatch)
    }
  }

  // date and time: whichever language recognises more of the line
  const de = chrono.de.parse(text, now, { forwardDate: true })
  const en = chrono.en.parse(text, now, { forwardDate: true })
  const covered = (results: chrono.ParsedResult[]) => results.reduce((n, r) => n + r.text.length, 0)
  const results = covered(en) > covered(de) ? en : de

  let start: Date | undefined
  let end: Date | undefined
  let hasTime = false
  let hasDate = false
  const used: chrono.ParsedResult[] = []
  for (const result of results) {
    const s = result.start
    const timed = s.isCertain('hour')
    const dated = s.isCertain('day') || s.isCertain('weekday') || s.isCertain('month')
    if (!start) {
      start = s.date()
      hasTime = timed
      hasDate = dated
      if (result.end) end = result.end.date()
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

  // already past: a bare time means tomorrow, a bare weekday next week
  if (start && hasTime && start.getTime() < now.getTime()) {
    const weekdayOnly =
      hasDate && used.some((r) => r.start.isCertain('weekday') && !r.start.isCertain('day'))
    const shift = !hasDate ? DAY : weekdayOnly ? 7 * DAY : 0
    start = new Date(start.getTime() + shift)
    if (end) end = new Date(end.getTime() + shift)
  }

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
    end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + days)
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
    /^(?:um|am|an|ab|von|at|on|from|for|für|mit|with|und|and|,|-|–)\s+|\s+(?:um|am|an|ab|von|at|on|from|for|für|mit|with|und|and|,|-|–)$/iu
  let title = text.replace(/\s+/g, ' ').trim()
  for (let previous = ''; previous !== title; ) {
    previous = title
    title = title.replace(filler, '').trim()
  }

  return { title, start, end, allDay, people, calendar, location, rrule, video }
}
