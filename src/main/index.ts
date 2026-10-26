import { homedir } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import type { DateRange } from '../shared/types'
import { Vdir } from './vdir'

const root = process.env.BCAL_VDIR ?? join(homedir(), '.calendar')
const vdir = new Vdir(root)
let window: BrowserWindow | null = null

function createWindow(): void {
  window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'bcal',
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#09090b' : '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.once('ready-to-show', () => window?.show())
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  ipcMain.handle('vdir:calendars', () => vdir.calendars())
  ipcMain.handle('vdir:events', (_event, range: DateRange) => vdir.events(range))
  ipcMain.on('window:close', () => window?.close())

  await vdir.load()
  vdir.watch(() => window?.webContents.send('vdir:changed'))
  createWindow()
})

app.on('window-all-closed', () => {
  vdir.close()
  app.quit()
})
