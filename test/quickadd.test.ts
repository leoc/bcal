import { describe, expect, it } from 'vitest'
import { activeToken, parseQuickAdd } from '../src/renderer/src/lib/quickadd'

const now = new Date(2026, 9, 26, 12) // Mon 2026-10-26 12:00
const parse = (line: string) => parseQuickAdd(line, { now })
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min)

describe('parseQuickAdd', () => {
  it('reads the example from the interview', () => {
    expect(parse('nächsten Freitag 14 Uhr eine Stunde Simon @Simon')).toMatchObject({
      title: 'Simon',
      start: at(2026, 11, 6, 14),
      end: at(2026, 11, 6, 15),
      allDay: false,
      people: ['Simon'],
      video: false,
    })
  })

  it('understands English', () => {
    expect(parse('next friday 2pm 1h call with Simon @simon')).toMatchObject({
      title: 'Simon',
      start: at(2026, 11, 6, 14),
      end: at(2026, 11, 6, 15),
      video: true,
      people: ['simon'],
    })
  })

  it('takes ranges and end times', () => {
    expect(parse('Freitag 14-15:30 Planung')).toMatchObject({
      title: 'Planung',
      start: at(2026, 10, 30, 14),
      end: at(2026, 10, 30, 15, 30),
    })
    expect(parse('morgen 14 Uhr bis 16 Uhr Workshop')).toMatchObject({
      title: 'Workshop',
      start: at(2026, 10, 27, 14),
      end: at(2026, 10, 27, 16),
    })
  })

  it('applies defaults: 1 h, all-day without time, today or tomorrow without date', () => {
    expect(parse('morgen um 9:30 Zahnarzt')).toMatchObject({
      title: 'Zahnarzt',
      start: at(2026, 10, 27, 9, 30),
      end: at(2026, 10, 27, 10, 30),
    })
    expect(parse('Simon Geburtstag 3. Dezember')).toMatchObject({
      title: 'Simon Geburtstag',
      start: at(2026, 12, 3),
      end: at(2026, 12, 4),
      allDay: true,
    })
    expect(parse('Wäsche')).toMatchObject({ start: at(2026, 10, 26), allDay: true })
    expect(parse('14 Uhr Call Lieferant').start).toEqual(at(2026, 10, 26, 14))
    expect(parse('9 Uhr Laufen').start).toEqual(at(2026, 10, 27, 9))
  })

  it('reads dotted dates, minutes and half hours', () => {
    expect(parse('am 12.11. um 10 Uhr 90min Review')).toMatchObject({
      title: 'Review',
      start: at(2026, 11, 12, 10),
      end: at(2026, 11, 12, 11, 30),
    })
    expect(parse('übermorgen 18:00 halbe Stunde Telefonat').end).toEqual(at(2026, 10, 28, 18, 30))
  })

  it('reads calendar, location and video', () => {
    expect(parse('Freitag 10 Uhr Kaffee bei Simon #family')).toMatchObject({
      title: 'Kaffee bei Simon',
      location: 'Simon',
      calendar: 'family',
    })
    expect(parse('morgen 9 Uhr Sprint Review im Büro video')).toMatchObject({
      title: 'Sprint Review',
      location: 'Büro',
      video: true,
    })
  })

  it('reads recurrences', () => {
    expect(parse('jeden Montag 9 Uhr Standup')).toMatchObject({
      title: 'Standup',
      start: at(2026, 11, 2, 9),
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
    })
    expect(parse('wöchentlich Freitag 16 Uhr Retro bis 18.12.').rrule).toBe(
      'FREQ=WEEKLY;BYDAY=FR;UNTIL=20261218T225959Z',
    )
    expect(parse('alle 2 Wochen Mittwoch 11 Uhr 1:1').rrule).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=WE')
    expect(parse('every monday 9am standup')).toMatchObject({
      title: 'standup',
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      start: at(2026, 11, 2, 9),
    })
  })
})

describe('activeToken', () => {
  it('finds the @ or # token at the cursor', () => {
    expect(activeToken('Freitag Kaffee @Sim')).toEqual({
      kind: 'person',
      query: 'Sim',
      from: 15,
      to: 19,
    })
    expect(activeToken('Kaffee #fa')).toEqual({ kind: 'calendar', query: 'fa', from: 7, to: 10 })
    expect(activeToken('Kaffee @')).toEqual({ kind: 'person', query: '', from: 7, to: 8 })
    expect(activeToken('Kaffee @Simon morgen')).toBeUndefined()
    expect(activeToken('mail@example.org')).toBeUndefined()
  })
})

describe('explicit', () => {
  it('tells event-like lines from plain words', () => {
    expect(parse('woche').explicit).toBe(false)
    expect(parse('morgen Kaffee').explicit).toBe(true)
    expect(parse('Kaffee @Simon').explicit).toBe(true)
  })
})

describe('places', () => {
  it('keeps "bei" hosts in the title and does not swallow dates', () => {
    expect(parse('Essen bei Friedi so 14uhr @richard')).toMatchObject({
      title: 'Essen bei Friedi',
      location: 'Friedi',
      start: at(2026, 11, 1, 14),
      people: ['richard'],
    })
    expect(parse('Essen bei Friedi Sonntag 14 Uhr')).toMatchObject({
      title: 'Essen bei Friedi',
      location: 'Friedi',
      start: at(2026, 11, 1, 14),
      allDay: false,
    })
    expect(parse('Kaffee im Café Kranzler morgen 15 Uhr')).toMatchObject({
      title: 'Kaffee',
      location: 'Café Kranzler',
      start: at(2026, 10, 27, 15),
    })
  })
})

describe('place token', () => {
  it('completes words after bei/in/im/at', () => {
    expect(activeToken('Kaffee bei Kranz')).toEqual({
      kind: 'place',
      query: 'Kranz',
      from: 11,
      to: 16,
    })
    expect(activeToken('morgen 15 Uhr Kaffee im Café am Neuen')).toMatchObject({
      kind: 'place',
      query: 'Café am Neuen',
    })
    expect(activeToken('Workshop at office')).toMatchObject({ kind: 'place', query: 'office' })
    expect(activeToken('Kaffee bei Kranz', 13)).toMatchObject({ query: 'Kr', to: 13 })
  })

  it('stays away from dates, times and finished words', () => {
    expect(activeToken('Kaffee in zwei Wochen')).toBeUndefined()
    expect(activeToken('Kaffee im Juni')).toBeUndefined()
    expect(activeToken('call at 3pm')).toBeUndefined()
    expect(activeToken('Essen bei Simon morgen')).toBeUndefined()
    expect(activeToken('Essen bei Simon Sonntag')).toBeUndefined()
    expect(activeToken('Kaffee bei ')).toBeUndefined()
    expect(activeToken('Kaffee bei Simon ')).toBeUndefined()
    expect(activeToken('Kaffee bei Simon @Ri')).toMatchObject({ kind: 'person' })
  })
})

describe('picked places', () => {
  const places = ['Café am Neuen See', 'Simon Müller', 'Montagsbar']
  const withPlaces = (line: string) => parseQuickAdd(line, { now, places })

  it('takes a picked name whole, even with small words', () => {
    expect(withPlaces('Kaffee im Café am Neuen See morgen 15 Uhr')).toMatchObject({
      title: 'Kaffee',
      location: 'Café am Neuen See',
      start: at(2026, 10, 27, 15),
    })
  })

  it('keeps a picked host in the title and hides it from the date parser', () => {
    expect(withPlaces('Essen bei Simon Müller Sonntag 14 Uhr')).toMatchObject({
      title: 'Essen bei Simon Müller',
      location: 'Simon Müller',
      start: at(2026, 11, 1, 14),
    })
    expect(withPlaces('Bier in Montagsbar Freitag 20 Uhr')).toMatchObject({
      title: 'Bier',
      location: 'Montagsbar',
      start: at(2026, 10, 30, 20),
    })
  })

  it('falls back to free text for names that were not picked', () => {
    expect(withPlaces('Kaffee im Café Kranzler morgen 15 Uhr').location).toBe('Café Kranzler')
  })
})

describe('date ranges', () => {
  const thursday = new Date(2026, 10, 5, 10) // Thu 2026-11-05 10:00
  const read = (line: string, at = thursday) => parseQuickAdd(line, { now: at })
  /** all-day: `last` is inclusive, the stored end the day after */
  const allDay = (line: string, title: string, first: Date, last: Date, when = thursday) => {
    const q = read(line, when)
    expect(q.title).toBe(title)
    expect(q.allDay).toBe(true)
    expect(q.start).toEqual(first)
    expect(q.end).toEqual(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1))
    expect(q.explicit).toBe(true)
    expect(q.given).toMatchObject({ date: true, time: false, end: true })
  }

  it('keeps everything else on the line', () => {
    const q = read('Urlaub 2.11. bis 6.11. in Hamburg #family @Simon')
    expect(q.title).toBe('Urlaub')
    expect(q.allDay).toBe(true)
    expect(q.start).toEqual(at(2026, 11, 2))
    expect(q.end).toEqual(at(2026, 11, 7))
    expect(q.location).toBe('Hamburg')
    expect(q.calendar).toBe('family')
    expect(q.people).toEqual(['Simon'])
  })

  it.each([
    'Urlaub 2.11. - 6.11.',
    'Urlaub 2.11.-6.11.',
    'Urlaub 2.11. – 6.11.',
    'Urlaub vom 2.11. bis zum 6.11.',
    'Urlaub 2.-6.11.',
    'Urlaub 2. bis 6. November',
    'Urlaub vom 2. bis 6. November',
    'Urlaub 2. November bis 6. November',
    'Urlaub 2.11.26 bis 6.11.26',
    'Urlaub 2.11. bis 6.11.2026',
  ])('reads %s', (line) => {
    allDay(line, 'Urlaub', at(2026, 11, 2), at(2026, 11, 6))
  })

  it('reads a range still to come', () => {
    allDay('Messe 10.11. bis 12.11.', 'Messe', at(2026, 11, 10), at(2026, 11, 12))
  })

  it('rolls an end before the start into the next year', () => {
    allDay('Messe 28.12. bis 3.1.', 'Messe', at(2026, 12, 28), at(2027, 1, 3))
    allDay('Messe 28. Dezember bis 3. Januar', 'Messe', at(2026, 12, 28), at(2027, 1, 3))
    allDay(
      'Messe 28.12. bis 3.1.',
      'Messe',
      at(2026, 12, 28),
      at(2027, 1, 3),
      new Date(2027, 0, 2, 10),
    )
  })

  it('backdates within the current month, later ranges move a year', () => {
    allDay('Urlaub 2.11. bis 4.11.', 'Urlaub', at(2026, 11, 2), at(2026, 11, 4))
    allDay('Urlaub 28.10. bis 2.11.', 'Urlaub', at(2026, 10, 28), at(2026, 11, 2))
    allDay('Urlaub 20.10. bis 24.10.', 'Urlaub', at(2027, 10, 20), at(2027, 10, 24))
    allDay('Urlaub 20.10.26 bis 24.10.26', 'Urlaub', at(2026, 10, 20), at(2026, 10, 24))
  })

  it.each([
    'Urlaub <20.10. bis 24.10.',
    'Urlaub letzter 20.10. bis 24.10.',
    'Urlaub last 20.10. bis 24.10.',
    'Urlaub <20. bis 24. Oktober',
    'Urlaub last Oct 20 to Oct 24',
  ])('takes %s as behind us', (line) => {
    allDay(line, 'Urlaub', at(2026, 10, 20), at(2026, 10, 24))
  })

  it('reads weekdays and relative days', () => {
    allDay('Messe Montag bis Freitag', 'Messe', at(2026, 11, 9), at(2026, 11, 13))
    allDay('Messe Freitag bis Montag', 'Messe', at(2026, 11, 6), at(2026, 11, 9))
    allDay('Messe morgen bis Sonntag', 'Messe', at(2026, 11, 6), at(2026, 11, 8))
    allDay('Trip monday to friday', 'Trip', at(2026, 11, 9), at(2026, 11, 13))
  })

  it('reads English', () => {
    allDay('Trip Nov 10 to Nov 12', 'Trip', at(2026, 11, 10), at(2026, 11, 12))
    allDay('Trip Nov 2 to Nov 6', 'Trip', at(2026, 11, 2), at(2026, 11, 6))
    allDay('Trip 2026-11-10 to 2026-11-12', 'Trip', at(2026, 11, 10), at(2026, 11, 12))
  })

  it.each([
    ['Messe 10.11. 9 Uhr bis 12.11. 17 Uhr', 10, 9, 12, 17],
    ['Messe 10.11. 9:30 - 12.11. 17 Uhr', 10, 9.5, 12, 17],
    ['Messe 10. November 9 Uhr bis 12. November 17 Uhr', 10, 9, 12, 17],
    ['Messe Dienstag 9 Uhr bis Donnerstag 17 Uhr', 10, 9, 12, 17],
    ['Messe 10.11. bis 12.11. 14 Uhr', 10, 14, 12, 14],
    ['Messe 10.11. 14 Uhr bis 12.11.', 10, 14, 12, 14],
  ])('reads times with %s', (line, firstDay, firstHour, lastDay, lastHour) => {
    const q = read(line)
    expect(q.title).toBe('Messe')
    expect(q.allDay).toBe(false)
    expect(q.start).toEqual(at(2026, 11, firstDay, Math.floor(firstHour), (firstHour % 1) * 60))
    expect(q.end).toEqual(at(2026, 11, lastDay, lastHour))
    expect(q.given).toMatchObject({ date: true, time: true, end: true })
  })

  it('leaves everything that is no range alone', () => {
    const single = read('Termin 2.11.')
    expect(single.start).toEqual(at(2026, 11, 2))
    expect(single.end).toEqual(at(2026, 11, 3))
    expect(single.given.end).toBe(false)

    const hours = read('Planung 12.11. 14 bis 16 Uhr')
    expect(hours.start).toEqual(at(2026, 11, 12, 14))
    expect(hours.end).toEqual(at(2026, 11, 12, 16))

    const workshop = read('morgen 14-15:30 Workshop im Büro')
    expect(workshop.start).toEqual(at(2026, 11, 6, 14))
    expect(workshop.end).toEqual(at(2026, 11, 6, 15, 30))
    expect(workshop.location).toBe('Büro')

    const standup = read('jeden Montag 9 Uhr Standup bis 18.12.')
    expect(standup.rrule).toMatch(/^FREQ=WEEKLY;BYDAY=MO;UNTIL=20261218/)
    expect(standup.start).toEqual(at(2026, 11, 9, 9))
    expect(standup.end).toEqual(at(2026, 11, 9, 10))
  })

  it('picks the year of single dates the same way', () => {
    expect(read('Termin 2. November').start).toEqual(at(2026, 11, 2))
    expect(read('Termin 28.10.').start).toEqual(at(2027, 10, 28))
    expect(read('Termin 28. Oktober').start).toEqual(at(2027, 10, 28))
    for (const line of ['Termin <28.10.', 'Termin letzten 28.10.', 'Termin last 28.10.']) {
      const q = read(line)
      expect(q.title).toBe('Termin')
      expect(q.start).toEqual(at(2026, 10, 28))
    }
    expect(read('Termin <28.12.').start).toEqual(at(2025, 12, 28))
    expect(read('Termin <28. Oktober').start).toEqual(at(2026, 10, 28))
    expect(read('Termin <28.10. 14 Uhr').start).toEqual(at(2026, 10, 28, 14))
    expect(read('Liebe <3 Grüße').title).toBe('Liebe <3 Grüße')
    expect(read('letzten Montag Bericht').start).toEqual(at(2026, 11, 2))
    expect(read('last monday 9am Bericht').start).toEqual(at(2026, 11, 2, 9))
    expect(read('<Montag bis Mittwoch Bericht').end).toEqual(at(2026, 11, 5))
  })

  it('backdates as far as configured', () => {
    const line = (text: string, backdate: 'month' | number) =>
      parseQuickAdd(text, { now: thursday, backdate }).start
    expect(line('Termin 2.11.', 'month')).toEqual(at(2026, 11, 2))
    expect(line('Termin 2.11.', 0)).toEqual(at(2027, 11, 2))
    expect(line('Termin 28.10.', 14)).toEqual(at(2026, 10, 28))
    expect(line('Urlaub 28.10. bis 30.10.', 14)).toEqual(at(2026, 10, 28))
    expect(line('Termin 28.10.', 3)).toEqual(at(2027, 10, 28))
    expect(line('Termin <28.10.', 0)).toEqual(at(2026, 10, 28))
  })

  it('does not take an impossible date for a range', () => {
    expect(read('Reise 31.2. bis 3.3.').start.getMonth()).not.toBe(1)
  })
})
