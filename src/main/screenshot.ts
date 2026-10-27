import { writeFile } from 'node:fs/promises'
import type { BrowserWindow } from 'electron'

/**
 * Dev aid: with BCAL_SCREENSHOT=<file.png> the window stays hidden, the page
 * is captured once rendered and the app quits. No window ever appears on the
 * desktop. Size via BCAL_SCREENSHOT_SIZE=1600x1000, theme via BCAL_THEME,
 * keys to press first via BCAL_SCREENSHOT_KEYS="j j Enter".
 */
export const screenshotPath = process.env.BCAL_SCREENSHOT

export function screenshotSize(): { width: number; height: number } {
  const [width, height] = (process.env.BCAL_SCREENSHOT_SIZE ?? '1600x1000').split('x').map(Number)
  return { width: width || 1600, height: height || 1000 }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Mouse drag in page pixels, e.g. `Drag:388,325>523,360`, in small steps like a hand. */
async function drag(window: BrowserWindow, spec: string): Promise<void> {
  const [from = [], to = []] = spec.split('>').map((p) => p.split(',').map(Number))
  const [x1 = 0, y1 = 0] = from
  const [x2 = 0, y2 = 0] = to
  const contents = window.webContents
  contents.sendInputEvent({ type: 'mouseDown', x: x1, y: y1, button: 'left', clickCount: 1 })
  for (let i = 1; i <= 10; i++) {
    const x = Math.round(x1 + ((x2 - x1) * i) / 10)
    const y = Math.round(y1 + ((y2 - y1) * i) / 10)
    contents.sendInputEvent({ type: 'mouseMove', x, y, button: 'left' })
    await sleep(30)
  }
  contents.sendInputEvent({ type: 'mouseUp', x: x2, y: y2, button: 'left', clickCount: 1 })
  await sleep(300)
}

/** `j`, `Enter`, `Space`, `Shift+Enter`, `Ctrl+k`, or `Drag:x,y>x,y` */
async function press(window: BrowserWindow, token: string): Promise<void> {
  if (token.startsWith('Drag:')) return drag(window, token.slice(5))
  const contents = window.webContents
  const parts = token.length > 1 ? token.split('+') : [token]
  const key = parts.pop() ?? token
  const modifiers = parts.map((m) => (m === 'Ctrl' ? 'control' : m.toLowerCase())) as (
    | 'shift'
    | 'control'
    | 'alt'
  )[]
  const keyCode = key === 'Space' ? ' ' : key
  contents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
  if (keyCode.length === 1 && !modifiers.includes('control')) {
    contents.sendInputEvent({ type: 'char', keyCode, modifiers })
  }
  contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
  await sleep(120)
}

export function captureAndQuit(window: BrowserWindow, path: string, quit: () => void): void {
  window.webContents.once('did-finish-load', async () => {
    // give FullCalendar and the IPC round trips time to settle
    await sleep(Number(process.env.BCAL_SCREENSHOT_DELAY ?? 2500))
    for (const key of (process.env.BCAL_SCREENSHOT_KEYS ?? '').split(/\s+/).filter(Boolean)) {
      await press(window, key)
    }
    // BCAL_SCREENSHOT_AFTER: wait longer for network results (map search, tiles)
    await sleep(Number(process.env.BCAL_SCREENSHOT_AFTER ?? 500))
    const image = await window.webContents.capturePage()
    await writeFile(path, image.toPNG())
    quit()
  })
}
