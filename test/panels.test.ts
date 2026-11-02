import { describe, expect, it } from 'vitest'
import { normalize } from '../src/main/config'
import { defaultPanelModes, initialPanels, parsePanelMode } from '../src/shared/panels'

describe('initialPanels', () => {
  it('starts with calendars shown and details off before anything was remembered', () => {
    expect(initialPanels(defaultPanelModes, {})).toEqual({ sidebar: true, details: false })
  })

  it('takes the remembered state in remember mode', () => {
    expect(initialPanels(defaultPanelModes, { sidebar: false, details: true })).toEqual({
      sidebar: false,
      details: true,
    })
  })

  it('lets the config force a panel regardless of what was remembered', () => {
    expect(
      initialPanels({ sidebar: 'hidden', details: 'shown' }, { sidebar: true, details: false }),
    ).toEqual({ sidebar: false, details: true })
  })
})

describe('panel modes in config.yml', () => {
  it('reads remember, shown/hidden and booleans', () => {
    expect(parsePanelMode('remember')).toBe('remember')
    expect(parsePanelMode(true)).toBe('shown')
    expect(parsePanelMode('hidden')).toBe('hidden')
    expect(parsePanelMode('sometimes')).toBeUndefined()
    expect(normalize({ panels: { details: true } }).panels).toEqual({
      sidebar: 'remember',
      details: 'shown',
    })
    expect(normalize({ panels: 'x' }).panels).toEqual(defaultPanelModes)
  })
})
