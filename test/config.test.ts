import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { defaultConfig, normalize } from '../src/main/config'

describe('normalize', () => {
  it('falls back to defaults for empty or broken input', () => {
    expect(normalize(null)).toEqual(defaultConfig)
    expect(normalize({ startView: 'year', groups: 'x', hidden: [1, 'a'] })).toEqual({
      ...defaultConfig,
      hidden: ['a'],
    })
  })

  it('reads groups, hidden calendars and key overrides', () => {
    const config = normalize(
      parse(`
startView: month
groups:
  - name: Privat
    calendars: [family, Mia]
  - name: Sonstiges
    toggle: true
    calendars: [birthdays]
hidden: [birthdays]
keymap: { n: next, h: none }
`),
    )
    expect(config).toEqual({
      startView: 'month',
      groups: [
        { name: 'Privat', toggle: false, calendars: ['family', 'Mia'] },
        { name: 'Sonstiges', toggle: true, calendars: ['birthdays'] },
      ],
      hidden: ['birthdays'],
      keymap: { n: 'next', h: 'none' },
      defaultCalendar: undefined,
      defaultDuration: 60,
      defaultAlarm: undefined,
      organizer: undefined,
      places: [],
      near: { lat: 52.52, lon: 13.405 },
    })
  })

  it('accepts only http(s) URLs for video rooms', () => {
    expect(normalize({ video: 'https://meet.example.org/' }).video).toBe(
      'https://meet.example.org/',
    )
    expect(normalize({ video: 'javascript:alert(1)' }).video).toBeUndefined()
  })

  it('reads own places and the map center', () => {
    const config = normalize(
      parse(`
places:
  - name: Büro
    address: Musterstraße 1, 10115 Berlin
    geo: [52.53, 13.38]
  - name: Kita
  - address: ohne Namen
near: { lat: 48.14, lon: 11.58 }
`),
    )
    expect(config.places).toEqual([
      {
        name: 'Büro',
        label: 'Büro, Musterstraße 1, 10115 Berlin',
        geo: { lat: 52.53, lon: 13.38 },
        source: 'config',
      },
      { name: 'Kita', label: 'Kita', geo: undefined, source: 'config' },
    ])
    expect(config.near).toEqual({ lat: 48.14, lon: 11.58 })
  })
})
