/** Zoom of the whole UI (Chromium's zoom factor): 1 is 100 %. */
export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 2
const STEP = 0.1

export function clampZoom(value: number): number {
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
  // 0.1 steps without float noise (0.7000000000000001)
  return Math.round(clamped * 100) / 100
}

export type ZoomChange = 'in' | 'out' | 'reset'

export function stepZoom(current: number, change: ZoomChange): number {
  if (change === 'reset') return 1
  return clampZoom(current + (change === 'in' ? STEP : -STEP))
}

/**
 * Ctrl+Plus / Ctrl+= / Ctrl+Minus / Ctrl+0 as in browsers, from Electron's
 * `before-input-event`. Undefined for every other key.
 */
export function zoomKey(input: {
  type: string
  key: string
  control: boolean
  meta: boolean
  alt: boolean
}): ZoomChange | undefined {
  if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return undefined
  if (input.key === '+' || input.key === '=') return 'in'
  if (input.key === '-' || input.key === '_') return 'out'
  if (input.key === '0') return 'reset'
  return undefined
}
