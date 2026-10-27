import type {
  CalendarEvent,
  CalendarInfo,
  Config,
  Created,
  DateRange,
  EventInput,
  EventRef,
  Geo,
  NewEvent,
  Person,
  Place,
  Scope,
} from './types'

export interface Api {
  config: () => Promise<Config>
  calendars: () => Promise<CalendarInfo[]>
  events: (range: DateRange) => Promise<CalendarEvent[]>
  search: (query: string) => Promise<CalendarEvent[]>
  /** writes a new event into the vdir; invites go out via the server */
  create: (event: NewEvent) => Promise<Created>
  /** people for @ completion: contacts and past participants, best first */
  people: (query: string) => Promise<Person[]>
  /** local places for `bei`/`in`/`im`/`at`: contacts, past events, config.yml */
  places: (query: string) => Promise<Place[]>
  /** places from the OSM map search (Photon); empty when offline */
  mapPlaces: (query: string) => Promise<Place[]>
  /** coordinates for an address, e.g. a contact without GEO */
  geocode: (address: string) => Promise<Geo | undefined>
  /** changes an event; `scope` matters for series only; refused for events of others */
  update: (ref: EventRef, input: EventInput, scope: Scope) => Promise<Created>
  /** deletes an event (into the trash), one occurrence, or a series from here on */
  remove: (ref: EventRef, scope: Scope) => Promise<void>
  /** takes back the last write of this session; what it was, or undefined if none */
  undo: () => Promise<string | undefined>
  /** fires when files in the vdir changed (pimsync wrote something) */
  onChange: (listener: () => void) => () => void
  /** fires when config.yml was saved */
  onConfigChange: (listener: () => void) => () => void
  /** calendar toggles from the UI, kept per machine */
  visibility: () => Promise<Record<string, boolean>>
  setVisibility: (visibility: Record<string, boolean>) => Promise<void>
  /** opens an http(s) link in the default browser */
  openLink: (url: string) => Promise<void>
}
