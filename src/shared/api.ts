import type {
  CalendarEvent,
  CalendarInfo,
  Config,
  Created,
  DateRange,
  NewEvent,
  Person,
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
  /** takes back an event created in this session (moves it to the trash) */
  undo: (path: string) => Promise<void>
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
