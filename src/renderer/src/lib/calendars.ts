import { type CalendarInfo, type Config, matchesCalendar } from '@shared/types'

export interface Group {
  name: string
  /** add-on group: its key switches it on/off instead of showing it alone */
  toggle: boolean
  calendars: CalendarInfo[]
}

/** Sorts calendars into the configured groups; the rest goes to "Weitere". */
export function arrange(calendars: CalendarInfo[], config: Config): Group[] {
  const placed = new Set<string>()
  const groups: Group[] = config.groups.map((group) => ({
    name: group.name,
    toggle: group.toggle,
    calendars: group.calendars.flatMap((ref) => {
      const calendar = calendars.find((c) => !placed.has(c.id) && matchesCalendar(c, ref))
      if (!calendar) return []
      placed.add(calendar.id)
      return [calendar]
    }),
  }))
  const rest = calendars.filter((c) => !placed.has(c.id))
  if (rest.length) {
    groups.push({ name: groups.length ? 'Weitere' : 'Kalender', toggle: false, calendars: rest })
  }
  return groups.filter((g) => g.calendars.length)
}

/** Explicit toggles from the UI win over `hidden` from the config. */
export type Visibility = Record<string, boolean>

export function isVisible(calendar: CalendarInfo, config: Config, visibility: Visibility) {
  return visibility[calendar.id] ?? !config.hidden.some((ref) => matchesCalendar(calendar, ref))
}

type IsVisible = (calendar: CalendarInfo) => boolean

function set(groups: Group[], show: (group: Group, calendar: CalendarInfo) => boolean) {
  return Object.fromEntries(
    groups.flatMap((g) => g.calendars.map((c) => [c.id, show(g, c)] as const)),
  )
}

/** Key 0: every calendar, add-on groups included. */
export function showAll(groups: Group[]): Visibility {
  return set(groups, () => true)
}

/**
 * Key 1-9: a regular group is shown alone (add-on groups keep their state),
 * an add-on group is switched on, or off if any of its calendars is on.
 */
export function pressGroup(groups: Group[], index: number, visible: IsVisible): Visibility {
  const target = groups[index]
  if (!target) return set(groups, (_, c) => visible(c))
  if (target.toggle) {
    const on = !target.calendars.some(visible)
    return set(groups, (g, c) => (g === target ? on : visible(c)))
  }
  return set(groups, (g, c) => (g.toggle ? visible(c) : g === target))
}
