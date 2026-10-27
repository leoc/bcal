import { describe, expect, it } from 'vitest'
import { buildDraft } from '../src/renderer/src/lib/draft'
import { editLine, isLocked, movedInput, toEditInput } from '../src/renderer/src/lib/edit'
import type { CalendarEvent, CalendarInfo, Config } from '../src/shared/types'

const cal = (id: string, name: string): CalendarInfo => ({
  id,
  account: id.split('/')[0] ?? '',
  name,
  eventCount: 0,
})
const calendars = [cal('acc/personal', 'Personal'), cal('acc/family', 'family')]
const config: Config = {
  startView: 'week',
  groups: [],
  hidden: [],
  keymap: {},
  defaultCalendar: 'Personal',
  defaultDuration: 60,
  defaultAlarm: 15,
  organizer: { name: 'Arthur', email: 'arthur@example.org' },
  video: 'https://meet.example.org',
  places: [],
  near: { lat: 52.52, lon: 13.405 },
}
const now = new Date(2026, 9, 27, 12)

const event = (changes: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'acc/family/k@bcal/2026-10-29T14:00:00',
  calendarId: 'acc/family',
  uid: 'k@bcal',
  title: 'Kaffee',
  start: new Date(2026, 9, 29, 14).toISOString(),
  end: new Date(2026, 9, 29, 15, 30).toISOString(),
  allDay: false,
  location: 'Café Kranzler, Kurfürstendamm 18, 10719 Berlin',
  geo: { lat: 52.5036, lon: 13.3297 },
  description: 'Bitte pünktlich',
  organizer: { name: 'Arthur', email: 'arthur@example.org' },
  attendees: [
    { name: 'Arthur', email: 'arthur@example.org', status: 'ACCEPTED' },
    { name: 'Simon Müller', email: 'simon@example.org', status: 'ACCEPTED' },
  ],
  links: [],
  ...changes,
})

/** Line from the event, edited by `change`, back to an EventInput. */
function roundTrip(original: CalendarEvent, change: (line: string) => string = (l) => l) {
  const { line, chosen, places } = editLine(original, config)
  const draft = buildDraft(change(line), {
    calendars,
    config,
    chosen,
    places,
    calendarId: original.calendarId,
    videoCode: 'abc',
    now,
  })
  return { line, input: toEditInput(draft, original, config) }
}

describe('editLine', () => {
  it('writes date, time, duration, title, place and people', () => {
    expect(editLine(event(), config).line).toBe(
      '29.10.2026 14:00 90min Kaffee in Café Kranzler @SimonMüller',
    )
    expect(editLine(event({ title: 'Essen bei Café Kranzler' }), config).line).toBe(
      '29.10.2026 14:00 90min Essen bei Café Kranzler @SimonMüller',
    )
    expect(
      editLine(
        event({
          allDay: true,
          start: '2026-12-03',
          end: '2026-12-06',
          location: undefined,
          attendees: [],
        }),
        config,
      ).line,
    ).toBe('3.12.2026 72h Kaffee')
  })
})

describe('round trip', () => {
  it('gives the event back unchanged', () => {
    expect(roundTrip(event()).input).toEqual({
      calendarId: 'acc/family',
      title: 'Kaffee',
      start: '2026-10-29T14:00:00',
      end: '2026-10-29T15:30:00',
      allDay: false,
      location: 'Café Kranzler, Kurfürstendamm 18, 10719 Berlin',
      geo: { lat: 52.5036, lon: 13.3297 },
      description: 'Bitte pünktlich',
      rrule: undefined,
      attendees: [{ name: 'Simon Müller', email: 'simon@example.org' }],
    })
  })

  it('keeps hosts, past dates and multi-day events', () => {
    expect(roundTrip(event({ title: 'Essen bei Café Kranzler' })).input).toMatchObject({
      title: 'Essen bei Café Kranzler',
      location: 'Café Kranzler, Kurfürstendamm 18, 10719 Berlin',
    })
    const past = event({
      start: new Date(2025, 2, 3, 9).toISOString(),
      end: new Date(2025, 2, 3, 10).toISOString(),
    })
    expect(roundTrip(past).input).toMatchObject({ start: '2025-03-03T09:00:00' })
    const trip = event({ allDay: true, start: '2026-12-03', end: '2026-12-06', attendees: [] })
    expect(roundTrip(trip).input).toMatchObject({
      start: '2026-12-03',
      end: '2026-12-06',
      allDay: true,
    })
  })

  it('applies what the line changes and keeps a meeting link', () => {
    const call = event({
      location: 'https://meet.example.org/x',
      geo: undefined,
      links: ['https://meet.example.org/x'],
    })
    const { line, input } = roundTrip(call, (l) =>
      l.replace('14:00', '16:00').replace('Kaffee', 'Kaffee und Kuchen'),
    )
    expect(line).toBe('29.10.2026 14:00 90min Kaffee @SimonMüller')
    expect(input).toMatchObject({
      title: 'Kaffee und Kuchen',
      start: '2026-10-29T16:00:00',
      end: '2026-10-29T17:30:00',
      location: 'https://meet.example.org/x',
    })
    expect(roundTrip(event(), (l) => l.replace(' @SimonMüller', '')).input?.attendees).toEqual([])
    expect(roundTrip(event(), (l) => `${l} #family`).input?.calendarId).toBe('acc/family')
    expect(
      roundTrip(event({ calendarId: 'acc/personal' }), (l) => `${l} #family`).input?.calendarId,
    ).toBe('acc/family')
  })
})

describe('isLocked', () => {
  it('locks events organized by someone else', () => {
    expect(isLocked(event(), config)).toBe(false)
    expect(isLocked(event({ organizer: undefined }), config)).toBe(false)
    expect(isLocked(event({ organizer: { email: 'boss@example.org' } }), config)).toBe(true)
  })
})

describe('movedInput', () => {
  it('takes the new times and keeps the rest', () => {
    const moved = movedInput(event(), new Date(2026, 9, 30, 9), new Date(2026, 9, 30, 10), false)
    expect(moved).toMatchObject({
      start: '2026-10-30T09:00:00',
      end: '2026-10-30T10:00:00',
      location: 'Café Kranzler, Kurfürstendamm 18, 10719 Berlin',
      attendees: [
        { name: 'Arthur', email: 'arthur@example.org' },
        { name: 'Simon Müller', email: 'simon@example.org' },
      ],
    })
    expect(movedInput(event(), new Date(2026, 9, 30), null, true)).toMatchObject({
      start: '2026-10-30',
      end: '2026-10-31',
      allDay: true,
    })
  })
})
