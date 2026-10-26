import { describe, expect, it } from 'vitest'
import { arrange, isVisible, pressGroup, showAll } from '../src/renderer/src/lib/calendars'
import type { CalendarInfo, Config } from '../src/shared/types'

const cal = (id: string, name = id): CalendarInfo => ({
  id: `acc/${id}`,
  account: 'acc',
  name,
  eventCount: 0,
})
const calendars = [cal('work'), cal('office'), cal('family'), cal('bday', 'birthdays'), cal('misc')]
const config: Config = {
  startView: 'week',
  groups: [
    { name: 'Arbeit', toggle: false, calendars: ['work', 'office'] },
    { name: 'Privat', toggle: false, calendars: ['family'] },
    { name: 'Sonstiges', toggle: true, calendars: ['birthdays'] },
  ],
  hidden: ['birthdays'],
  keymap: {},
  defaultDuration: 60,
}
const groups = arrange(calendars, config)
const shown = (v: Record<string, boolean>) =>
  calendars.filter((c) => isVisible(c, config, v)).map((c) => c.id.slice(4))

describe('arrange', () => {
  it('keeps config order and collects the rest under Weitere', () => {
    expect(groups.map((g) => [g.name, g.toggle, g.calendars.map((c) => c.name)])).toEqual([
      ['Arbeit', false, ['work', 'office']],
      ['Privat', false, ['family']],
      ['Sonstiges', true, ['birthdays']],
      ['Weitere', false, ['misc']],
    ])
  })
})

describe('group keys', () => {
  const visible = (v: Record<string, boolean>) => (c: CalendarInfo) => isVisible(c, config, v)

  it('0 shows really everything', () => {
    expect(shown(showAll(groups))).toEqual(['work', 'office', 'family', 'bday', 'misc'])
  })

  it('a regular group is shown alone, add-on groups keep their state', () => {
    expect(shown(pressGroup(groups, 0, visible({})))).toEqual(['work', 'office'])
    const withBirthdays = { 'acc/bday': true }
    expect(shown(pressGroup(groups, 1, visible(withBirthdays)))).toEqual(['family', 'bday'])
  })

  it('an add-on group switches on and off', () => {
    const on = pressGroup(groups, 2, visible({}))
    expect(shown(on)).toEqual(['work', 'office', 'family', 'bday', 'misc'])
    expect(shown(pressGroup(groups, 2, visible(on)))).toEqual(['work', 'office', 'family', 'misc'])
  })
})
