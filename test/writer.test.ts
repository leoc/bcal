import ICAL from 'ical.js'
import { describe, expect, it } from 'vitest'
import { buildIcs } from '../src/main/writer'

const now = new Date('2026-10-26T12:00:00Z')

describe('buildIcs', () => {
  it('writes a zoned event with attendees, alarm and recurrence', () => {
    const { uid, ics } = buildIcs(
      {
        calendarId: 'acc/personal',
        title: 'Planung, Q4',
        start: '2026-11-06T14:00:00',
        end: '2026-11-06T15:00:00',
        allDay: false,
        location: 'https://meet.example.org/abc123',
        rrule: 'FREQ=WEEKLY;BYDAY=FR',
        attendees: [{ name: 'Simon', email: 'simon@example.org' }, { name: 'Ohne Mail' }],
        alarm: 15,
      },
      { uid: 'u-1', now, organizer: { name: 'Arthur', email: 'arthur@example.org' } },
    )
    expect(uid).toBe('u-1')
    expect(ics).toContain('\r\n')
    expect(ics).toContain('BEGIN:VTIMEZONE')
    expect(ics).toContain('DTSTART;TZID=Europe/Berlin:20261106T140000')
    expect(ics).toContain('SUMMARY:Planung\\, Q4')
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=FR')
    expect(ics).toContain('ORGANIZER;CN=Arthur:mailto:arthur@example.org')
    expect(ics.replace(/\r\n /g, '')).toContain(
      'ATTENDEE;CN=Simon;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:simon@example.org',
    )
    expect(ics).not.toContain('Ohne Mail')
    expect(ics).toContain('TRIGGER:-PT15M')

    // round trip through ical.js
    const vevent = new ICAL.Component(ICAL.parse(ics)).getFirstSubcomponent('vevent')
    if (!vevent) throw new Error('no VEVENT')
    const event = new ICAL.Event(vevent)
    expect(event.summary).toBe('Planung, Q4')
    expect(event.startDate.toString()).toBe('2026-11-06T14:00:00')
  })

  it('writes all-day events as dates without zone, organizer only with invitees', () => {
    const { ics } = buildIcs(
      {
        calendarId: 'acc/family',
        title: 'Geburtstag',
        start: '2026-12-03',
        end: '2026-12-04',
        allDay: true,
        attendees: [{ name: 'Simon' }],
      },
      { uid: 'u-2', now, organizer: { email: 'arthur@example.org' } },
    )
    expect(ics).toContain('DTSTART;VALUE=DATE:20261203')
    expect(ics).not.toContain('VTIMEZONE')
    expect(ics).not.toContain('ORGANIZER')
    expect(ics).not.toContain('VALARM')
  })
})
