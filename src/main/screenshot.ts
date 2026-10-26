import { writeFile } from 'node:fs/promises'
import type { BrowserWindow } from 'electron'

/**
 * Dev aid: with BCAL_SCREENSHOT=<file.png> the window stays hidden, the page
 * is captured once rendered and the app quits. No window ever appears on the
 * desktop. Size via BCAL_SCREENSHOT_SIZE=1600x1000, theme via BCAL_THEME.
 */
export const screenshotPath = process.env.BCAL_SCREENSHOT

export function screenshotSize(): { width: number; height: number } {
  const [width, height] = (process.env.BCAL_SCREENSHOT_SIZE ?? '1600x1000').split('x').map(Number)
  return { width: width || 1600, height: height || 1000 }
}

export function captureAndQuit(window: BrowserWindow, path: string, quit: () => void): void {
  window.webContents.once('did-finish-load', () => {
    // give FullCalendar and the IPC round trips time to settle
    setTimeout(
      async () => {
        const image = await window.webContents.capturePage()
        await writeFile(path, image.toPNG())
        quit()
      },
      Number(process.env.BCAL_SCREENSHOT_DELAY ?? 2500),
    )
  })
}
