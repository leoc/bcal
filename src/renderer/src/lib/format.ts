import type { CalendarEvent } from '@shared/types'

const day = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })
const dayYear = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const time = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

/** `YYYY-MM-DD` as local midnight, ISO date-times as is. */
export function toDate(value: string): Date {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value)
}

export function formatWhen(event: CalendarEvent): string {
  const start = toDate(event.start)
  const end = toDate(event.end)
  const d = (date: Date) =>
    (date.getFullYear() === new Date().getFullYear() ? day : dayYear).format(date)
  if (event.allDay) {
    const last = new Date(end.getTime() - 86_400_000)
    return last > start ? `${d(start)} – ${d(last)} · ganztägig` : `${d(start)} · ganztägig`
  }
  if (start.toDateString() === end.toDateString()) {
    return `${d(start)} · ${time.format(start)}–${time.format(end)}`
  }
  return `${d(start)} ${time.format(start)} – ${d(end)} ${time.format(end)}`
}

const frequencies: Record<string, [string, string]> = {
  DAILY: ['täglich', 'Tage'],
  WEEKLY: ['wöchentlich', 'Wochen'],
  MONTHLY: ['monatlich', 'Monate'],
  YEARLY: ['jährlich', 'Jahre'],
}
const weekdays: Record<string, string> = {
  MO: 'Mo',
  TU: 'Di',
  WE: 'Mi',
  TH: 'Do',
  FR: 'Fr',
  SA: 'Sa',
  SU: 'So',
}

/** Short German summary of an RRULE, e.g. `wöchentlich (Mo, Mi)`. */
export function formatRrule(rrule: string): string {
  const parts = Object.fromEntries(rrule.split(';').map((p) => p.split('=') as [string, string]))
  const [adverb, plural] = frequencies[parts.FREQ ?? ''] ?? ['wiederkehrend', '']
  const interval = Number(parts.INTERVAL ?? 1)
  let text = interval > 1 ? `alle ${interval} ${plural}` : adverb
  if (parts.BYDAY) {
    const days = parts.BYDAY.split(',').map((d) => weekdays[d.slice(-2)] ?? d)
    text += ` (${days.join(', ')})`
  }
  if (parts.UNTIL) {
    const u = parts.UNTIL
    text += ` bis ${u.slice(6, 8)}.${u.slice(4, 6)}.${u.slice(0, 4)}`
  } else if (parts.COUNT) {
    text += `, ${parts.COUNT}×`
  }
  return text
}
