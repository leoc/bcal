import { existsSync, type FSWatcher, watch } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { parse } from 'yaml'
import type { Config, Person, ViewName } from '../shared/types'

export const configPath =
  process.env.BCAL_CONFIG ?? join(homedir(), '.config', 'bcal', 'config.yml')

const views: ViewName[] = ['week', 'month', 'day', 'agenda']

export const defaultConfig: Config = {
  startView: 'week',
  groups: [],
  hidden: [],
  keymap: {},
  defaultDuration: 60,
}

// Written on first start so the options are discoverable.
const template = `# bcal configuration, reloaded on save.

# week | month | day | agenda
startView: week

# Sidebar groups, in order; the order assigns the keys 1-9 (0 shows all).
# A group's key shows only that group, except for groups with toggle: true,
# whose key switches them on or off on top of whatever is shown. Calendars
# are matched by display name, collection name or <account>/<collection>;
# calendars in no group end up under "Weitere".
groups:
  - name: Arbeit
    calendars:
      [Work, Team]
  - name: Privat
    calendars: [Personal, Family]
  - name: Sonstiges
    toggle: true
    calendars: [Birthdays, Holidays]

# Hidden until toggled on in the app.
hidden: [Birthdays, Holidays]

# New events (n, Ctrl+K). The calendar is matched like in groups; "#name" in
# the line picks another one. Alarm in minutes before start (remove for none).
defaultCalendar: Personal
defaultDuration: 60
defaultAlarm: 15
# Invites go out from this address when a line names people (@Simon).
organizer: { name: Arthur Andersen, email: arthur@example.org }

# Key overrides: <key>: <action>. Actions: prev, next, today, view:week,
# view:month, view:day, view:list, focus:next, focus:prev, details, open-link,
# goto, search, toggle:sidebar, incognito, groups:all, group:<n> (0-based),
# help, close, none (unbind).
keymap: {}
`

export async function loadConfig(): Promise<Config> {
  if (!existsSync(configPath)) {
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(configPath, template)
  }
  try {
    return normalize(parse(await readFile(configPath, 'utf8')))
  } catch (error) {
    console.warn(`bcal: cannot read ${configPath}:`, error)
    return defaultConfig
  }
}

export function normalize(raw: unknown): Config {
  const data = (raw ?? {}) as Partial<Record<keyof Config, unknown>>
  const strings = (value: unknown) =>
    Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []
  return {
    startView: views.includes(data.startView as ViewName)
      ? (data.startView as ViewName)
      : defaultConfig.startView,
    groups: Array.isArray(data.groups)
      ? data.groups
          .filter((g) => g && typeof g.name === 'string')
          .map((g) => ({
            name: g.name,
            toggle: g.toggle === true,
            calendars: strings(g.calendars),
          }))
      : [],
    hidden: strings(data.hidden),
    keymap:
      data.keymap && typeof data.keymap === 'object'
        ? Object.fromEntries(Object.entries(data.keymap).filter(([, v]) => typeof v === 'string'))
        : {},
    defaultCalendar: typeof data.defaultCalendar === 'string' ? data.defaultCalendar : undefined,
    defaultDuration: positive(data.defaultDuration) ?? defaultConfig.defaultDuration,
    defaultAlarm: data.defaultAlarm === 0 ? 0 : positive(data.defaultAlarm),
    organizer: organizer(data.organizer),
  }
}

/** Watches the directory, since editors replace the file on save. */
export function watchConfig(onChange: () => void): FSWatcher | undefined {
  try {
    let timer: NodeJS.Timeout | undefined
    return watch(dirname(configPath), (_event, file) => {
      if (file !== basename(configPath)) return
      clearTimeout(timer)
      timer = setTimeout(onChange, 200)
    })
  } catch {
    return undefined
  }
}

function positive(value: unknown): number | undefined {
  return typeof value === 'number' && value > 0 ? value : undefined
}

function organizer(value: unknown): Person | undefined {
  if (!value || typeof value !== 'object') return undefined
  const { name, email } = value as Record<string, unknown>
  if (typeof email !== 'string' || !email.includes('@')) return undefined
  return { email, name: typeof name === 'string' ? name : undefined }
}
