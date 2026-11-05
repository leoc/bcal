import { describe, expect, it } from 'vitest'
import { buildBindings } from '../src/renderer/src/lib/keymap'

const action = (key: string, overrides?: Record<string, string>) =>
  buildBindings(overrides).find((b) => b.key === key)?.action

describe('buildBindings', () => {
  it('moves through the calendar with uppercase keys', () => {
    expect(['H', 'L', 'J', 'K'].map((key) => action(key))).toEqual([
      'day:prev',
      'day:next',
      'week:next',
      'week:prev',
    ])
  })

  it('moves between events with lowercase keys and arrows', () => {
    expect(['h', 'l', 'j', 'k'].map((key) => action(key))).toEqual([
      'focus:left',
      'focus:right',
      'focus:next',
      'focus:prev',
    ])
    expect(action('ArrowLeft')).toBe('focus:left')
    expect(action('ArrowRight')).toBe('focus:right')
  })

  it('deletes with x, D and Delete, incognito sits on I', () => {
    expect(['x', 'D', 'Delete'].map((key) => action(key))).toEqual(['delete', 'delete', 'delete'])
    expect(action('I')).toBe('incognito')
  })

  it('still takes overrides', () => {
    expect(action('H', { H: 'prev' })).toBe('prev')
    expect(action('H', { H: 'none' })).toBeUndefined()
  })
})
