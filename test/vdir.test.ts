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
