/** The two side panels: calendars on the left, event details on the right. */
export type PanelName = 'sidebar' | 'details'

/**
 * How a panel starts: `remember` takes its last state (toggled by key or
 * button), `shown` or `hidden` start that way on every launch.
 */
export type PanelMode = 'remember' | 'shown' | 'hidden'

export type PanelModes = Record<PanelName, PanelMode>
export type PanelState = Record<PanelName, boolean>

/** Before anything was remembered: calendars shown, details off. */
export const panelFallback: PanelState = { sidebar: true, details: false }

export const defaultPanelModes: PanelModes = { sidebar: 'remember', details: 'remember' }

export function initialPanels(modes: PanelModes, remembered: Partial<PanelState>): PanelState {
  const pick = (name: PanelName): boolean => {
    const mode = modes[name]
    if (mode === 'shown') return true
    if (mode === 'hidden') return false
    return remembered[name] ?? panelFallback[name]
  }
  return { sidebar: pick('sidebar'), details: pick('details') }
}

/** `remember`, `shown`/`hidden`, or true/false from config.yml. */
export function parsePanelMode(value: unknown): PanelMode | undefined {
  if (value === true || value === 'shown' || value === 'show' || value === 'on') return 'shown'
  if (value === false || value === 'hidden' || value === 'hide' || value === 'off') return 'hidden'
  if (value === 'remember') return 'remember'
  return undefined
}
