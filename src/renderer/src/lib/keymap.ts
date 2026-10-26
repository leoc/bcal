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

/** Vim-flavoured defaults; a user keymap file will override these later. */
export const defaultBindings: Binding[] = [
  { key: 'h', action: 'prev', description: 'Zurück' },
  { key: 'l', action: 'next', description: 'Vor' },
  { key: 'ArrowLeft', action: 'prev', description: 'Zurück' },
  { key: 'ArrowRight', action: 'next', description: 'Vor' },
  { key: 't', action: 'today', description: 'Heute' },
  { key: 'w', action: 'view:week', description: 'Woche' },
  { key: 'm', action: 'view:month', description: 'Monat' },
  { key: 'd', action: 'view:day', description: 'Tag' },
  { key: 'a', action: 'view:list', description: 'Agenda' },
  { key: 'b', action: 'toggle:sidebar', description: 'Seitenleiste' },
  { key: '?', action: 'help', description: 'Tastenkürzel' },
  { key: 'Escape', action: 'close', description: 'Schließen' },
  ...Array.from({ length: 9 }, (_, i) => ({
    key: String(i + 1),
    action: `toggle:calendar:${i}` as const,
    description: `Kalender ${i + 1} ein/aus`,
  })),
]

export function resolve(bindings: Binding[], event: KeyboardEvent): Action | undefined {
  if (event.ctrlKey || event.altKey || event.metaKey) return undefined
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, [contenteditable="true"]')) return undefined
  return bindings.find((b) => b.key === event.key)?.action
}
