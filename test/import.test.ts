import { cp, mkdtemp, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseImport, titleSimilarity, titleWords } from '../src/main/importer'
import { Vdir } from '../src/main/vdir'

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'bcal-'))
  await cp(join(__dirname, 'fixtures/vdir'), join(dir, 'vdir'), { recursive: true })
  const vdir = new Vdir(join(dir, 'vdir'), join(dir, 'trash'))
  await vdir.load()
  return { vdir, path: (p: string) => join(dir, 'vdir', p) }
}

const me = ['arthur@example.org']
const week = { start: '2026-11-01T23:00:00.000Z', end: '2026-11-08T23:00:00.000Z' }

/** An invitation as Outlook or Google send it. */
function invite({
  method = 'REQUEST',
  uid = 'abc-123@example.com',
  summary = 'Planning',
  start = '20261103T100000',
  sequence = 0,
  extra = '',
} = {}) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Example//Mail//EN',
    `METHOD:${method}`,
    'BEGIN:VTIMEZONE',
    'TZID:W. Europe Standard Time',
    'BEGIN:STANDARD',
    'DTSTART:16010101T030000',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10',
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    'DTSTART:16010101T020000',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3',
    'END:DAYLIGHT',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    'DTSTAMP:20261027T120000Z',
    `SEQUENCE:${sequence}`,
    `DTSTART;TZID=W. Europe Standard Time:${start}`,
    'DURATION:PT1H',
    `SUMMARY:${summary}`,
    'ORGANIZER;CN=Boss:mailto:boss@example.org',
    'ATTENDEE;CN=Arthur;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:arthur@example.org',
    'ATTENDEE;CN=Sam;PARTSTAT=ACCEPTED:mailto:sam@example.org',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:-PT15M',
    'END:VALARM',
    ...(extra ? [extra] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

describe('titles', () => {
  it('ignores what mail clients put around them', () => {
    expect(titleWords('Updated invitation: Planning Q4 @ Tue Nov 3, 2026 10am')).toEqual([
      'planning',
      'q4',
    ])
    expect(titleSimilarity('Einladung: Planung Q4', 'Planung Q4')).toBe(1)
    expect(titleSimilarity('Planung Q4', 'Planung Q1')).toBeCloseTo(1 / 3)
  })
})

describe('parseImport', () => {
  it('groups components by UID and keeps the method', () => {
    const parsed = parseImport(invite())
    expect(parsed.method).toBe('REQUEST')
    expect(parsed.events.map((e) => e.uid)).toEqual(['abc-123@example.com'])
    expect(parsed.timezones).toHaveLength(1)
  })

  it('refuses what is no calendar', () => {
    expect(() => parseImport('BEGIN:VCARD\r\nFN:x\r\nEND:VCARD')).toThrow()
  })
})

describe('Vdir import', () => {
  it('plans a new invitation and writes it without METHOD, with my answer', async () => {
    const { vdir, path } = await fixture()
    const plan = vdir.planImport(invite(), me)
    expect(plan.items).toMatchObject([
      { kind: 'new', invitation: true, partstat: 'NEEDS-ACTION', superseded: [] },
    ])
    expect(plan.items[0]?.event.start).toBe('2026-11-03T09:00:00.000Z')

    const created = await vdir.applyImport(
      invite(),
      [{ uid: 'abc-123@example.com', calendarId: 'acc/family', partstat: 'ACCEPTED', remove: [] }],
      me,
    )
    expect(created?.path).toBe(path('acc/family/abc-123@example.com.ics'))
    const ics = await readFile(created?.path ?? '', 'utf8')
    expect(ics).not.toContain('METHOD')
    expect(ics).toContain('TZID:W. Europe Standard Time')
    expect(ics).toContain('TRIGGER:-PT15M')
    expect(ics.replace(/\r\n /g, '')).toMatch(
      /ATTENDEE;CN=Arthur;PARTSTAT=ACCEPTED:mailto:arthur@example.org/,
    )
    expect(ics).toContain('PARTSTAT=ACCEPTED:mailto:sam@example.org')
    expect(vdir.events(week).map((e) => e.title)).toContain('Planning')
  })

  it('updates the copy in its calendar and flags older updates', async () => {
    const { vdir } = await fixture()
    await vdir.applyImport(
      invite({ sequence: 1 }),
      [{ uid: 'abc-123@example.com', calendarId: 'acc/work', partstat: 'ACCEPTED', remove: [] }],
      me,
    )
    const moved = invite({ sequence: 2, start: '20261104T140000' })
    const plan = vdir.planImport(moved, me)
    expect(plan.items[0]).toMatchObject({
      kind: 'update',
      partstat: 'ACCEPTED',
      existing: { calendarId: 'acc/work', start: '2026-11-03T09:00:00.000Z' },
      event: { start: '2026-11-04T13:00:00.000Z' },
    })
    expect(vdir.planImport(invite({ sequence: 0 }), me).items[0]?.kind).toBe('outdated')

    await vdir.applyImport(
      moved,
      [{ uid: 'abc-123@example.com', partstat: 'TENTATIVE', remove: [] }],
      me,
    )
    const planning = vdir.events(week).filter((e) => e.title === 'Planning')
    expect(planning.map((e) => [e.calendarId, e.start])).toEqual([
      ['acc/work', '2026-11-04T13:00:00.000Z'],
    ])
    expect(planning[0]?.attendees.find((a) => a.email === 'arthur@example.org')?.status).toBe(
      'TENTATIVE',
    )
  })

  it('removes the event on CANCEL, and undo brings it back', async () => {
    const { vdir } = await fixture()
    await vdir.applyImport(
      invite(),
      [{ uid: 'abc-123@example.com', calendarId: 'acc/work', remove: [] }],
      me,
    )
    const cancel = invite({ method: 'CANCEL', sequence: 1 })
    expect(vdir.planImport(cancel, me).items[0]).toMatchObject({
      kind: 'cancel',
      invitation: false,
    })
    await vdir.applyImport(cancel, [{ uid: 'abc-123@example.com', remove: [] }], me)
    expect(vdir.events(week).map((e) => e.title)).not.toContain('Planning')
    expect(await vdir.undo()).toBe('Import')
    expect(vdir.events(week).map((e) => e.title)).toContain('Planning')
  })

  it('cancels a single occurrence of a series with EXDATE', async () => {
    const { vdir } = await fixture()
    const series = invite({ extra: 'RRULE:FREQ=WEEKLY;COUNT=4' })
    await vdir.applyImport(
      series,
      [{ uid: 'abc-123@example.com', calendarId: 'acc/work', remove: [] }],
      me,
    )
    const one = invite({
      method: 'CANCEL',
      sequence: 1,
      extra: 'RECURRENCE-ID;TZID=W. Europe Standard Time:20261110T100000',
    }).replace(
      'DTSTART;TZID=W. Europe Standard Time:20261103T100000',
      'DTSTART;TZID=W. Europe Standard Time:20261110T100000',
    )
    expect(vdir.planImport(one, me).items[0]?.kind).toBe('cancel')
    await vdir.applyImport(one, [{ uid: 'abc-123@example.com', remove: [] }], me)
    const month = { start: '2026-11-01T00:00:00.000Z', end: '2026-12-01T00:00:00.000Z' }
    expect(
      vdir
        .events(month)
        .filter((e) => e.title === 'Planning')
        .map((e) => e.start.slice(0, 10)),
    ).toEqual(['2026-11-03', '2026-11-17', '2026-11-24'])
  })

  it('offers events a re-sent invitation replaces and removes them with the import', async () => {
    const { vdir, path } = await fixture()
    await vdir.applyImport(
      invite({ uid: 'old-1@example.com', summary: 'Planning' }),
      [{ uid: 'old-1@example.com', calendarId: 'acc/work', remove: [] }],
      me,
    )
    await vdir.applyImport(
      invite({
        uid: 'old-2@example.com',
        summary: 'Planning Q4 kickoff',
        start: '20261105T100000',
      }),
      [{ uid: 'old-2@example.com', calendarId: 'acc/work', remove: [] }],
      me,
    )
    await vdir.applyImport(
      invite({ uid: 'other@example.com', summary: 'Lunch' }),
      [{ uid: 'other@example.com', calendarId: 'acc/work', remove: [] }],
      me,
    )
    const resent = invite({ uid: 'new-9@example.com', summary: 'Updated invitation: Planning' })
    const [item] = vdir.planImport(resent, me).items
    expect(item?.superseded.map((s) => [s.event.uid, s.strong])).toEqual([
      ['old-1@example.com', true],
    ])

    await vdir.applyImport(
      resent,
      [
        {
          uid: 'new-9@example.com',
          calendarId: 'acc/work',
          remove: [{ calendarId: 'acc/work', uid: 'old-1@example.com' }],
        },
      ],
      me,
    )
    const files = await readdir(path('acc/work'))
    expect(files).toContain('new-9@example.com.ics')
    expect(files).not.toContain('old-1@example.com.ics')
    // one undo takes back the import and the removal together
    await vdir.undo()
    const after = await readdir(path('acc/work'))
    expect(after).toContain('old-1@example.com.ics')
    expect(after).not.toContain('new-9@example.com.ics')
  })
})
