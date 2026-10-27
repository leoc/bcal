import { describe, expect, it } from 'vitest'
import {
  buildDraft,
  draftAsEvent,
  handleFor,
  placeAddress,
  toNewEvent,
} from '../src/renderer/src/lib/draft'
import type { CalendarInfo, Config, Place } from '../src/shared/types'

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
  video: 'https://meet.example.org',
  places: [],
  near: { lat: 52.52, lon: 13.405 },
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

  it('adds a meeting room only with a video URL in the config', () => {
    expect(draft('morgen Call video').video).toBe('https://meet.example.org/abc123')
    const plain = buildDraft('morgen Call video', {
      calendars,
      config: { ...config, video: undefined },
      chosen: {},
      videoCode: 'abc123',
      now,
    })
    expect(plain.video).toBeUndefined()
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

describe('places in drafts', () => {
  const kranzler: Place = {
    name: 'Café am Neuen See',
    label: 'Café am Neuen See, Lichtensteinallee 2, 10787 Berlin',
    geo: { lat: 52.5102, lon: 13.3494 },
    source: 'map',
  }
  const withPlace = (line: string) =>
    buildDraft(line, {
      calendars,
      config,
      chosen: {},
      places: { 'café am neuen see': kranzler },
      videoCode: 'abc123',
      now,
    })

  it('writes the full label and GEO of a picked place', () => {
    const d = withPlace('morgen 15 Uhr Kaffee im Café am Neuen See video')
    expect(toNewEvent(d, config)).toMatchObject({
      title: 'Kaffee',
      location: kranzler.label,
      geo: kranzler.geo,
      description: 'Video: https://meet.example.org/abc123',
    })
    expect(draftAsEvent(d, config)?.geo).toEqual(kranzler.geo)
  })

  it('keeps free text when the place was not picked', () => {
    expect(toNewEvent(withPlace('morgen Kaffee im Café Kranzler'), config)).toMatchObject({
      location: 'Café Kranzler',
      geo: undefined,
    })
  })

  it('geocodes contacts by their address only', () => {
    expect(
      placeAddress({
        name: 'Simon Müller',
        label: 'Simon Müller, Alberichstr. 98, 12623 Berlin',
        source: 'contacts',
      }),
    ).toBe('Alberichstr. 98, 12623 Berlin')
    expect(placeAddress(kranzler)).toBe(kranzler.label)
  })
})
