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
