import { describe, expect, it } from 'vitest'
import { contrastFor } from '../src/renderer/src/lib/color'
import { formatRrule } from '../src/renderer/src/lib/format'

describe('formatRrule', () => {
  it('summarizes common rules in German', () => {
    expect(formatRrule('FREQ=WEEKLY;BYDAY=MO,WE')).toBe('wöchentlich (Mo, Mi)')
    expect(formatRrule('FREQ=WEEKLY;INTERVAL=2;BYDAY=FR')).toBe('alle 2 Wochen (Fr)')
    expect(formatRrule('FREQ=YEARLY')).toBe('jährlich')
    expect(formatRrule('FREQ=DAILY;UNTIL=20261231T000000Z')).toBe('täglich bis 31.12.2026')
    expect(formatRrule('FREQ=MONTHLY;BYDAY=-1FR;COUNT=3')).toBe('monatlich (Fr), 3×')
  })
})

describe('contrastFor', () => {
  it('uses white on dark and dark on light calendar colors', () => {
    expect(contrastFor('#246F34')).toBe('#ffffff')
    expect(contrastFor('#FFF600')).toBe('#09090b')
    expect(contrastFor('#D6B461')).toBe('#09090b')
    expect(contrastFor(undefined)).toBeUndefined()
  })
})
