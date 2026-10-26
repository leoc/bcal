import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { Vdir } from '../src/main/vdir'

const vdir = new Vdir(join(__dirname, 'fixtures/vdir'))
// Mon 2026-10-26 .. Mon 2026-11-02 (CET, after the DST switch on 10-25)
const week = { start: '2026-10-25T23:00:00.000Z', end: '2026-11-01T23:00:00.000Z' }

beforeAll(() => vdir.load())

describe('Vdir', () => {
  it('reads collections with displayname and color', () => {
    expect(vdir.calendars()).toEqual([
      { id: 'acc/family', account: 'acc', name: 'family', color: undefined, eventCount: 1 },
      { id: 'acc/work', account: 'acc', name: 'Work', color: '#FF0000', eventCount: 1 },
    ])
  })

  it('expands RRULE with EXDATE and RECURRENCE-ID override', () => {
    const standups = vdir
      .events(week)
      .filter((e) => e.calendarId === 'acc/work')
      .map((e) => [e.start, e.title])
    expect(standups).toEqual([
      ['2026-10-26T08:30:00.000Z', 'Standup'],
      // 10-27 is excluded
      ['2026-10-28T10:00:00.000Z', 'Standup (verschoben)'],
      ['2026-10-29T08:30:00.000Z', 'Standup'],
      ['2026-10-30T08:30:00.000Z', 'Standup'],
    ])
  })

  it('keeps all-day events as dates', () => {
    const [birthday] = vdir.events(week).filter((e) => e.calendarId === 'acc/family')
    expect(birthday).toMatchObject({ start: '2026-10-29', end: '2026-10-30', allDay: true })
  })
})

describe('event details', () => {
  it('carries organizer, attendees, links and the series rule', () => {
    const [first] = vdir.events(week).filter((e) => e.calendarId === 'acc/work')
    expect(first).toMatchObject({
      rrule: 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR',
      location: 'https://meet.jit.si/bcal-standup',
      organizer: { name: 'Arthur', email: 'arthur@example.org' },
      attendees: [
        { name: 'Sam', email: 'sam@example.org', status: 'ACCEPTED', role: 'REQ-PARTICIPANT' },
        { name: undefined, email: 'richard@example.org', status: 'DECLINED', role: undefined },
      ],
      links: ['https://meet.jit.si/bcal-standup', 'https://example.org/agenda'],
    })
  })
})

describe('search', () => {
  const now = new Date('2026-10-28T12:00:00Z')

  it('finds the next occurrence of a series and past single events', () => {
    expect(vdir.search('standup', 50, now).map((e) => e.start)).toEqual([
      '2026-10-29T08:30:00.000Z',
    ])
    expect(vdir.search('geburtstag', 50, new Date('2027-01-01')).map((e) => e.start)).toEqual([
      '2026-10-29',
    ])
  })

  it('matches every word in title, location or description', () => {
    expect(vdir.search('standup agenda', 50, now)).toHaveLength(1)
    expect(vdir.search('standup geburtstag', 50, now)).toHaveLength(0)
    expect(vdir.search('   ', 50, now)).toHaveLength(0)
  })
})
