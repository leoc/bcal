import { useCalendarController } from '@fullcalendar/react'
import deLocale from '@fullcalendar/react/locales/de'
import type { CalendarEvent, CalendarInfo, Config, DateRange, ViewName } from '@shared/types'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarSidebar } from '@/components/calendar-sidebar'
import { EventCalendar } from '@/components/event-calendar'
import { EventDetails } from '@/components/event-details'
import { GotoDialog } from '@/components/goto-dialog'
import { KeymapHelp } from '@/components/keymap-help'
import { SearchDialog } from '@/components/search-dialog'
import { arrange, isVisible, type Visibility } from '@/lib/calendars'
import { contrastFor } from '@/lib/color'
import { toDate } from '@/lib/format'
import { type Action, buildBindings, resolve } from '@/lib/keymap'

const viewTypes: Record<ViewName, string> = {
  week: 'timeGridWeek',
  month: 'dayGridMonth',
  day: 'timeGridDay',
  agenda: 'listWeek',
}

export function App() {
  const [config, setConfig] = useState<Config>()
  const [visibility, setVisibility] = useState<Visibility>()
  useDarkMode()

  useEffect(() => {
    const load = () => window.api.config().then(setConfig)
    load()
    window.api.visibility().then(setVisibility)
    return window.api.onConfigChange(load)
  }, [])

  // FullCalendar takes the start view only on mount, so wait for the config.
  return config && visibility ? <Calendar config={config} initialVisibility={visibility} /> : null
}

function Calendar({
  config,
  initialVisibility,
}: {
  config: Config
  initialVisibility: Visibility
}) {
  const controller = useCalendarController()
  const [calendars, setCalendars] = useState<CalendarInfo[]>([])
  const [loaded, setLoaded] = useState<{ range: DateRange; events: CalendarEvent[] }>()
  const [range, setRange] = useState<DateRange>()
  const [visibility, setVisibility] = useState<Visibility>(initialVisibility)
  const [sidebar, setSidebar] = useState(true)
  const [details, setDetails] = useState(true)
  const [help, setHelp] = useState(false)
  const [gotoOpen, setGotoOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [focusedId, setFocusedId] = useState<string>()
  // set when j/k ran off the visible range: focus first/last once the next one loaded
  const [pending, setPending] = useState<{ edge: 'first' | 'last'; from: string }>()
  const [revision, setRevision] = useState(0)

  useEffect(() => window.api.onChange(() => setRevision((r) => r + 1)), [])

  useEffect(() => {
    if (revision >= 0) window.api.calendars().then(setCalendars)
  }, [revision])

  useEffect(() => {
    if (range && revision >= 0)
      window.api.events(range).then((events) => setLoaded({ range, events }))
  }, [range, revision])

  const groups = useMemo(() => arrange(calendars, config), [calendars, config])
  const ordered = useMemo(() => groups.flatMap((g) => g.calendars), [groups])
  const byId = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars])
  const bindings = useMemo(() => buildBindings(config.keymap), [config.keymap])
  const visible = useCallback(
    (calendar: CalendarInfo) => isVisible(calendar, config, visibility),
    [config, visibility],
  )

  /** visible events in chronological order, the order j/k walks */
  const shown = useMemo(() => {
    const rank = new Map(ordered.map((c, i) => [c.id, i]))
    return (loaded?.events ?? [])
      .filter((e) => {
        const calendar = byId.get(e.calendarId)
        return calendar !== undefined && visible(calendar)
      })
      .sort(
        (a, b) =>
          toDate(a.start).getTime() - toDate(b.start).getTime() ||
          Number(b.allDay) - Number(a.allDay) ||
          (rank.get(a.calendarId) ?? 0) - (rank.get(b.calendarId) ?? 0),
      )
  }, [loaded, byId, visible, ordered])

  const focused = shown.find((e) => e.id === focusedId)

  useEffect(() => {
    if (!pending || !loaded || loaded.range.start === pending.from) return
    setPending(undefined)
    setFocusedId((pending.edge === 'first' ? shown[0] : shown.at(-1))?.id)
  }, [pending, loaded, shown])

  useEffect(() => {
    if (!focusedId) return
    const el = document.querySelector(`[data-bcal-id="${CSS.escape(focusedId)}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focusedId, loaded])

  const toggle = useCallback(
    (calendar: CalendarInfo) =>
      setVisibility((prev) => {
        const next = { ...prev, [calendar.id]: !isVisible(calendar, config, prev) }
        window.api.setVisibility(next)
        return next
      }),
    [config],
  )

  const moveFocus = useCallback(
    (step: 1 | -1) => {
      // before the visible range loaded, an empty list would page away
      if (!loaded || !range || loaded.range.start !== range.start) return
      const index = shown.findIndex((e) => e.id === focusedId)
      if (index === -1 && shown.length) {
        // start next to "now" rather than at the edge of the view
        const now = Date.now()
        const upcoming = shown.findIndex((e) => toDate(e.end).getTime() > now)
        const start = upcoming === -1 ? shown.length - (step > 0 ? 1 : 0) : upcoming
        setFocusedId(shown[step > 0 ? start : Math.max(start - 1, 0)]?.id)
        return
      }
      const target = shown[index + step]
      if (target) {
        setFocusedId(target.id)
      } else if (range) {
        setPending({ edge: step > 0 ? 'first' : 'last', from: range.start })
        if (step > 0) controller.next()
        else controller.prev()
      }
    },
    [shown, focusedId, range, loaded, controller],
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
      else if (action === 'focus:next') moveFocus(1)
      else if (action === 'focus:prev') moveFocus(-1)
      else if (action === 'details') setDetails((d) => !d)
      else if (action === 'open-link') {
        const link = focused?.links[0]
        if (link) window.api.openLink(link)
      } else if (action === 'goto') setGotoOpen(true)
      else if (action === 'search') setSearchOpen(true)
      else if (action === 'toggle:sidebar') setSidebar((s) => !s)
      else if (action === 'help') setHelp((h) => !h)
      else if (action === 'close') {
        if (help) setHelp(false)
        else setFocusedId(undefined)
      } else if (action.startsWith('toggle:calendar:')) {
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
  }, [controller, ordered, toggle, bindings, moveFocus, focused, help])

  const calendarEvents = useMemo(
    () =>
      shown.map((e) => {
        const color = byId.get(e.calendarId)?.color
        return {
          id: e.id,
          title: e.title,
          start: e.start,
          end: e.end,
          allDay: e.allDay,
          color,
          contrastColor: contrastFor(color),
          className: e.id === focusedId ? 'bcal-focused' : undefined,
        }
      }),
    [shown, byId, focusedId],
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
          events={calendarEvents}
          eventDidMount={(info) => {
            info.el.dataset.bcalId = info.event.id
          }}
          eventClick={(info) => {
            setFocusedId(info.event.id)
            setDetails(true)
          }}
          datesSet={(info) =>
            setRange({ start: info.start.toISOString(), end: info.end.toISOString() })
          }
        />
      </main>
      {details && (
        <EventDetails
          event={focused}
          calendar={focused && byId.get(focused.calendarId)}
          onOpenLink={(url) => window.api.openLink(url)}
        />
      )}
      <SearchDialog
        open={searchOpen}
        calendars={byId}
        onSelect={(event) => {
          const calendar = byId.get(event.calendarId)
          if (calendar && !visible(calendar)) toggle(calendar)
          controller.gotoDate(toDate(event.start))
          setFocusedId(event.id)
          setDetails(true)
        }}
        onClose={() => setSearchOpen(false)}
      />
      <GotoDialog
        open={gotoOpen}
        current={controller.getDate() ?? new Date()}
        onGoto={(date) => controller.gotoDate(date)}
        onClose={() => setGotoOpen(false)}
      />
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
