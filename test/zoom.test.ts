import { describe, expect, it } from 'vitest'
import { clampZoom, stepZoom, zoomKey } from '../src/main/zoom'

const key = (k: string, mods: Partial<{ control: boolean; meta: boolean; alt: boolean }> = {}) => ({
  type: 'keyDown',
  key: k,
  control: true,
  meta: false,
  alt: false,
  ...mods,
})

describe('stepZoom', () => {
  it('steps by 10 % within 50-200 % without float noise', () => {
    expect(stepZoom(1, 'in')).toBe(1.1)
    expect(stepZoom(0.8, 'out')).toBe(0.7)
    expect(stepZoom(2, 'in')).toBe(2)
    expect(stepZoom(0.5, 'out')).toBe(0.5)
    expect(stepZoom(0.7, 'reset')).toBe(1)
    expect(clampZoom(0.30000000000000004 + 0.6)).toBe(0.9)
  })
})

describe('zoomKey', () => {
  it('maps Ctrl+Plus, Ctrl+=, Ctrl+Minus and Ctrl+0', () => {
    expect(zoomKey(key('+'))).toBe('in')
    expect(zoomKey(key('='))).toBe('in')
    expect(zoomKey(key('-'))).toBe('out')
    expect(zoomKey(key('0'))).toBe('reset')
  })

  it('leaves plain keys, Alt combinations and key-ups alone', () => {
    expect(zoomKey(key('0', { control: false }))).toBeUndefined()
    expect(zoomKey(key('-', { alt: true }))).toBeUndefined()
    expect(zoomKey({ ...key('+'), type: 'keyUp' })).toBeUndefined()
    expect(zoomKey(key('k'))).toBeUndefined()
  })
})
