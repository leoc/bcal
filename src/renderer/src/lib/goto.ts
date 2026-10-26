import * as chrono from 'chrono-node'

const weekdays = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa']
const months = [
  'januar',
  'februar',
  'märz',
  'april',
  'mai',
  'juni',
  'juli',
  'august',
  'september',
  'oktober',
  'november',
  'dezember',
]

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/** Monday of ISO week `week` in `year`. */
function isoWeek(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4)
  const monday = addDays(jan4, -((jan4.getDay() + 6) % 7))
  return addDays(monday, (week - 1) * 7)
}

/**
 * Parses what the goto dialog accepts: `+3`, `-2w`, `+1m`, `12.11.`, `kw 45`,
 * `mo`..`so`, month names, and everything chrono's German parser knows
 * (`morgen`, `nächsten freitag`, `in 3 tagen`, `3. dezember`, ...).
 */
export function parseGoto(input: string, now = new Date()): Date | undefined {
  const text = input.trim().toLowerCase()
  if (!text) return undefined
  const today = startOfDay(now)

  const relative = text.match(/^([+-])\s*(\d+)\s*([dwm]?)$/)
  if (relative) {
    const n = Number(relative[2]) * (relative[1] === '-' ? -1 : 1)
    if (relative[3] === 'w') return addDays(today, n * 7)
    if (relative[3] === 'm')
      return new Date(today.getFullYear(), today.getMonth() + n, today.getDate())
    return addDays(today, n)
  }

  const dotted = text.match(/^(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?$/)
  if (dotted) {
    const year = dotted[3] ? Number(dotted[3].padStart(4, '20')) : today.getFullYear()
    const date = new Date(year, Number(dotted[2]) - 1, Number(dotted[1]))
    return date.getMonth() === Number(dotted[2]) - 1 ? date : undefined
  }

  const week = text.match(/^kw\s*(\d{1,2})(?:\s+(\d{4}))?$/)
  if (week) return isoWeek(Number(week[2] ?? today.getFullYear()), Number(week[1]))

  const weekday = weekdays.indexOf(text.slice(0, 2))
  if (weekday !== -1 && text.length === 2) {
    return addDays(today, (weekday - today.getDay() + 7) % 7)
  }

  const month = months.findIndex((m) => m.startsWith(text) && text.length >= 3)
  if (month !== -1) {
    const date = new Date(today.getFullYear(), month, 1)
    return date < new Date(today.getFullYear(), today.getMonth(), 1)
      ? new Date(today.getFullYear() + 1, month, 1)
      : date
  }

  const parsed = chrono.de.parseDate(input, now, { forwardDate: true })
  return parsed ? startOfDay(parsed) : undefined
}
