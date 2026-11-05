/// <reference lib="dom" />

export type Action =
  | 'prev'
  | 'next'
  | 'today'
  | 'view:week'
  | 'view:month'
  | 'view:day'
  | 'view:list'
  | 'focus:next'
  | 'focus:prev'
  | 'focus:left'
  | 'focus:right'
  | 'day:prev'
  | 'day:next'
  | 'week:prev'
  | 'week:next'
  | 'details'
  | 'open-link'
  | 'links'
  | 'goto'
  | 'search'
  | 'toggle:sidebar'
  | 'help'
  | 'close'
  | 'palette'
  | 'new'
  | 'command'
  | 'edit-draft'
  | 'delete'
  | 'cancel'
  | 'sync'
  | 'save'
  | 'undo'
  | 'incognito'
  | 'groups:all'
  | 'hide'
  | 'quit'
  | `group:${number}`

export interface Binding {
  key: string
  action: Action
  description: string
}

const descriptions: Record<string, string> = {
  prev: 'Zurück',
  next: 'Vor',
  today: 'Heute',
  'view:week': 'Woche',
  'view:month': 'Monat',
  'view:day': 'Tag',
  'view:list': 'Agenda',
  'focus:next': 'Nächster Termin',
  'focus:prev': 'Vorheriger Termin',
  'focus:left': 'Termin am Tag davor, gleiche Zeit',
  'focus:right': 'Termin am Tag danach, gleiche Zeit',
  'day:prev': 'Ein Tag zurück',
  'day:next': 'Ein Tag vor',
  'week:prev': 'Eine Woche zurück',
  'week:next': 'Eine Woche vor',
  details: 'Details ein/aus',
  'open-link': 'Link öffnen (bei mehreren: Auswahl)',
  links: 'Links: öffnen oder kopieren',
  goto: 'Datum springen',
  search: 'Suchen',
  'toggle:sidebar': 'Seitenleiste',
  help: 'Tastenkürzel',
  close: 'Schließen',
  palette: 'Palette',
  new: 'Neuer Termin',
  command: 'Befehle',
  'edit-draft': 'Bearbeiten (Termin oder Entwurf)',
  delete: 'Termin löschen',
  cancel: 'Absagen (durchgestrichen) / Absage zurücknehmen',
  sync: 'Jetzt synchronisieren (pimsync)',
  save: 'Entwurf speichern',
  undo: 'Letzte Änderung zurücknehmen',
  incognito: 'Inkognito (Titel ausblenden)',
  'groups:all': 'Alle Kalender',
  hide: 'Fenster verstecken (bcal läuft weiter)',
  quit: 'bcal beenden',
}

const defaults: [string, Action][] = [
  ['h', 'focus:left'],
  ['l', 'focus:right'],
  ['ArrowLeft', 'focus:left'],
  ['ArrowRight', 'focus:right'],
  ['H', 'day:prev'],
  ['L', 'day:next'],
  ['J', 'week:next'],
  ['K', 'week:prev'],
  ['t', 'today'],
  ['w', 'view:week'],
  ['m', 'view:month'],
  ['d', 'view:day'],
  ['a', 'view:list'],
  ['j', 'focus:next'],
  ['k', 'focus:prev'],
  ['ArrowDown', 'focus:next'],
  ['ArrowUp', 'focus:prev'],
  ['Enter', 'details'],
  ['i', 'details'],
  ['o', 'open-link'],
  ['O', 'links'],
  ['g', 'goto'],
  ['/', 'search'],
  ['b', 'toggle:sidebar'],
  ['?', 'help'],
  ['Escape', 'close'],
  ['Ctrl+k', 'palette'],
  ['n', 'new'],
  [':', 'command'],
  ['>', 'command'],
  ['e', 'edit-draft'],
  ['x', 'delete'],
  ['Delete', 'delete'],
  ['D', 'delete'],
  ['c', 'cancel'],
  ['S', 'sync'],
  ['Shift+Enter', 'save'],
  ['u', 'undo'],
  ['I', 'incognito'],
  ['q', 'hide'],
  ['0', 'groups:all'],
  ...Array.from({ length: 9 }, (_, i): [string, Action] => [String(i + 1), `group:${i}`]),
]

function describe(action: Action): string {
  if (action.startsWith('group:')) {
    return `Gruppe ${Number(action.split(':')[1]) + 1}`
  }
  return descriptions[action] ?? action
}

function isAction(value: string): value is Action {
  return value in descriptions || /^group:\d+$/.test(value)
}

/** Vim-flavoured defaults, overridden per key from config.yml (`none` unbinds). */
export function buildBindings(overrides: Record<string, string> = {}): Binding[] {
  const map = new Map<string, Action>(defaults)
  for (const [key, action] of Object.entries(overrides)) {
    if (action === 'none') map.delete(key)
    else if (isAction(action)) map.set(key, action)
  }
  return [...map].map(([key, action]) => ({ key, action, description: describe(action) }))
}

/** `Ctrl+k`, `Shift+Enter`, `?`: Shift only counts for named keys, it is part of characters. */
export function keyName(event: KeyboardEvent): string {
  const named = event.key.length > 1
  return [
    event.ctrlKey && 'Ctrl',
    event.altKey && 'Alt',
    event.metaKey && 'Meta',
    event.shiftKey && named && 'Shift',
    event.key,
  ]
    .filter(Boolean)
    .join('+')
}

export function resolve(bindings: Binding[], event: KeyboardEvent): Action | undefined {
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, [contenteditable="true"]')) return undefined
  const name = keyName(event)
  return bindings.find((b) => b.key === name)?.action
}
