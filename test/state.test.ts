import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { State } from '../src/main/state'

describe('State', () => {
  it('falls back when missing and round-trips values', async () => {
    const dir = join(await mkdtemp(join(tmpdir(), 'bcal-')), 'nested')
    const state = new State<Record<string, boolean>>(dir, 'visibility', {})
    expect(await state.read()).toEqual({})
    await state.write({ 'acc/work': false })
    expect(await state.read()).toEqual({ 'acc/work': false })
  })
})
