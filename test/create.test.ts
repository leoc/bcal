import { cp, mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LockedError } from '../src/main/editor'
import { Vdir } from '../src/main/vdir'

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'bcal-'))
  await cp(join(__dirname, 'fixtures/vdir'), join(dir, 'vdir'), { recursive: true })
  const trash = join(dir, 'trash')
  const vdir = new Vdir(join(dir, 'vdir'), trash)
  await vdir.load()
  return { dir, vdir, trash, path: (p: string) => join(dir, 'vdir', p) }
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
const me = { email: 'arthur@example.org' }
const titles = (vdir: Vdir) =>
  vdir
    .events(week)
    .map((e) => `${e.calendarId} ${e.start.slice(0, 10)} ${e.title}`)
    .sort()

describe('Vdir.create / undo', () => {
  it('writes the file and shows the event at once', async () => {
    const { vdir } = await fixture()
    const created = await vdir.create(input, { uid: 'new-1' })
    expect(created.id).toBe('acc/family/new-1/2026-10-30T10:00:00')
    expect(await readFile(created.path, 'utf8')).toContain('SUMMARY:Kaffee')
    expect(vdir.events(week).map((e) => e.id)).toContain(created.id)
  })

  it('moves an undone event to the trash and forgets it', async () => {
    const { vdir, trash } = await fixture()
    const created = await vdir.create(input, { uid: 'new-2' })
    expect(await vdir.undo()).toBe('Neuer Termin')
    expect((await stat(join(trash, 'acc/family/new-2.ics'))).isFile()).toBe(true)
    await expect(stat(created.path)).rejects.toThrow()
    expect(vdir.events(week).map((e) => e.id)).not.toContain(created.id)
    expect(await vdir.undo()).toBeUndefined()
  })

  it('refuses unknown calendars', async () => {
    const { vdir } = await fixture()
    await expect(vdir.create({ ...input, calendarId: 'acc/nope' })).rejects.toThrow(
      'unknown calendar',
    )
  })
})

describe('Vdir.update / remove', () => {
  const birthday = { calendarId: 'acc/family', uid: 'birthday@bcal' }
  const geburtstag = {
    calendarId: 'acc/family',
    title: 'Geburtstag Mia',
    start: '2026-10-29',
    end: '2026-10-30',
    allDay: true,
    attendees: [],
  }

  it('changes an event in place and takes it back', async () => {
    const { vdir, path } = await fixture()
    const before = await readFile(path('acc/family/birthday.ics'), 'utf8')
    const updated = await vdir.update(birthday, geburtstag, 'all', { organizer: me })
    expect(updated.id).toBe('acc/family/birthday@bcal/2026-10-29')
    expect(titles(vdir)).toContain('acc/family 2026-10-29 Geburtstag Mia')
    expect(await vdir.undo()).toBe('Änderung')
    expect(await readFile(path('acc/family/birthday.ics'), 'utf8')).toBe(before)
    expect(titles(vdir)).toContain('acc/family 2026-10-29 Geburtstag')
  })

  it('moves an event to another calendar', async () => {
    const { vdir, path, trash } = await fixture()
    await vdir.update(birthday, { ...geburtstag, calendarId: 'acc/work' }, 'all')
    expect(titles(vdir)).toContain('acc/work 2026-10-29 Geburtstag Mia')
    expect(titles(vdir).some((t) => t.startsWith('acc/family'))).toBe(false)
    expect((await stat(join(trash, 'acc/family/birthday.ics'))).isFile()).toBe(true)
    await vdir.undo()
    expect((await stat(path('acc/family/birthday.ics'))).isFile()).toBe(true)
    await expect(stat(path('acc/work/birthday.ics'))).rejects.toThrow()
  })

  it('moves a series only as a whole to another calendar', async () => {
    const { vdir } = await fixture()
    const standup = {
      calendarId: 'acc/work',
      uid: 'standup@bcal',
      recurrenceId: '2026-10-29T09:30:00',
    }
    await expect(
      vdir.update(
        standup,
        { ...input, start: '2026-10-29T09:30:00', end: '2026-10-29T09:45:00' },
        'this',
      ),
    ).rejects.toThrow('ganze Serie')
  })

  it('refuses events organized by someone else, but deletes them', async () => {
    const { vdir, trash } = await fixture()
    const standup = { calendarId: 'acc/work', uid: 'standup@bcal' }
    await expect(
      vdir.update(standup, { ...input, calendarId: 'acc/work' }, 'all', {
        organizer: { email: 'me@else.org' },
      }),
    ).rejects.toThrow(LockedError)
    await vdir.remove(standup, 'all')
    expect(titles(vdir).some((t) => t.includes('Standup'))).toBe(false)
    expect((await stat(join(trash, 'acc/work/standup.ics'))).isFile()).toBe(true)
    await vdir.undo()
    expect(titles(vdir).filter((t) => t.includes('Standup'))).toHaveLength(4)
  })
})
