export type Action =
  | 'prev'
  | 'next'
  | 'today'
  | 'view:week'
  | 'view:month'
  | 'view:day'
  | 'view:list'
  | 'toggle:sidebar'
  | 'help'
  | 'close'
  | `toggle:calendar:${number}`

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
  'toggle:sidebar': 'Seitenleiste',
  help: 'Tastenkürzel',
  close: 'Schließen',
}

const defaults: [string, Action][] = [
  ['h', 'prev'],
  ['l', 'next'],
  ['ArrowLeft', 'prev'],
  ['ArrowRight', 'next'],
  ['t', 'today'],
  ['w', 'view:week'],
  ['m', 'view:month'],
  ['d', 'view:day'],
  ['a', 'view:list'],
  ['b', 'toggle:sidebar'],
  ['?', 'help'],
  ['Escape', 'close'],
  ...Array.from({ length: 9 }, (_, i): [string, Action] => [String(i + 1), `toggle:calendar:${i}`]),
]

function describe(action: Action): string {
  if (action.startsWith('toggle:calendar:')) {
    return `Kalender ${Number(action.split(':')[2]) + 1} ein/aus`
  }
  return descriptions[action] ?? action
}

function isAction(value: string): value is Action {
  return value in descriptions || /^toggle:calendar:\d+$/.test(value)
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

export function resolve(bindings: Binding[], event: KeyboardEvent): Action | undefined {
  if (event.ctrlKey || event.altKey || event.metaKey) return undefined
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, [contenteditable="true"]')) return undefined
  return bindings.find((b) => b.key === event.key)?.action
}
