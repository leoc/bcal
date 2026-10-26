import { describe, expect, it } from 'vitest'
import { buildDraft, draftAsEvent, handleFor, toNewEvent } from '../src/renderer/src/lib/draft'
import type { CalendarInfo, Config } from '../src/shared/types'

const cal = (id: string, name: string): CalendarInfo => ({
  id,
  account: 'acc',
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
}
const now = new Date(2026, 9, 26, 12)
const simon = { name: 'Simon Müller', email: 'simon@example.org' }
const draft = (line: string, chosen = {}) =>
  buildDraft(line, { calendars, config, chosen, videoCode: 'abc123', now })

describe('draft', () => {
  it('uses the default calendar unless # picks another', () => {
    expect(draft('morgen Kaffee').calendar?.name).toBe('Personal')
    expect(draft('morgen Kaffee #family').calendar?.name).toBe('family')
  })

  it('resolves chosen people and turns the line into a NewEvent', () => {
    const d = draft('nächsten Freitag 14 Uhr eine Stunde @SimonMüller @Unbekannt video', {
      simonmüller: simon,
    })
    expect(handleFor(simon)).toBe('SimonMüller')
    expect(toNewEvent(d, config)).toEqual({
      calendarId: 'acc/personal',
      title: 'Simon Müller, Unbekannt',
      start: '2026-11-06T14:00:00',
      end: '2026-11-06T15:00:00',
      allDay: false,
      location: 'https://meet.example.org/abc123',
      description: 'Video: https://meet.example.org/abc123',
      rrule: undefined,
      attendees: [simon, { name: 'Unbekannt' }],
      alarm: 15,
    })
    expect(draftAsEvent(d, config)).toMatchObject({
      id: 'bcal-draft',
      organizer: config.organizer,
      links: ['https://meet.example.org/abc123'],
    })
  })

  it('keeps dates for all-day drafts', () => {
    expect(toNewEvent(draft('3. Dezember Geburtstag'), config)).toMatchObject({
      start: '2026-12-03',
      end: '2026-12-04',
      allDay: true,
    })
  })
})
