import type { CalendarEvent, CalendarInfo, Geo, Person, Place, PlaceSource } from '@shared/types'
import {
  CalendarPlus,
  Command as CommandIcon,
  CornerDownLeft,
  MapPin,
  Repeat,
  Search,
  Video,
} from 'lucide-react'
import { type KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MiniMonth } from '@/components/mini-month'
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { type Draft, handleFor, placeAddress } from '@/lib/draft'
import { formatRrule, formatWhen, toDate } from '@/lib/format'
import { parseGoto } from '@/lib/goto'
import { type ActiveToken, activeToken } from '@/lib/quickadd'
import { cn } from '@/lib/utils'

export type PaletteMode = 'all' | 'create' | 'search' | 'goto' | 'command'

export interface PaletteCommand {
  id: string
  label: string
  /** key shown next to the command */
  hint?: string
  run: () => void
}

interface Props {
  mode: PaletteMode
  onMode: (mode: PaletteMode) => void
  /** the quick-add line; lives in the app because the draft outlives the palette */
  line: string
  onLine: (line: string) => void
  draft?: Draft
  draftEvent?: CalendarEvent
  calendars: CalendarInfo[]
  byId: Map<string, CalendarInfo>
  incognito: boolean
  commands: PaletteCommand[]
  /** a person was picked for the `@` token; `line` already has the handle */
  onPerson: (person: Person, line: string) => void
  /** a place was picked after bei/in/im/at; `line` already has its name */
  onPlace: (place: Place, line: string) => void
  /** the highlighted place suggestion, for the map in the panel */
  onPreviewPlace: (place: Place | undefined) => void
  onDraft: () => void
  onSave: () => void
  onSearchHit: (event: CalendarEvent) => void
  onGoto: (date: Date) => void
  onClose: () => void
}

const labels: Record<PaletteMode, string> = {
  all: 'Alles',
  create: 'Neu',
  search: 'Suche',
  goto: 'Gehe zu',
  command: 'Befehl',
}
const placeholders: Record<PaletteMode, string> = {
  all: 'Termin, Befehl (>) oder Suche (/)',
  create: 'nächsten Freitag 14 Uhr 1h Kaffee @Simon #family video',
  search: 'Termine suchen: Titel, Ort, Beschreibung',
  goto: 'morgen, fr, 12.11., kw 45, +3',
  command: 'Befehl',
}

export function CommandPalette(props: Props) {
  const { mode, line, draft, draftEvent, incognito } = props
  const input = useRef<HTMLInputElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(line.length)
  const [selected, setSelected] = useState('')
  const [people, setPeople] = useState<Person[]>([])
  const [hits, setHits] = useState<CalendarEvent[]>([])
  const [localPlaces, setLocalPlaces] = useState<Place[]>([])
  const [mapPlaces, setMapPlaces] = useState<Place[]>([])
  // coordinates looked up for places without GEO, by label; undefined: not found
  const [geocoded, setGeocoded] = useState<Record<string, Geo | undefined>>({})
  // where the caret goes after a completion rewrote the line
  const caret = useRef<number | undefined>(undefined)

  useLayoutEffect(() => {
    if (caret.current === undefined || !line) return
    input.current?.setSelectionRange(caret.current, caret.current)
    setCursor(caret.current)
    caret.current = undefined
  }, [line])

  const lineModes = mode === 'all' || mode === 'create'
  const text = lineModes ? line : query
  const token: ActiveToken | undefined = lineModes ? activeToken(line, cursor) : undefined

  useEffect(() => input.current?.focus(), [])

  // close when clicking outside; the calendar stays usable behind
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) props.onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [props.onClose])

  useEffect(() => {
    if (token?.kind !== 'person') return setPeople([])
    let live = true
    window.api.people(token.query).then((p) => live && setPeople(p))
    return () => {
      live = false
    }
  }, [token?.kind, token?.query])

  // places: local sources right away, the map search once typing pauses
  const placeQuery = token?.kind === 'place' ? token.query : ''
  useEffect(() => {
    if (!placeQuery) {
      setLocalPlaces([])
      setMapPlaces([])
      return
    }
    let live = true
    window.api.places(placeQuery).then((p) => live && setLocalPlaces(p))
    const timer = setTimeout(
      () => window.api.mapPlaces(placeQuery).then((p) => live && setMapPlaces(p)),
      300,
    )
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [placeQuery])
  const places = useMemo(() => {
    if (!placeQuery) return []
    const labels = new Set(localPlaces.map((p) => p.label.toLowerCase()))
    return [...localPlaces, ...mapPlaces.filter((p) => !labels.has(p.label.toLowerCase()))]
  }, [placeQuery, localPlaces, mapPlaces])

  const searchText =
    mode === 'search' ? query : mode === 'all' && line.trim().length >= 2 ? line : ''
  useEffect(() => {
    if (!searchText.trim()) return setHits([])
    const timer = setTimeout(() => window.api.search(searchText).then(setHits), 120)
    return () => clearTimeout(timer)
  }, [searchText])

  const calendarHits = useMemo(() => {
    if (token?.kind !== 'calendar') return []
    const q = token.query.toLowerCase()
    return props.calendars.filter(
      (c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
    )
  }, [token, props.calendars])

  const commandHits = useMemo(() => {
    const q = (mode === 'command' ? query : line).toLowerCase().trim()
    if (mode !== 'command' && (mode !== 'all' || !q)) return []
    return props.commands.filter((c) => c.label.toLowerCase().includes(q))
  }, [mode, query, line, props.commands])

  const gotoTarget = mode === 'goto' ? parseGoto(query) : undefined

  const setText = (value: string) => {
    if (mode === 'all' && line === '' && /^[>:/]/.test(value)) {
      props.onMode(value.startsWith('/') ? 'search' : 'command')
      setQuery(value.slice(1))
      return
    }
    if (lineModes) props.onLine(value)
    else setQuery(value)
  }

  const replaceToken = (replacement: string) => {
    if (!token) return line
    const next = `${line.slice(0, token.from)}${replacement} ${line.slice(token.to).trimStart()}`
    const at = token.from + replacement.length + 1
    caret.current = at
    return next
  }

  const pickPerson = (person: Person) => {
    const handle = handleFor(person)
    props.onPerson(person, replaceToken(`@${handle}`))
  }
  const pickCalendar = (calendar: CalendarInfo) =>
    props.onLine(replaceToken(`#${calendar.id.split('/').pop()}`))
  const withGeo = (place: Place): Place => ({ ...place, geo: place.geo ?? geocoded[place.label] })
  const pickPlace = (place: Place) => props.onPlace(withGeo(place), replaceToken(place.name))

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      props.onClose()
    } else if (e.key === 'Backspace' && text === '' && mode !== 'all') {
      props.onMode('all')
    } else if (e.key === 'Enter' && e.shiftKey && lineModes && draft) {
      e.preventDefault()
      e.stopPropagation()
      props.onSave()
    } else if (e.key === 'Tab' && token) {
      e.preventDefault()
      const person =
        people.find((p) => itemValue('person', p.email ?? p.name) === current) ?? people[0]
      const calendar =
        calendarHits.find((c) => itemValue('calendar', c.id) === current) ?? calendarHits[0]
      if (token.kind === 'person' && person) pickPerson(person)
      if (token.kind === 'calendar' && calendar) pickCalendar(calendar)
      const place = highlighted ?? places[0]
      if (token.kind === 'place' && place) pickPlace(place)
    }
  }

  // a place token keeps the draft first: Enter still takes the line, Tab or ↓ a place
  const showCreate =
    lineModes && line.trim() !== '' && (!token || token.kind === 'place') && draftEvent

  const grouped = placeSources
    .map(([source, heading]) => [heading, places.filter((p) => p.source === source)] as const)
    .filter(([, list]) => list.length > 0)

  // values in display order; a remembered selection that vanished falls back to the first
  const values = [
    ...(token?.kind === 'person' ? people.map((p) => itemValue('person', p.email ?? p.name)) : []),
    ...(token?.kind === 'calendar' ? calendarHits.map((c) => itemValue('calendar', c.id)) : []),
    ...(showCreate ? ['create'] : []),
    ...grouped.flatMap(([, list]) => list.map(placeValue)),
    ...(gotoTarget ? ['goto'] : []),
    ...commandHits.map((c) => `command:${c.id}`),
    ...(!token ? hits.slice(0, mode === 'search' ? 50 : 5).map((e) => `event:${e.id}`) : []),
  ]
  const current = values.includes(selected) ? selected : (values[0] ?? '')
  const highlighted = places.find((p) => placeValue(p) === current)

  // the panel shows the highlighted place; one without GEO is looked up first
  const previewKey = highlighted ? placeValue(highlighted) : ''
  const onPreviewPlace = props.onPreviewPlace
  useEffect(() => {
    if (!highlighted) return onPreviewPlace(undefined)
    onPreviewPlace({ ...highlighted, geo: highlighted.geo ?? geocoded[highlighted.label] })
    if (highlighted.geo || highlighted.label in geocoded) return
    const label = highlighted.label
    const timer = setTimeout(
      () =>
        window.api
          .geocode(placeAddress(highlighted))
          .then((geo) => setGeocoded((known) => ({ ...known, [label]: geo }))),
      250,
    )
    return () => clearTimeout(timer)
  }, [previewKey, geocoded, onPreviewPlace])
  useEffect(() => () => onPreviewPlace(undefined), [onPreviewPlace])

  return (
    <div
      ref={root}
      className="fixed top-16 left-1/2 z-50 w-[min(680px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl"
    >
      <Command shouldFilter={false} value={current} onValueChange={setSelected} loop>
        <div className="flex items-center gap-2 border-b px-3">
          <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {labels[mode]}
          </span>
          <input
            ref={input}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setCursor(e.target.selectionStart ?? e.target.value.length)
            }}
            onSelect={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
            onKeyDown={onKeyDown}
            placeholder={placeholders[mode]}
            spellCheck={false}
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <CommandList className="max-h-[50vh]">
          {token?.kind === 'person' && (
            <CommandGroup heading="Personen">
              {people.map((p) => (
                <CommandItem
                  key={p.email ?? p.name}
                  value={itemValue('person', p.email ?? p.name)}
                  onSelect={() => pickPerson(p)}
                  className="gap-3"
                >
                  <span className="flex-1 truncate">{p.name ?? p.email}</span>
                  {!p.email && (
                    <span className="text-xs text-amber-600">ohne E-Mail, nur Vermerk</span>
                  )}
                  {p.name && p.email && (
                    <span className="truncate text-xs text-muted-foreground">{p.email}</span>
                  )}
                </CommandItem>
              ))}
              {people.length === 0 && <Empty>Niemand gefunden</Empty>}
            </CommandGroup>
          )}

          {token?.kind === 'calendar' && (
            <CommandGroup heading="Kalender">
              {calendarHits.map((c) => (
                <CommandItem
                  key={c.id}
                  value={itemValue('calendar', c.id)}
                  onSelect={() => pickCalendar(c)}
                  className="gap-3"
                >
                  <Dot color={c.color} />
                  <span className="flex-1">{c.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {showCreate && draft && draftEvent && (
            <CommandGroup heading="Neuer Termin">
              <CommandItem
                value="create"
                onSelect={props.onDraft}
                className="items-start gap-3 py-2.5"
              >
                <CalendarPlus className="mt-0.5 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {incognito ? 'Termin' : draftEvent.title}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{formatWhen(draftEvent)}</span>
                    <span className="flex items-center gap-1">
                      <Dot color={draft.calendar?.color} /> {draft.calendar?.name}
                    </span>
                    {draftEvent.rrule && (
                      <span className="flex items-center gap-1">
                        <Repeat className="size-3" /> {formatRrule(draftEvent.rrule)}
                      </span>
                    )}
                    {draft.video && (
                      <span className="flex items-center gap-1">
                        <Video className="size-3" /> Video
                      </span>
                    )}
                    {draft.people.map((p) => (
                      <span
                        key={p.token}
                        className={cn(
                          'rounded px-1',
                          p.person?.email
                            ? 'bg-muted text-foreground'
                            : 'bg-amber-500/15 text-amber-600',
                        )}
                      >
                        @{incognito ? '…' : (p.person?.name ?? p.token)}
                        {!p.person?.email && ' (keine Einladung)'}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="flex shrink-0 items-center gap-2 pt-0.5 text-[11px] text-muted-foreground">
                  <Kbd>
                    <CornerDownLeft className="size-3" />
                  </Kbd>
                  Entwurf
                  <Kbd>⇧↵</Kbd>
                  speichern
                </span>
              </CommandItem>
            </CommandGroup>
          )}

          {grouped.map(([heading, list]) => (
            <CommandGroup key={heading} heading={heading}>
              {list.map((place) => (
                <CommandItem
                  key={placeValue(place)}
                  value={placeValue(place)}
                  onSelect={() => pickPlace(place)}
                  className="gap-3"
                >
                  <MapPin className="text-muted-foreground" />
                  <span className="shrink-0">{incognito ? 'Ort' : place.name}</span>
                  {!incognito && place.label !== place.name && (
                    <span className="truncate text-xs text-muted-foreground">
                      {place.label.slice(place.name.length).replace(/^,\s*/, '')}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}

          {mode === 'goto' && (
            <div className="flex items-start gap-5 p-4">
              <MiniMonth selected={gotoTarget ?? new Date()} />
              {gotoTarget && (
                <CommandItem
                  value="goto"
                  onSelect={() => props.onGoto(gotoTarget)}
                  className="mt-6 flex-1"
                >
                  {gotoTarget.toLocaleDateString('de-DE', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </CommandItem>
              )}
            </div>
          )}

          {commandHits.length > 0 && (
            <CommandGroup heading="Befehle">
              {commandHits.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`command:${c.id}`}
                  onSelect={c.run}
                  className="gap-3"
                >
                  <CommandIcon className="text-muted-foreground" />
                  <span className="flex-1">{c.label}</span>
                  {c.hint && <Kbd>{c.hint}</Kbd>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {!token && hits.length > 0 && (
            <CommandGroup heading="Termine">
              {hits.slice(0, mode === 'search' ? 50 : 5).map((event) => {
                const calendar = props.byId.get(event.calendarId)
                const past = toDate(event.end).getTime() < Date.now()
                return (
                  <CommandItem
                    key={event.id}
                    value={`event:${event.id}`}
                    onSelect={() => props.onSearchHit(event)}
                    className="gap-3"
                  >
                    <Search className="text-muted-foreground" />
                    <Dot color={calendar?.color} />
                    <div className={cn('min-w-0 flex-1', past && 'opacity-60')}>
                      <div className="truncate">{incognito ? 'Termin' : event.title}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {formatWhen(event)}
                        {event.rrule && ' · Serie'} · {calendar?.name}
                      </div>
                    </div>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </div>
  )
}

function itemValue(kind: string, id: string | undefined) {
  return `${kind}:${id ?? ''}`
}

const placeSources: [PlaceSource, string][] = [
  ['contacts', 'Kontakte'],
  ['events', 'Bisher'],
  ['config', 'Eigene'],
  ['map', 'Karte'],
]

function placeValue(place: Place) {
  return itemValue('place', `${place.source}:${place.label}`)
}

function Dot({ color }: { color?: string }) {
  return <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1 font-mono text-[10px]">
      {children}
    </kbd>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-2 py-3 text-sm text-muted-foreground">{children}</div>
}
