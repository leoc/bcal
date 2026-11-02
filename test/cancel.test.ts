import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ICAL from 'ical.js'
import { describe, expect, it } from 'vitest'
import { cancelEvent, LockedError } from '../src/main/editor'
import { Vdir } from '../src/main/vdir'

const fixture = join(__dirname, 'fixtures/vdir/acc/work/standup.ics')
const me = { name: 'Arthur', email: 'arthur@example.org' }
const now = new Date('2026-10-27T12:00:00Z')
const week = { start: '2026-10-25T23:00:00.000Z', end: '2026-11-01T23:00:00.000Z' }
const ref = (recurrenceId?: string) => ({
  calendarId: 'acc/work',
  uid: 'standup@bcal',
  recurrenceId,
})

const single = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//t//EN
BEGIN:VEVENT
UID:lunch@bcal
DTSTAMP:20261001T000000Z
DTSTART:20261028T120000Z
DTEND:20261028T130000Z
SEQUENCE:2
SUMMARY:Lunch
ORGANIZER:mailto:arthur@example.org
ATTENDEE;PARTSTAT=ACCEPTED:mailto:sam@example.org
X-OTHER:keep
END:VEVENT
END:VCALENDAR
`

function vevents(ics: string) {
  return new ICAL.Component(ICAL.parse(ics)).getAllSubcomponents('vevent')
}

/** The week's events as `day. title [cancelled]`. */
async function load(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'bcal-'))
  await mkdir(join(root, 'acc/work'), { recursive: true })
  for (const [name, ics] of Object.entries(files))
    await writeFile(join(root, 'acc/work', name), ics)
  const trash = await mkdtemp(join(tmpdir(), 'bcal-trash-'))
  const vdir = new Vdir(root, trash)
  await vdir.load()
  const list = () =>
    vdir
      .events(week)
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((e) => `${new Date(e.start).getDate()}. ${e.title}${e.cancelled ? ' [cancelled]' : ''}`)
  return { root, vdir, list }
}

describe('cancelEvent on a single event', () => {
  const lunch = { calendarId: 'acc/work', uid: 'lunch@bcal' }

  it('notifies: STATUS:CANCELLED and SEQUENCE + 1, everything else stays', () => {
    const { ics } = cancelEvent(single, lunch, 'all', 'notify', { organizer: me, now })
    const [v] = vevents(ics)
    expect(v?.getFirstPropertyValue('status')).toBe('CANCELLED')
    expect(v?.getFirstPropertyValue('sequence')).toBe(3)
    expect(v?.getFirstPropertyValue('x-other')).toBe('keep')
    expect(v?.getAllProperties('attendee')).toHaveLength(1)
  })

  it('lifts a notified cancellation with STATUS:CONFIRMED and another SEQUENCE', () => {
    const cancelled = cancelEvent(single, lunch, 'all', 'notify', { organizer: me, now }).ics
    const [v] = vevents(cancelEvent(cancelled, lunch, 'all', 'lift', { organizer: me, now }).ics)
    expect(v?.getFirstPropertyValue('status')).toBe('CONFIRMED')
    expect(v?.getFirstPropertyValue('sequence')).toBe(4)
  })

  it('refuses events organized by someone else', () => {
    expect(() =>
      cancelEvent(single, lunch, 'all', 'notify', { organizer: { email: 'sam@example.org' } }),
    ).toThrow(LockedError)
  })
})

describe('cancelling in a series', () => {
  it('cancels only this occurrence through an override, notified', async () => {
    const ics = await readFile(fixture, 'utf8')
    const result = cancelEvent(ics, ref('2026-10-29T09:30:00'), 'this', 'notify', {
      organizer: me,
      now,
    })
    const { list } = await load({ 'standup.ics': result.ics })
    expect(list()).toEqual([
      '26. Standup',
      '28. Standup (verschoben)',
      '29. Standup [cancelled]',
      '30. Standup',
    ])
    const override = vevents(result.ics).find(
      (v) => String(v.getFirstPropertyValue('recurrence-id')) === '2026-10-29T09:30:00',
    )
    expect(override?.getFirstPropertyValue('sequence')).toBe(1)
  })

  it('cancels an existing override and all occurrences', async () => {
    const ics = await readFile(fixture, 'utf8')
    const moved = cancelEvent(ics, ref('2026-10-28T09:30:00'), 'this', 'notify', {
      organizer: me,
      now,
    })
    expect((await load({ 's.ics': moved.ics })).list()).toContain(
      '28. Standup (verschoben) [cancelled]',
    )
    const all = cancelEvent(ics, ref('2026-10-29T09:30:00'), 'all', 'notify', {
      organizer: me,
      now,
    })
    expect((await load({ 's.ics': all.ics })).list().every((e) => e.endsWith('[cancelled]'))).toBe(
      true,
    )
  })

  it('splits for this and the following, notified, keeping moved overrides', async () => {
    const ics = await readFile(fixture, 'utf8')
    const result = cancelEvent(ics, ref('2026-10-28T09:30:00'), 'following', 'notify', {
      organizer: me,
      now,
      newUid: 'standup-2@bcal',
    })
    expect(result.split?.uid).toBe('standup-2@bcal')
    const { list } = await load({ 'standup.ics': result.ics, 'b.ics': result.split?.ics ?? '' })
    expect(list()).toEqual([
      '26. Standup',
      '28. Standup (verschoben) [cancelled]',
      '29. Standup [cancelled]',
      '30. Standup [cancelled]',
    ])
  })
})

describe('Vdir.cancel', () => {
  it('writes the cancellation, shows it struck through and undo takes it back', async () => {
    const { root, vdir, list } = await load({ 'lunch.ics': single })
    await vdir.cancel({ calendarId: 'acc/work', uid: 'lunch@bcal' }, 'all', 'notify', {
      organizer: me,
      now,
    })
    expect(list()).toEqual(['28. Lunch [cancelled]'])
    expect(await readFile(join(root, 'acc/work/lunch.ics'), 'utf8')).toContain('STATUS:CANCELLED')
    expect(await vdir.undo()).toBe('Absage')
    expect(list()).toEqual(['28. Lunch'])
    expect(await readFile(join(root, 'acc/work/lunch.ics'), 'utf8')).toBe(single)
  })

  it('takes a split back with one undo', async () => {
    const { root, vdir, list } = await load({ 'standup.ics': await readFile(fixture, 'utf8') })
    await vdir.cancel(ref('2026-10-29T09:30:00'), 'following', 'notify', { organizer: me, now })
    expect(await readdir(join(root, 'acc/work'))).toHaveLength(2)
    await vdir.undo()
    expect(await readdir(join(root, 'acc/work'))).toEqual(['standup.ics'])
    expect(list().some((e) => e.includes('['))).toBe(false)
  })

  it('shows events cancelled by their organizer struck through', async () => {
    const theirs = single
      .replace('ORGANIZER:mailto:arthur@example.org', 'ORGANIZER:mailto:sam@example.org')
      .replace('SUMMARY:Lunch', 'STATUS:CANCELLED\nSUMMARY:Lunch')
    const { list } = await load({ 'theirs.ics': theirs })
    expect(list()).toEqual(['28. Lunch [cancelled]'])
  })
})
