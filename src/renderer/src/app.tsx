import { useCalendarController } from '@fullcalendar/react'
import deLocale from '@fullcalendar/react/locales/de'
import type {
  CalendarEvent,
  CalendarInfo,
  Config,
  DateRange,
  EventInput,
  ImportDecision,
  ImportPlan,
  Person,
  Place,
  Scope,
  ViewName,
} from '@shared/types'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarSidebar } from '@/components/calendar-sidebar'
import { Choice, type ChoiceOption } from '@/components/choice'
import { CommandPalette, type PaletteMode } from '@/components/command-palette'
import { EventCalendar } from '@/components/event-calendar'
import { EventDetails } from '@/components/event-details'
import { ImportDialog } from '@/components/import-dialog'
import { KeymapHelp } from '@/components/keymap-help'
import { arrange, isVisible, pressGroup, showAll, type Visibility } from '@/lib/calendars'
import { contrastFor } from '@/lib/color'
import {
  buildDraft,
  DRAFT_ID,
  draftAsEvent,
  handleFor,
  pickCalendar,
  placeAddress,
  toNewEvent,
} from '@/lib/draft'
import { editLine, isLocked, movedInput, toEditInput } from '@/lib/edit'
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
  // hides titles and details, e.g. for screen sharing; not persisted
  const [incognito, setIncognito] = useState(false)
  const [focusedId, setFocusedId] = useState<string>()
  // set when j/k ran off the visible range: focus first/last once the next one loaded
  const [pending, setPending] = useState<{ edge: 'first' | 'last'; from: string }>()
  const [revision, setRevision] = useState(0)

  // palette and the draft typed in it
  const [palette, setPalette] = useState<PaletteMode>()
  const [line, setLine] = useState('')
  const [chosen, setChosen] = useState<Record<string, Person>>({})
  const [chosenPlaces, setChosenPlaces] = useState<Record<string, Place>>({})
  // the place highlighted in the palette, previewed on the panel's map
  const [previewPlace, setPreviewPlace] = useState<Place>()
  const [videoCode, setVideoCode] = useState(newVideoCode)
  // the draft stays after Enter until saved or discarded
  const [draftActive, setDraftActive] = useState(false)
  // the event the line edits; unset while creating a new one
  const [editing, setEditing] = useState<CalendarEvent>()
  // a question in place of the palette: series scope, delete confirmation
  const [choice, setChoice] = useState<{
    title: string
    note?: string
    options: ChoiceOption[]
    onPick: (id: string) => void
    onCancel?: () => void
  }>()
  // opened .ics files, one event after the other; the target colors the preview
  const [imports, setImports] = useState<ImportPlan[]>([])
  const [importIndex, setImportIndex] = useState(0)
  const [importTarget, setImportTarget] = useState<string>()
  const [canUndo, setCanUndo] = useState(false)
  const [toast, setToast] = useState<string>()

  useEffect(() => window.api.onChange(() => setRevision((r) => r + 1)), [])

  useEffect(() => {
    const take = () =>
      window.api.takeImports().then((plans) => {
        for (const plan of plans.filter((p) => p.error)) setToast(`${plan.name}: ${plan.error}`)
        const usable = plans.filter((p) => !p.error && p.items.length)
        if (usable.length) setImports((queue) => [...queue, ...usable])
      })
    take()
    return window.api.onImport(take)
  }, [])

  useEffect(() => {
    if (revision >= 0) window.api.calendars().then(setCalendars)
  }, [revision])

  useEffect(() => {
    if (range && revision >= 0)
      window.api.events(range).then((events) => setLoaded({ range, events }))
  }, [range, revision])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(undefined), 6000)
    return () => clearTimeout(timer)
  }, [toast])

  const groups = useMemo(() => arrange(calendars, config), [calendars, config])
  const ordered = useMemo(() => groups.flatMap((g) => g.calendars), [groups])
  const byId = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars])
  const bindings = useMemo(() => buildBindings(config.keymap), [config.keymap])
  const visible = useCallback(
    (calendar: CalendarInfo) => isVisible(calendar, config, visibility),
    [config, visibility],
  )

  const draft = useMemo(
    () =>
      line.trim() && calendars.length
        ? buildDraft(line, {
            calendars,
            config,
            chosen,
            places: chosenPlaces,
            videoCode,
            calendarId: editing?.calendarId,
          })
        : undefined,
    [line, calendars, config, chosen, chosenPlaces, videoCode, editing],
  )
  // in the mixed palette only lines that read like an event become a draft
  const lineOpen = palette === 'create' || (palette === 'all' && Boolean(draft?.quick.explicit))
  const draftEvent = useMemo(
    () => (draft && (draftActive || lineOpen) ? draftAsEvent(draft, config) : undefined),
    [draft, draftActive, lineOpen, config],
  )

  // move the calendar behind the palette to where the draft lands
  useEffect(() => {
    if (!draftEvent || !range) return
    const start = toDate(draftEvent.start)
    if (start >= new Date(range.start) && start < new Date(range.end)) return
    const timer = setTimeout(() => controller.gotoDate(start), 250)
    return () => clearTimeout(timer)
  }, [draftEvent, range, controller])

  /** visible events in chronological order, the order j/k walks */
  const shown = useMemo(() => {
    const rank = new Map(ordered.map((c, i) => [c.id, i]))
    return (
      (loaded?.events ?? [])
        .filter((e) => {
          const calendar = byId.get(e.calendarId)
          return calendar !== undefined && visible(calendar)
        })
        // while edited, the draft stands in for the event
        .filter((e) => !(draftEvent && editing && e.id === editing.id))
        .sort(
          (a, b) =>
            toDate(a.start).getTime() - toDate(b.start).getTime() ||
            Number(b.allDay) - Number(a.allDay) ||
            (rank.get(a.calendarId) ?? 0) - (rank.get(b.calendarId) ?? 0),
        )
    )
  }, [loaded, byId, visible, ordered, draftEvent, editing])

  const focused = shown.find((e) => e.id === focusedId)

  const importing = imports[0]
  const importItem = importing?.items[importIndex]
  // the incoming event, dashed like a draft; a cancellation points at the copy instead
  const importEvent = useMemo(
    () =>
      importItem && importItem.kind !== 'cancel' && importItem.kind !== 'gone'
        ? {
            ...importItem.event,
            id: DRAFT_ID,
            calendarId: importTarget ?? importItem.event.calendarId,
          }
        : undefined,
    [importItem, importTarget],
  )
  // the default calendar first
  const importTargets = useMemo(() => {
    const first = pickCalendar(undefined, ordered, config)
    return first ? [first, ...ordered.filter((c) => c.id !== first.id)] : ordered
  }, [ordered, config])

  useEffect(() => {
    if (!importItem) return
    controller.gotoDate(toDate(importItem.event.start))
    if (importItem.kind === 'cancel' && importItem.existing) setFocusedId(importItem.existing.id)
  }, [importItem, controller])

  const nextImport = useCallback(() => {
    setImportTarget(undefined)
    if (importing && importIndex + 1 < importing.items.length) setImportIndex(importIndex + 1)
    else {
      setImportIndex(0)
      setImports((queue) => queue.slice(1))
    }
  }, [importing, importIndex])

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

  const updateVisibility = useCallback(
    (change: (prev: Visibility, visibleIn: (c: CalendarInfo) => boolean) => Visibility) =>
      setVisibility((prev) => {
        const next = change(prev, (c) => isVisible(c, config, prev))
        window.api.setVisibility(next)
        return next
      }),
    [config],
  )

  const toggle = useCallback(
    (calendar: CalendarInfo) =>
      updateVisibility((prev, visibleIn) => ({ ...prev, [calendar.id]: !visibleIn(calendar) })),
    [updateVisibility],
  )

  const discardDraft = useCallback(() => {
    setLine('')
    setChosen({})
    setChosenPlaces({})
    setDraftActive(false)
    setEditing(undefined)
    setVideoCode(newVideoCode())
  }, [])

  const closePalette = useCallback(() => {
    setPalette(undefined)
    // a line that never became a draft is thrown away
    if (!draftActive) discardDraft()
  }, [draftActive, discardDraft])

  /** For a series asks which occurrences `act` applies to; others go straight to `all`. */
  const withScope = useCallback(
    (
      event: CalendarEvent,
      verb: { title: string; destructive?: boolean; note?: string },
      act: (scope: Scope) => void,
      onCancel?: () => void,
    ) => {
      if (!event.rrule) return act('all')
      setChoice({
        title: verb.title,
        note: verb.note,
        options: [
          { id: 'this', label: 'Nur dieser Termin', destructive: verb.destructive },
          { id: 'following', label: 'Dieser und alle folgenden', destructive: verb.destructive },
          { id: 'all', label: 'Alle Termine der Serie', destructive: verb.destructive },
        ],
        onPick: (id) => {
          setChoice(undefined)
          act(id as Scope)
        },
        onCancel: () => {
          setChoice(undefined)
          onCancel?.()
        },
      })
    },
    [],
  )

  /** Writes a change to `event`; `revert` undoes a drag on failure or cancel. */
  const update = useCallback(
    (event: CalendarEvent, input: EventInput, revert?: () => void) =>
      withScope(
        event,
        { title: `„${incognito ? 'Termin' : event.title}“ ändern` },
        async (scope) => {
          try {
            const updated = await window.api.update(
              { calendarId: event.calendarId, uid: event.uid, recurrenceId: event.recurrenceId },
              input,
              scope,
            )
            const calendar = byId.get(input.calendarId)
            if (calendar && !visible(calendar)) toggle(calendar)
            discardDraft()
            setPalette(undefined)
            setCanUndo(true)
            setFocusedId(updated.id)
            setToast('Geändert · u zurücknehmen')
          } catch (error) {
            revert?.()
            setToast(`Ändern fehlgeschlagen: ${reason(error)}`)
          }
        },
        revert,
      ),
    [withScope, incognito, byId, visible, toggle, discardDraft],
  )

  const save = useCallback(async () => {
    if (!draft) return
    if (editing) {
      const input = toEditInput(draft, editing, config)
      if (input) update(editing, input)
      return
    }
    const input = toNewEvent(draft, config)
    if (!input) return
    try {
      const created = await window.api.create(input)
      const calendar = byId.get(input.calendarId)
      if (calendar && !visible(calendar)) toggle(calendar)
      discardDraft()
      setPalette(undefined)
      setCanUndo(true)
      setFocusedId(created.id)
      setDetails(true)
      controller.gotoDate(draft.quick.start)
      const invited = input.attendees.filter((a) => a.email).length
      setToast(
        `Gespeichert${invited ? ` · Einladung an ${invited} ${invited === 1 ? 'Person' : 'Personen'}` : ''} · u zurücknehmen`,
      )
    } catch (error) {
      setToast(`Speichern fehlgeschlagen: ${reason(error)}`)
    }
  }, [draft, editing, update, config, byId, visible, toggle, discardDraft, controller])

  /** `e`: the focused event becomes the line, as if typed. */
  const startEdit = useCallback(
    (event: CalendarEvent) => {
      if (isLocked(event, config)) {
        setToast(
          `Organisiert von ${event.organizer?.name ?? event.organizer?.email}: nur löschen möglich (D)`,
        )
        return
      }
      const { line: next, chosen: people, places } = editLine(event, config)
      setEditing(event)
      setLine(next)
      setChosen(people)
      setChosenPlaces(places)
      setDraftActive(false)
      setPalette('create')
    },
    [config],
  )

  const remove = useCallback(
    (event: CalendarEvent) => {
      const title = incognito ? 'Termin' : event.title
      const note = isLocked(event, config)
        ? 'Du organisierst ihn nicht: er verschwindet nur aus deinem Kalender.'
        : event.attendees.some((a) => a.email && a.email !== config.organizer?.email)
          ? 'Die Teilnehmer bekommen eine Absage.'
          : undefined
      const act = async (scope: Scope) => {
        try {
          await window.api.remove(
            { calendarId: event.calendarId, uid: event.uid, recurrenceId: event.recurrenceId },
            scope,
          )
          setCanUndo(true)
          setFocusedId(undefined)
          setToast('Gelöscht · u zurücknehmen')
        } catch (error) {
          setToast(`Löschen fehlgeschlagen: ${reason(error)}`)
        }
      }
      if (event.rrule) {
        withScope(event, { title: `„${title}“ löschen`, destructive: true, note }, act)
        return
      }
      setChoice({
        title: `„${title}“ löschen?`,
        note,
        options: [{ id: 'all', label: 'Löschen', destructive: true }],
        onPick: () => {
          setChoice(undefined)
          act('all')
        },
        onCancel: () => setChoice(undefined),
      })
    },
    [incognito, config, withScope],
  )

  const undo = useCallback(async () => {
    try {
      const undone = await window.api.undo()
      setToast(undone ? `Zurückgenommen: ${undone}` : 'Nichts zum Zurücknehmen')
      if (!undone) setCanUndo(false)
    } catch (error) {
      setToast(`Zurücknehmen fehlgeschlagen: ${reason(error)}`)
    }
  }, [])

  const applyImport = useCallback(
    async (decision: ImportDecision) => {
      if (!importing || !importItem) return
      try {
        const created = await window.api.applyImport(importing.id, [decision])
        const calendar = decision.calendarId ? byId.get(decision.calendarId) : undefined
        if (calendar && !visible(calendar)) toggle(calendar)
        setCanUndo(true)
        setFocusedId(importItem.kind === 'cancel' ? undefined : created?.id)
        setDetails(true)
        const done =
          importItem.kind === 'cancel'
            ? 'Gelöscht'
            : importItem.kind === 'new'
              ? `Hinzugefügt${calendar ? ` in ${calendar.name}` : ''}`
              : 'Aktualisiert'
        const removed = decision.remove.length
        const along = removed ? ` · ${removed} abgelöste${removed === 1 ? 'r' : ''} gelöscht` : ''
        setToast(`${done}${along} · u zurücknehmen`)
        nextImport()
      } catch (error) {
        setToast(`Import fehlgeschlagen: ${reason(error)}`)
      }
    },
    [importing, importItem, byId, visible, toggle, nextImport],
  )

  /** A dragged or resized event: FullCalendar already shows it there. */
  const onMoved = useCallback(
    (info: {
      event: { id: string; start: Date | null; end: Date | null; allDay: boolean }
      revert: () => void
    }) => {
      const event = shown.find((e) => e.id === info.event.id)
      if (!event || !info.event.start || isLocked(event, config)) return info.revert()
      update(
        event,
        movedInput(event, info.event.start, info.event.end, info.event.allDay),
        info.revert,
      )
    },
    [shown, config, update],
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

  const run = useCallback(
    (action: Action) => {
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
        const link = (draftEvent ?? focused)?.links[0]
        if (link) window.api.openLink(link)
      } else if (action === 'palette') setPalette('all')
      else if (action === 'new') {
        // a fresh line, unless a draft waits for more
        if (editing && !draftActive) discardDraft()
        setPalette('create')
      } else if (action === 'edit-draft') {
        if (draftActive) setPalette('create')
        else if (focused) startEdit(focused)
      } else if (action === 'delete' && focused && !draftEvent) remove(focused)
      else if (action === 'command') setPalette('command')
      else if (action === 'goto') setPalette('goto')
      else if (action === 'search') setPalette('search')
      else if (action === 'save' && draftActive) save()
      else if (action === 'undo') undo()
      else if (action === 'toggle:sidebar') setSidebar((s) => !s)
      else if (action === 'help') setHelp((h) => !h)
      else if (action === 'close') {
        if (help) setHelp(false)
        else if (draftActive) discardDraft()
        else setFocusedId(undefined)
      } else if (action === 'incognito') setIncognito((i) => !i)
      else if (action === 'groups:all') updateVisibility(() => showAll(groups))
      else if (action.startsWith('group:')) {
        const index = Number(action.split(':')[1])
        updateVisibility((_, visibleIn) => pressGroup(groups, index, visibleIn))
      }
    },
    [
      controller,
      moveFocus,
      draftEvent,
      focused,
      draftActive,
      editing,
      startEdit,
      remove,
      save,
      undo,
      help,
      discardDraft,
      updateVisibility,
      groups,
    ],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = resolve(bindings, event)
      if (!action) return
      event.preventDefault()
      run(action)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [bindings, run])

  const commands = useMemo(() => {
    const keyFor = (action: Action) => bindings.find((b) => b.action === action)?.key
    const entries: [Action, string][] = [
      ['new', 'Neuer Termin'],
      ['goto', 'Gehe zu Datum'],
      ['search', 'Termine suchen'],
      ['today', 'Heute'],
      ['view:week', 'Ansicht: Woche'],
      ['view:month', 'Ansicht: Monat'],
      ['view:day', 'Ansicht: Tag'],
      ['view:list', 'Ansicht: Agenda'],
      ['groups:all', 'Alle Kalender zeigen'],
      ['incognito', incognito ? 'Inkognito aus' : 'Inkognito an'],
      ['toggle:sidebar', 'Seitenleiste ein/aus'],
      ['details', 'Details ein/aus'],
      ...(draftActive ? ([['save', 'Entwurf speichern']] as [Action, string][]) : []),
      ...(focused && !draftActive
        ? ([
            ['edit-draft', 'Termin bearbeiten'],
            ['delete', 'Termin löschen'],
          ] as [Action, string][])
        : []),
      ...(canUndo ? ([['undo', 'Letzte Änderung zurücknehmen']] as [Action, string][]) : []),
      ['help', 'Tastenkürzel'],
    ]
    return entries.map(([action, label]) => ({
      id: action,
      label,
      hint: keyFor(action),
      run: () => {
        setPalette(undefined)
        run(action)
      },
    }))
  }, [bindings, run, incognito, draftActive, canUndo, focused])

  const calendarEvents = useMemo(() => {
    const events = shown.map((e) => {
      const color = byId.get(e.calendarId)?.color
      return {
        id: e.id,
        title: incognito ? 'Termin' : e.title,
        start: e.start,
        end: e.end,
        allDay: e.allDay,
        color,
        contrastColor: contrastFor(color),
        className: e.id === focusedId ? 'bcal-focused' : undefined,
        // others' events and hidden titles stay put
        editable: !incognito && !isLocked(e, config),
      }
    })
    const ghost = draftEvent ?? importEvent
    if (ghost) {
      const color = byId.get(ghost.calendarId)?.color
      events.push({
        id: ghost.id,
        title: incognito ? 'Termin' : ghost.title,
        start: ghost.start,
        end: ghost.end,
        allDay: ghost.allDay,
        color,
        contrastColor: contrastFor(color),
        className: 'bcal-draft',
        editable: false,
      })
    }
    return events
  }, [shown, byId, focusedId, incognito, draftEvent, importEvent, config])

  const panelEvent = draftEvent ?? importEvent ?? focused

  return (
    <div className="flex h-full">
      {sidebar && (
        <CalendarSidebar
          groups={groups}
          visible={visible}
          incognito={incognito}
          onToggle={toggle}
        />
      )}
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
            if (info.event.id === DRAFT_ID) return
            setFocusedId(info.event.id)
            setDetails(true)
          }}
          editable
          eventDrop={onMoved}
          eventResize={onMoved}
          datesSet={(info) =>
            setRange({ start: info.start.toISOString(), end: info.end.toISOString() })
          }
        />
      </main>
      {(details || draftEvent || importEvent) && (
        <EventDetails
          event={panelEvent}
          calendar={panelEvent && byId.get(panelEvent.calendarId)}
          draft={draftEvent ? 'draft' : importEvent ? 'import' : undefined}
          place={palette ? previewPlace : undefined}
          incognito={incognito}
          onOpenLink={(url) => window.api.openLink(url)}
        />
      )}
      {palette && !choice && !importItem && (
        <CommandPalette
          mode={palette}
          editing={Boolean(editing)}
          onMode={setPalette}
          line={line}
          onLine={setLine}
          draft={draft}
          draftEvent={draftEvent}
          calendars={ordered}
          byId={byId}
          incognito={incognito}
          commands={commands}
          onPerson={(person, next) => {
            setChosen((c) => ({ ...c, [handleFor(person).toLowerCase()]: person }))
            setLine(next)
          }}
          onPlace={(place, next) => {
            const key = place.name.toLowerCase()
            setChosenPlaces((c) => ({ ...c, [key]: place }))
            setLine(next)
            // picked before the lookup for the map finished: fill GEO in later
            if (!place.geo)
              window.api.geocode(placeAddress(place)).then((geo) => {
                if (geo) setChosenPlaces((c) => (c[key] ? { ...c, [key]: { ...c[key], geo } } : c))
              })
          }}
          onPreviewPlace={setPreviewPlace}
          onDraft={() => {
            setDraftActive(true)
            setPalette(undefined)
          }}
          onSave={save}
          onSearchHit={(event) => {
            const calendar = byId.get(event.calendarId)
            if (calendar && !visible(calendar)) toggle(calendar)
            closePalette()
            controller.gotoDate(toDate(event.start))
            setFocusedId(event.id)
            setDetails(true)
          }}
          onGoto={(date) => {
            closePalette()
            controller.gotoDate(date)
          }}
          onClose={closePalette}
        />
      )}
      {importItem && importing && !choice && (
        <ImportDialog
          key={`${importing.id}/${importIndex}`}
          item={importItem}
          source={
            importing.items.length > 1
              ? `${importing.name} · ${importIndex + 1}/${importing.items.length}`
              : importing.name
          }
          calendars={importTargets}
          byId={byId}
          incognito={incognito}
          onTarget={setImportTarget}
          onApply={applyImport}
          onSkip={nextImport}
        />
      )}
      {choice && (
        <Choice
          title={choice.title}
          note={choice.note}
          options={choice.options}
          onPick={choice.onPick}
          onCancel={choice.onCancel ?? (() => setChoice(undefined))}
        />
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border bg-popover px-4 py-2 text-sm shadow-lg">
          {toast}
        </div>
      )}
      {help && <KeymapHelp bindings={bindings} onClose={() => setHelp(false)} />}
    </div>
  )
}

function newVideoCode(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 20)
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

/** The message of an IPC error without Electron's "Error invoking remote method" prefix. */
function reason(error: unknown): string {
  return String((error as Error)?.message ?? error).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    '',
  )
}
