import { cp, mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Vdir } from '../src/main/vdir'

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'bcal-'))
  await cp(join(__dirname, 'fixtures/vdir'), join(dir, 'vdir'), { recursive: true })
  const vdir = new Vdir(join(dir, 'vdir'))
  await vdir.load()
  return { dir, vdir }
}

const input = {
  calendarId: 'acc/family',
  title: 'Kaffee',
  start: '2026-10-30T10:00:00',
  end: '2026-10-30T11:00:00',
  allDay: false,
  attendees: [],
}
const week = { start: '2026-10-25T23:00:00.000Z', end: '2026-11-01T23:00:00.000Z' }

describe('Vdir.create / undo', () => {
  it('writes the file and shows the event at once', async () => {
    const { vdir } = await fixture()
    const created = await vdir.create(input, { uid: 'new-1' })
    expect(created.id).toBe('acc/family/new-1/2026-10-30T10:00:00')
    expect(await readFile(created.path, 'utf8')).toContain('SUMMARY:Kaffee')
    expect(vdir.events(week).map((e) => e.id)).toContain(created.id)
  })

  it('moves an undone event to the trash and forgets it', async () => {
    const { dir, vdir } = await fixture()
    const created = await vdir.create(input, { uid: 'new-2' })
    const trash = join(dir, 'trash')
    await vdir.undo(created.path, trash)
    expect((await stat(join(trash, 'acc/family/new-2.ics'))).isFile()).toBe(true)
    await expect(stat(created.path)).rejects.toThrow()
    expect(vdir.events(week).map((e) => e.id)).not.toContain(created.id)
  })

  it('refuses unknown calendars and undo of foreign files', async () => {
    const { vdir } = await fixture()
    await expect(vdir.create({ ...input, calendarId: 'acc/nope' })).rejects.toThrow(
      'unknown calendar',
    )
    await expect(vdir.undo('/etc/passwd')).rejects.toThrow('only events created')
  })
})
