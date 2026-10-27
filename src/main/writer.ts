import { randomUUID } from 'node:crypto'
import ICAL from 'ical.js'
import type { NewEvent, Person } from '../shared/types'

// Embedded so other clients do not have to know the zone; the only zone bcal
// writes for now (falls back to UTC for anything else).
const BERLIN = `BEGIN:VTIMEZONE
TZID:Europe/Berlin
BEGIN:DAYLIGHT
TZNAME:CEST
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
DTSTART:19810329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZNAME:CET
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
DTSTART:19961027T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE`

export interface WriteOptions {
  organizer?: Person
  uid?: string
  now?: Date
  timezone?: string
}

function time(value: string, allDay: boolean): ICAL.Time {
  const [date = '', clock = '00:00:00'] = value.split('T')
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute, second] = clock.split(':').map(Number)
  return ICAL.Time.fromData({
    year,
    month,
    day,
    hour: allDay ? 0 : hour,
    minute: allDay ? 0 : minute,
    second: allDay ? 0 : (second ?? 0),
    isDate: allDay,
  })
}

function addPerson(event: ICAL.Component, name: 'organizer' | 'attendee', person: Person) {
  if (!person.email) return
  const property = event.addPropertyWithValue(name, `mailto:${person.email}`)
  if (person.name && !person.name.includes('@')) property.setParameter('cn', person.name)
  if (name === 'attendee') {
    property.setParameter('role', 'REQ-PARTICIPANT')
    property.setParameter('partstat', 'NEEDS-ACTION')
    property.setParameter('rsvp', 'TRUE')
  }
}

/** Serializes a new event as a VCALENDAR with one VEVENT (and VTIMEZONE). */
export function buildIcs(
  input: NewEvent,
  options: WriteOptions = {},
): { uid: string; ics: string } {
  const uid = options.uid ?? randomUUID()
  const zone = options.timezone ?? 'Europe/Berlin'
  const zoned = !input.allDay && zone === 'Europe/Berlin'

  const calendar = new ICAL.Component('vcalendar')
  calendar.addPropertyWithValue('prodid', '-//bcal//EN')
  calendar.addPropertyWithValue('version', '2.0')
  if (zoned) calendar.addSubcomponent(new ICAL.Component(ICAL.parse(BERLIN)))

  const event = new ICAL.Component('vevent')
  event.addPropertyWithValue('uid', uid)
  event.addPropertyWithValue('dtstamp', ICAL.Time.fromJSDate(options.now ?? new Date(), true))
  event.addPropertyWithValue('summary', input.title)
  for (const name of ['dtstart', 'dtend'] as const) {
    const value = time(name === 'dtstart' ? input.start : input.end, input.allDay)
    const property = event.addPropertyWithValue(name, value)
    if (zoned) property.setParameter('tzid', zone)
  }
  if (input.rrule) event.addProperty(new ICAL.Property(ICAL.parse.property(`RRULE:${input.rrule}`)))
  if (input.location) event.addPropertyWithValue('location', input.location)
  if (input.geo) event.addPropertyWithValue('geo', [input.geo.lat, input.geo.lon])
  if (input.description) event.addPropertyWithValue('description', input.description)

  const invited = input.attendees.filter((a) => a.email)
  if (invited.length && options.organizer?.email) {
    addPerson(event, 'organizer', options.organizer)
    for (const attendee of invited) addPerson(event, 'attendee', attendee)
  }

  if (input.alarm !== undefined) {
    const alarm = new ICAL.Component('valarm')
    alarm.addPropertyWithValue('action', 'DISPLAY')
    alarm.addPropertyWithValue('description', input.title)
    alarm.addPropertyWithValue('trigger', ICAL.Duration.fromSeconds(-input.alarm * 60))
    event.addSubcomponent(alarm)
  }

  calendar.addSubcomponent(event)
  return { uid, ics: calendar.toString().replace(/\r?\n/g, '\r\n') }
}
