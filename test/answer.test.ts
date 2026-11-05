import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ICAL from 'ical.js'
import { describe, expect, it } from 'vitest'
import { answerEvent, cancelEvent, LockedError } from '../src/main/editor'
import { Vdir } from '../src/main/vdir'

const me = ['arthur@example.org']
const now = new Date('2026-10-27T12:00:00Z')
const ref = (uid: string, recurrenceId?: string) => ({ calendarId: 'acc/work', uid, recurrenceId })

const invitation = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//t//EN
BEGIN:VEVENT
UID:review@bcal
DTSTAMP:20261001T000000Z
DTSTART:20261028T120000Z
DTEND:20261028T130000Z
SEQUENCE:2
SUMMARY:Review
ORGANIZER:mailto:boss@example.org
ATTENDEE;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:arthur@example.org
ATTENDEE;PARTSTAT=ACCEPTED:mailto:sam@example.org
X-OTHER:keep
END:VEVENT
END:VCALENDAR
`

const series = invitation
  .replace('UID:review@bcal', 'UID:weekly@bcal')
  .replace('SUMMARY:Review', 'RRULE:FREQ=WEEKLY;COUNT=3\nSUMMARY:Weekly')

function vevents(ics: string) {
  return new ICAL.Component(ICAL.parse(ics)).getAllSubcomponents('vevent')
}

function partstat(component: ICAL.Component, email: string) {
  return component
    .getAllProperties('attendee')
    .find((p) => String(p.getFirstValue()).endsWith(email))
    ?.getParameter('partstat')
}

describe('answerEvent', () => {
  it('declining changes my answer and frees the time, nothing else', () => {
    const [event] = vevents(answerEvent(invitation, ref('review@bcal'), 'all', 'DECLINED', me, now))
    expect(partstat(event!, 'arthur@example.org')).toBe('DECLINED')
    expect(partstat(event!, 'sam@example.org')).toBe('ACCEPTED')
    expect(event!.getFirstPropertyValue('transp')).toBe('TRANSPARENT')
    expect(event!.getFirstPropertyValue('sequence')).toBe(2)
    expect(event!.getFirstPropertyValue('x-other')).toBe('keep')
    expect(event!.getFirstProperty('attendee')?.getParameter('rsvp')).toBeUndefined()
  })

  it('accepting after a decline blocks the time again', () => {
    const declined = answerEvent(invitation, ref('review@bcal'), 'all', 'DECLINED', me, now)
    const [event] = vevents(answerEvent(declined, ref('review@bcal'), 'all', 'ACCEPTED', me, now))
    expect(partstat(event!, 'arthur@example.org')).toBe('ACCEPTED')
    expect(event!.hasProperty('transp')).toBe(false)
  })

  it('finds me under a further own address, in any case', () => {
    const [event] = vevents(
      answerEvent(invitation, ref('review@bcal'), 'all', 'TENTATIVE', ['ARTHUR@example.org'], now),
    )
    expect(partstat(event!, 'arthur@example.org')).toBe('TENTATIVE')
  })

  it('refuses an event I am not invited to', () => {
    expect(() =>
      answerEvent(invitation, ref('review@bcal'), 'all', 'DECLINED', ['x@example.org'], now),
    ).toThrow(LockedError)
  })

  it('this occurrence: an override, the series keeps its answer', () => {
    const rid = '2026-11-04T12:00:00Z'
    const [master, override] = vevents(
      answerEvent(series, ref('weekly@bcal', rid), 'this', 'DECLINED', me, now),
    )
    expect(partstat(master!, 'arthur@example.org')).toBe('NEEDS-ACTION')
    expect(master!.hasProperty('transp')).toBe(false)
    expect(partstat(override!, 'arthur@example.org')).toBe('DECLINED')
    expect(override!.getFirstPropertyValue('recurrence-id')?.toString()).toBe(rid)
    expect(override!.hasProperty('rrule')).toBe(false)
    expect(override!.getFirstPropertyValue('dtstart')?.toString()).toBe(rid)
  })

  it('all: the series and its overrides', () => {
    const rid = '2026-11-04T12:00:00Z'
    const one = answerEvent(series, ref('weekly@bcal', rid), 'this', 'TENTATIVE', me, now)
    const events = vevents(answerEvent(one, ref('weekly@bcal', rid), 'all', 'DECLINED', me, now))
    expect(events).toHaveLength(2)
    expect(events.map((e) => partstat(e, 'arthur@example.org'))).toEqual(['DECLINED', 'DECLINED'])
  })

  it('still cannot be cancelled like an own event', () => {
    expect(() =>
      cancelEvent(invitation, ref('review@bcal'), 'all', 'notify', {
        organizer: { email: 'arthur@example.org' },
      }),
    ).toThrow(LockedError)
  })

  it('an event from a further own address is mine to cancel', () => {
    const own = invitation.replace('boss@example.org', 'second@example.org')
    const { ics } = cancelEvent(own, ref('review@bcal'), 'all', 'notify', {
      organizer: { email: 'arthur@example.org' },
      emails: ['second@example.org'],
    })
    expect(vevents(ics)[0]?.getFirstPropertyValue('status')).toBe('CANCELLED')
  })
})

describe('Vdir.answer', () => {
  it('keeps the event in the calendar and undo restores the file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bcal-'))
    await mkdir(join(root, 'acc/work'), { recursive: true })
    const path = join(root, 'acc/work/review.ics')
    await writeFile(path, invitation)
    const vdir = new Vdir(root, await mkdtemp(join(tmpdir(), 'bcal-trash-')))
    await vdir.load()

    await vdir.answer(ref('review@bcal'), 'all', 'DECLINED', me, now)
    const week = { start: '2026-10-25T23:00:00.000Z', end: '2026-11-01T23:00:00.000Z' }
    const [event] = vdir.events(week)
    expect(event?.attendees.find((a) => a.email === me[0])?.status).toBe('DECLINED')

    expect(await vdir.undo()).toBe('Antwort')
    expect(await readFile(path, 'utf8')).toBe(invitation)
  })
})
