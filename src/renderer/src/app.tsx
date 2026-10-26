import { useCalendarController } from '@fullcalendar/react'
import deLocale from '@fullcalendar/react/locales/de'
import type { CalendarEvent, CalendarInfo, Config, DateRange, ViewName } from '@shared/types'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarSidebar } from '@/components/calendar-sidebar'
import { EventCalendar } from '@/components/event-calendar'
import { KeymapHelp } from '@/components/keymap-help'
import { arrange, isVisible, type Visibility } from '@/lib/calendars'
import { type Action, buildBindings, resolve } from '@/lib/keymap'

const viewTypes: Record<ViewName, string> = {
  week: 'timeGridWeek',
  month: 'dayGridMonth',
  day: 'timeGridDay',
  agenda: 'listWeek',
}
const VISIBILITY_KEY = 'bcal.visibility'

export function App() {
  const [config, setConfig] = useState<Config>()
  useDarkMode()

  useEffect(() => {
    const load = () => window.api.config().then(setConfig)
    load()
    return window.api.onConfigChange(load)
  }, [])

  // FullCalendar takes the start view only on mount, so wait for the config.
  return config ? <Calendar config={config} /> : null
}

function Calendar({ config }: { config: Config }) {
  const controller = useCalendarController()
  const [calendars, setCalendars] = useState<CalendarInfo[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [range, setRange] = useState<DateRange>()
  const [visibility, setVisibility] = useState<Visibility>(loadVisibility)
  const [sidebar, setSidebar] = useState(true)
  const [help, setHelp] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => window.api.onChange(() => setRevision((r) => r + 1)), [])

  useEffect(() => {
    window.api.calendars().then(setCalendars)
  }, [revision])

  useEffect(() => {
    if (range) window.api.events(range).then(setEvents)
  }, [range, revision])

  const groups = useMemo(() => arrange(calendars, config), [calendars, config])
  const ordered = useMemo(() => groups.flatMap((g) => g.calendars), [groups])
  const bindings = useMemo(() => buildBindings(config.keymap), [config.keymap])
  const visible = useCallback(
    (calendar: CalendarInfo) => isVisible(calendar, config, visibility),
    [config, visibility],
  )

  const toggle = useCallback(
    (calendar: CalendarInfo) =>
      setVisibility((prev) => {
        const next = { ...prev, [calendar.id]: !isVisible(calendar, config, prev) }
        saveVisibility(next)
        return next
      }),
    [config],
  )

  useEffect(() => {
    const run = (action: Action) => {
      if (action === 'prev') controller.prev()
      else if (action === 'next') controller.next()
      else if (action === 'today') controller.today()
      else if (action === 'view:week') controller.changeView(viewTypes.week)
      else if (action === 'view:month') controller.changeView(viewTypes.month)
      else if (action === 'view:day') controller.changeView(viewTypes.day)
      else if (action === 'view:list') controller.changeView(viewTypes.agenda)
      else if (action === 'toggle:sidebar') setSidebar((s) => !s)
      else if (action === 'help') setHelp((h) => !h)
      else if (action === 'close') setHelp(false)
      else if (action.startsWith('toggle:calendar:')) {
        const calendar = ordered[Number(action.split(':')[2])]
        if (calendar) toggle(calendar)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      const action = resolve(bindings, event)
      if (!action) return
      event.preventDefault()
      run(action)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [controller, ordered, toggle, bindings])

  const byId = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars])
  const visibleEvents = useMemo(
    () =>
      events.flatMap((e) => {
        const calendar = byId.get(e.calendarId)
        if (!calendar || !visible(calendar)) return []
        return [
          {
            id: e.id,
            title: e.title,
            start: e.start,
            end: e.end,
            allDay: e.allDay,
            color: calendar.color,
            extendedProps: { location: e.location, calendarId: e.calendarId },
          },
        ]
      }),
    [events, byId, visible],
  )

  return (
    <div className="flex h-full">
      {sidebar && <CalendarSidebar groups={groups} visible={visible} onToggle={toggle} />}
      <main className="min-w-0 flex-1">
        <EventCalendar
          className="h-full"
          controller={controller}
          availableViews={Object.values(viewTypes)}
          initialView={viewTypes[config.startView]}
          borderless
          height="100%"
          locale={deLocale}
          firstDay={1}
          nowIndicator
          navLinks
          weekNumbers
          scrollTime="07:30:00"
          events={visibleEvents}
          datesSet={(info) =>
            setRange({ start: info.start.toISOString(), end: info.end.toISOString() })
          }
        />
      </main>
      {help && <KeymapHelp bindings={bindings} onClose={() => setHelp(false)} />}
    </div>
  )
}

function useDarkMode() {
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.classList.toggle('dark', query.matches)
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [])
}

function loadVisibility(): Visibility {
  try {
    return JSON.parse(localStorage.getItem(VISIBILITY_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function saveVisibility(visibility: Visibility) {
  try {
    localStorage.setItem(VISIBILITY_KEY, JSON.stringify(visibility))
  } catch {
    // only a convenience
  }
}
