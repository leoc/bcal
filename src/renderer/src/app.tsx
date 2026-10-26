import { useCalendarController } from '@fullcalendar/react'
import deLocale from '@fullcalendar/react/locales/de'
import type { CalendarEvent, CalendarInfo, DateRange } from '@shared/types'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarSidebar } from '@/components/calendar-sidebar'
import { EventCalendar } from '@/components/event-calendar'
import { KeymapHelp } from '@/components/keymap-help'
import { type Action, defaultBindings, resolve } from '@/lib/keymap'

const views = ['timeGridWeek', 'dayGridMonth', 'timeGridDay', 'listWeek']
const HIDDEN_KEY = 'bcal.hiddenCalendars'

export function App() {
  const controller = useCalendarController()
  const [calendars, setCalendars] = useState<CalendarInfo[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [range, setRange] = useState<DateRange>()
  const [hidden, setHidden] = useState<Set<string>>(loadHidden)
  const [sidebar, setSidebar] = useState(true)
  const [help, setHelp] = useState(false)
  const [revision, setRevision] = useState(0)

  useDarkMode()

  useEffect(() => window.api.onChange(() => setRevision((r) => r + 1)), [])

  useEffect(() => {
    window.api.calendars().then(setCalendars)
  }, [revision])

  useEffect(() => {
    if (range) window.api.events(range).then(setEvents)
  }, [range, revision])

  const toggle = useCallback((id: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      saveHidden(next)
      return next
    })
  }, [])

  useEffect(() => {
    const run = (action: Action) => {
      if (action === 'prev') controller.prev()
      else if (action === 'next') controller.next()
      else if (action === 'today') controller.today()
      else if (action === 'view:week') controller.changeView('timeGridWeek')
      else if (action === 'view:month') controller.changeView('dayGridMonth')
      else if (action === 'view:day') controller.changeView('timeGridDay')
      else if (action === 'view:list') controller.changeView('listWeek')
      else if (action === 'toggle:sidebar') setSidebar((s) => !s)
      else if (action === 'help') setHelp((h) => !h)
      else if (action === 'close') setHelp(false)
      else if (action.startsWith('toggle:calendar:')) {
        const calendar = calendars[Number(action.split(':')[2])]
        if (calendar) toggle(calendar.id)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      const action = resolve(defaultBindings, event)
      if (!action) return
      event.preventDefault()
      run(action)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [controller, calendars, toggle])

  const colors = useMemo(() => new Map(calendars.map((c) => [c.id, c.color])), [calendars])
  const visibleEvents = useMemo(
    () =>
      events
        .filter((e) => !hidden.has(e.calendarId))
        .map((e) => ({
          id: e.id,
          title: e.title,
          start: e.start,
          end: e.end,
          allDay: e.allDay,
          color: colors.get(e.calendarId),
          extendedProps: { location: e.location, calendarId: e.calendarId },
        })),
    [events, hidden, colors],
  )

  return (
    <div className="flex h-full">
      {sidebar && <CalendarSidebar calendars={calendars} hidden={hidden} onToggle={toggle} />}
      <main className="min-w-0 flex-1">
        <EventCalendar
          className="h-full"
          controller={controller}
          availableViews={views}
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
      {help && <KeymapHelp bindings={defaultBindings} onClose={() => setHelp(false)} />}
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

function loadHidden(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}

function saveHidden(hidden: Set<string>) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]))
  } catch {
    // only a convenience
  }
}
