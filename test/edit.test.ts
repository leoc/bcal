import { describe, expect, it } from 'vitest'
import { buildDraft } from '../src/renderer/src/lib/draft'
import { editPreview, isLocked, mergeEdit, movedInput } from '../src/renderer/src/lib/edit'
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
  emails: [],
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

/** The edit line `line` applied to `original`. */
function edit(original: CalendarEvent, line: string, chosen = {}, places = {}) {
  const draft = buildDraft(line, {
    calendars,
    config,
    chosen,
    places,
    calendarId: original.calendarId,
    videoCode: 'abc',
    now,
  })
  return {
    input: mergeEdit(draft, original, config),
    preview: editPreview(draft, original, config),
  }
}

describe('mergeEdit', () => {
  it('keeps everything the line does not name', () => {
    expect(edit(event(), 'Kaffee und Kuchen').input).toEqual({
      calendarId: 'acc/family',
      title: 'Kaffee und Kuchen',
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

  it('moves the time, the day, or both, keeping the length', () => {
    expect(edit(event(), '16 Uhr').input).toMatchObject({
      title: 'Kaffee',
      start: '2026-10-29T16:00:00',
      end: '2026-10-29T17:30:00',
    })
    expect(edit(event(), '3.11.').input).toMatchObject({
      start: '2026-11-03T14:00:00',
      end: '2026-11-03T15:30:00',
      allDay: false,
    })
    expect(edit(event(), 'freitag 9 Uhr').input).toMatchObject({
      start: '2026-10-30T09:00:00',
      end: '2026-10-30T10:30:00',
    })
  })

  it('changes the length by duration or end time', () => {
    expect(edit(event(), '2h').input).toMatchObject({
      start: '2026-10-29T14:00:00',
      end: '2026-10-29T16:00:00',
    })
    expect(edit(event(), '10-11:15').input).toMatchObject({
      start: '2026-10-29T10:00:00',
      end: '2026-10-29T11:15:00',
    })
  })

  it('keeps all-day events all-day unless a time is given', () => {
    const trip = event({ allDay: true, start: '2026-12-03', end: '2026-12-06', attendees: [] })
    expect(edit(trip, '10.12.').input).toMatchObject({
      start: '2026-12-10',
      end: '2026-12-13',
      allDay: true,
    })
    expect(edit(trip, '15 Uhr').input).toMatchObject({
      start: '2026-12-03T15:00:00',
      end: '2026-12-03T16:00:00',
      allDay: false,
    })
  })

  it('replaces place, people and calendar when named', () => {
    const tim = { name: 'Tim', email: 'tim@example.org' }
    const { input } = edit(event({ calendarId: 'acc/personal' }), 'in Büro @Tim #family', {
      tim,
    })
    expect(input).toMatchObject({
      title: 'Kaffee',
      location: 'Büro',
      geo: undefined,
      calendarId: 'acc/family',
      attendees: [tim],
    })
  })

  it('takes a new recurrence, else leaves it to the writer', () => {
    expect(edit(event(), 'jeden Donnerstag').input?.rrule).toBe('FREQ=WEEKLY;BYDAY=TH')
    expect(edit(event({ rrule: 'FREQ=DAILY' }), '16 Uhr').input?.rrule).toBeUndefined()
  })

  it('adds a meeting room, but keeps an existing link', () => {
    expect(edit(event({ location: undefined, geo: undefined }), 'video').input).toMatchObject({
      title: 'Kaffee',
      location: 'https://meet.example.org/abc',
      description: 'Bitte pünktlich\n\nVideo: https://meet.example.org/abc',
    })
    const call = event({
      location: 'https://meet.example.org/x',
      geo: undefined,
      links: ['https://meet.example.org/x'],
    })
    expect(edit(call, 'video 16 Uhr').input).toMatchObject({
      location: 'https://meet.example.org/x',
      description: 'Bitte pünktlich',
    })
  })
})

describe('editPreview', () => {
  it('shows the merged event with the old answers and the series', () => {
    const { preview } = edit(event({ rrule: 'FREQ=WEEKLY;BYDAY=TH' }), '16 Uhr')
    expect(preview).toMatchObject({
      id: 'bcal-draft',
      uid: 'k@bcal',
      title: 'Kaffee',
      start: new Date(2026, 9, 29, 16).toISOString(),
      rrule: 'FREQ=WEEKLY;BYDAY=TH',
      attendees: [
        { name: 'Arthur', email: 'arthur@example.org', status: 'ACCEPTED' },
        { name: 'Simon Müller', email: 'simon@example.org', status: 'ACCEPTED' },
      ],
    })
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
