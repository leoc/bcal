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
hidden: [birthdays]
keymap: { n: next, h: none }
`),
    )
    expect(config).toEqual({
      startView: 'month',
      groups: [{ name: 'Privat', calendars: ['family', 'Mia'] }],
      hidden: ['birthdays'],
      keymap: { n: 'next', h: 'none' },
    })
  })
})
