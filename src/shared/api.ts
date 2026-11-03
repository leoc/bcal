import type { PanelState } from './panels'
import type {
  CalendarEvent,
  CalendarInfo,
  CancelMode,
  Config,
  Created,
  DateRange,
  EventInput,
  EventRef,
  Geo,
  ImportDecision,
  ImportPlan,
  NewEvent,
  Person,
  Place,
  Scope,
  SyncStatus,
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
  /** cancels an event without deleting it (struck through), or lifts the cancellation */
  cancel: (ref: EventRef, scope: Scope, mode: CancelMode) => Promise<void>
  /** how the last pimsync run went, and whether one runs */
  syncStatus: () => Promise<SyncStatus>
  /** runs pimsync now (pull and push); resolves when it is done */
  sync: () => Promise<SyncStatus>
  onSyncStatus: (listener: (status: SyncStatus) => void) => () => void
  /** takes back the last write of this session; what it was, or undefined if none */
  undo: () => Promise<string | undefined>
  /** .ics files opened with bcal since the last call (xdg-open, mu4e) */
  takeImports: () => Promise<ImportPlan[]>
  /** writes the decided events of an opened file; one undo takes it all back */
  applyImport: (id: string, decisions: ImportDecision[]) => Promise<Created | undefined>
  /** fires when a file was opened */
  onImport: (listener: () => void) => () => void
  /** fires when files in the vdir changed (pimsync wrote something) */
  onChange: (listener: () => void) => () => void
  /** fires when config.yml was saved */
  onConfigChange: (listener: () => void) => () => void
  /** calendar toggles from the UI, kept per machine */
  visibility: () => Promise<Record<string, boolean>>
  setVisibility: (visibility: Record<string, boolean>) => Promise<void>
  /** last state of the side panels, kept per machine */
  panels: () => Promise<Partial<PanelState>>
  /** remembers the panels given; the others keep their state */
  setPanels: (panels: Partial<PanelState>) => Promise<void>
  /** hides the window; bcal keeps running (tray, `bcal`, LEADER o c bring it back) */
  hide: () => void
  /** quits bcal for good */
  quit: () => void
  /** commands from outside the page, e.g. the tray's "new" */
  onCommand: (listener: (action: string) => void) => () => void
  /** opens an http(s) link with `openLink` from config.yml, else the default browser */
  openLink: (url: string) => Promise<void>
  /** puts text on the clipboard */
  copyText: (text: string) => Promise<void>
}
