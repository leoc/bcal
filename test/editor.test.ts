import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deleteEvent, editEvent, LockedError } from '../src/main/editor'
import { Vdir } from '../src/main/vdir'
import type { EventInput } from '../src/shared/types'

const fixture = join(__dirname, 'fixtures/vdir/acc/work/standup.ics')
const me = { name: 'Arthur', email: 'arthur@example.org' }
const now = new Date('2026-10-27T12:00:00Z')
// Mon 2026-10-26 .. Mon 2026-11-02 (CET)
const week = { start: '2026-10-25T23:00:00.000Z', end: '2026-11-01T23:00:00.000Z' }
const ref = (recurrenceId?: string) => ({
  calendarId: 'acc/work',
  uid: 'standup@bcal',
  recurrenceId,
})

const standup = (changes: Partial<EventInput> = {}): EventInput => ({
  calendarId: 'acc/work',
  title: 'Standup',
  start: '2026-10-29T09:30:00',
  end: '2026-10-29T09:45:00',
  allDay: false,
  location: 'https://meet.jit.si/bcal-standup',
  description: 'Agenda: https://example.org/agenda.',
  attendees: [{ name: 'Sam', email: 'sam@example.org' }, { email: 'richard@example.org' }],
  ...changes,
})

/** Loads the given files as one calendar and lists the week's events (local time). */
async function week_(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'bcal-'))
  await mkdir(join(root, 'acc/work'), { recursive: true })
  for (const [name, ics] of Object.entries(files))
    await writeFile(join(root, 'acc/work', name), ics)
  const vdir = new Vdir(root)
  await vdir.load()
  return vdir
    .events(week)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((e) => {
      const d = new Date(e.start)
      const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
      return `${d.getDate()}. ${hm} ${e.title}`
    })
}

describe('editEvent on a series', () => {
  it('changes only this occurrence through an override', async () => {
    const ics = await readFile(fixture, 'utf8')
    const result = editEvent(
      ics,
      ref('2026-10-29T09:30:00'),
      standup({
        title: 'Standup mit Kunde',
        start: '2026-10-29T14:00:00',
        end: '2026-10-29T14:30:00',
      }),
      'this',
      { organizer: me, now },
    )
    expect(result.ics).toContain('RECURRENCE-ID;TZID=Europe/Berlin:20261029T093000')
    expect(await week_({ 's.ics': result.ics ?? '' })).toEqual([
      '26. 9:30 Standup',
      '28. 11:00 Standup (verschoben)',
      '29. 14:00 Standup mit Kunde',
      '30. 9:30 Standup',
    ])
  })

  it('moves all occurrences by as much as this one moved, keeping EXDATE and overrides', async () => {
    const ics = await readFile(fixture, 'utf8')
    const result = editEvent(
      ics,
      ref('2026-10-29T09:30:00'),
      standup({ title: 'Daily', start: '2026-10-29T10:30:00', end: '2026-10-29T10:45:00' }),
      'all',
      { organizer: me, now },
    )
    expect(await week_({ 's.ics': result.ics ?? '' })).toEqual([
      '26. 10:30 Daily',
      // 27. stays excluded, the override on the 28th keeps its own time
      '28. 11:00 Standup (verschoben)',
      '29. 10:30 Daily',
      '30. 10:30 Daily',
    ])
    expect(result.ics).toContain('DTSTART;TZID=Europe/Berlin:20261019T103000')
    expect(result.ics).toContain('SEQUENCE:1')
  })

  it('splits the series for this and the following occurrences', async () => {
    const ics = await readFile(fixture, 'utf8')
    const result = editEvent(
      ics,
      ref('2026-10-28T09:30:00'),
      standup({ title: 'Daily', start: '2026-10-28T09:00:00', end: '2026-10-28T09:15:00' }),
      'following',
      { organizer: me, now, newUid: 'daily@bcal' },
    )
    expect(result.uid).toBe('daily@bcal')
    expect(result.ics).toContain('UNTIL=20261028T082959Z')
    expect(result.split?.ics).toContain('UID:daily@bcal')
    expect(await week_({ 's.ics': result.ics ?? '', 'd.ics': result.split?.ics ?? '' })).toEqual([
      '26. 9:30 Standup',
      '28. 9:00 Daily',
      '29. 9:00 Daily',
      '30. 9:00 Daily',
    ])
  })
})

describe('editEvent on a single event', () => {
  const single = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//other//EN',
    'BEGIN:VEVENT',
    'UID:single@bcal',
    'DTSTAMP:20261001T000000Z',
    'DTSTART:20261029T130000Z',
    'DTEND:20261029T140000Z',
    'SUMMARY:Kaffee',
    'X-OTHER-CLIENT:keep me',
    'ORGANIZER:mailto:arthur@example.org',
    'ATTENDEE;PARTSTAT=ACCEPTED;CN=Sam:mailto:sam@example.org',
    'ATTENDEE;PARTSTAT=DECLINED:mailto:richard@example.org',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:-PT15M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
  const singleRef = { calendarId: 'acc/work', uid: 'single@bcal' }
  const kaffee = (changes: Partial<EventInput> = {}): EventInput => ({
    calendarId: 'acc/work',
    title: 'Kaffee',
    start: '2026-10-29T14:00:00',
    end: '2026-10-29T15:00:00',
    allDay: false,
    attendees: [{ name: 'Sam', email: 'sam@example.org' }, { email: 'richard@example.org' }],
    ...changes,
  })

  it('keeps unknown properties, alarms and times that did not change', () => {
    const { ics } = editEvent(single, singleRef, kaffee({ title: 'Kaffee mit Sam' }), 'all', {
      organizer: me,
      now,
    })
    expect(ics).toContain('SUMMARY:Kaffee mit Sam')
    expect(ics).toContain('X-OTHER-CLIENT:keep me')
    expect(ics).toContain('TRIGGER:-PT15M')
    expect(ics).toContain('DTSTART:20261029T130000Z')
    expect(ics).toContain('SEQUENCE:1')
  })

  it('rewrites changed times in Berlin time, with the zone', () => {
    const { ics } = editEvent(
      single,
      singleRef,
      kaffee({ start: '2026-10-30T16:00:00', end: '2026-10-30T17:00:00' }),
      'all',
      { organizer: me, now },
    )
    expect(ics).toContain('DTSTART;TZID=Europe/Berlin:20261030T160000')
    expect(ics).toContain('BEGIN:VTIMEZONE')
  })

  it('keeps PARTSTAT of remaining attendees, drops and adds others', () => {
    const { ics } = editEvent(
      single,
      singleRef,
      kaffee({
        attendees: [
          { name: 'Sam', email: 'SAM@example.org' },
          { name: 'Lea', email: 'lea@example.org' },
        ],
      }),
      'all',
      { organizer: me, now },
    )
    const unfolded = ics?.replace(/\r\n /g, '')
    expect(unfolded).toContain('ATTENDEE;PARTSTAT=ACCEPTED;CN=Sam:mailto:sam@example.org')
    expect(unfolded).not.toContain('richard@example.org')
    expect(unfolded).toContain('CN=Lea')
  })

  it('refuses events organized by someone else', () => {
    expect(() =>
      editEvent(single, singleRef, kaffee({ title: 'x' }), 'all', {
        organizer: { email: 'someone@else.org' },
      }),
    ).toThrow(LockedError)
  })
})

describe('deleteEvent', () => {
  it('excludes one occurrence and drops its override', async () => {
    const ics = await readFile(fixture, 'utf8')
    const this_ = deleteEvent(ics, ref('2026-10-28T09:30:00'), 'this', { now })
    expect(await week_({ 's.ics': this_ ?? '' })).toEqual([
      '26. 9:30 Standup',
      '29. 9:30 Standup',
      '30. 9:30 Standup',
    ])
  })

  it('ends the series before an occurrence', async () => {
    const ics = await readFile(fixture, 'utf8')
    const following = deleteEvent(ics, ref('2026-10-29T09:30:00'), 'following', { now })
    expect(await week_({ 's.ics': following ?? '' })).toEqual([
      '26. 9:30 Standup',
      '28. 11:00 Standup (verschoben)',
    ])
  })

  it('leaves nothing for the whole series', async () => {
    const ics = await readFile(fixture, 'utf8')
    expect(deleteEvent(ics, ref('2026-10-29T09:30:00'), 'all')).toBeNull()
    expect(deleteEvent(ics, ref(), 'this')).toBeNull()
  })
})
