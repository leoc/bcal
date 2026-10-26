import { type CalendarInfo, type Config, matchesCalendar } from '@shared/types'

export interface Group {
  name: string
  calendars: CalendarInfo[]
}

/** Sorts calendars into the configured groups; the rest goes to "Weitere". */
export function arrange(calendars: CalendarInfo[], config: Config): Group[] {
  const placed = new Set<string>()
  const groups: Group[] = config.groups.map((group) => ({
    name: group.name,
    calendars: group.calendars.flatMap((ref) => {
      const calendar = calendars.find((c) => !placed.has(c.id) && matchesCalendar(c, ref))
      if (!calendar) return []
      placed.add(calendar.id)
      return [calendar]
    }),
  }))
  const rest = calendars.filter((c) => !placed.has(c.id))
  if (rest.length) groups.push({ name: groups.length ? 'Weitere' : 'Kalender', calendars: rest })
  return groups.filter((g) => g.calendars.length)
}

/** Explicit toggles from the UI win over `hidden` from the config. */
export type Visibility = Record<string, boolean>

export function isVisible(calendar: CalendarInfo, config: Config, visibility: Visibility) {
  return visibility[calendar.id] ?? !config.hidden.some((ref) => matchesCalendar(calendar, ref))
}
