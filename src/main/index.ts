import { homedir } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import type { Config, DateRange, NewEvent } from '../shared/types'
import { loadConfig, watchConfig } from './config'
import { captureAndQuit, screenshotPath, screenshotSize } from './screenshot'
import { State } from './state'
import { Vdir } from './vdir'

const root = process.env.BCAL_VDIR ?? join(homedir(), '.calendar')
const vdir = new Vdir(root)
let window: BrowserWindow | null = null
let config: Config

// Keep Chromium's caches out of ~/.config/bcal, which holds only config.yml.
const stateDir = join(process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state'), 'bcal')
app.setPath('userData', stateDir)
const visibility = new State<Record<string, boolean>>(stateDir, 'visibility', {})

const theme = process.env.BCAL_THEME
if (theme === 'dark' || theme === 'light') nativeTheme.themeSource = theme

function createWindow(): void {
  window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    ...(screenshotPath ? screenshotSize() : {}),
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

  if (screenshotPath) captureAndQuit(window, screenshotPath, () => app.quit())
  else window.once('ready-to-show', () => window?.show())
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  ipcMain.handle('config:get', () => config)
  ipcMain.handle('state:visibility', () => visibility.read())
  ipcMain.handle('state:setVisibility', (_event, value: Record<string, boolean>) =>
    visibility.write(value),
  )
  ipcMain.handle('vdir:calendars', () => vdir.calendars())
  ipcMain.handle('vdir:events', (_event, range: DateRange) => vdir.events(range))
  ipcMain.handle('vdir:search', (_event, query: string) => vdir.search(query))
  ipcMain.handle('vdir:create', async (_event, input: NewEvent) => {
    const created = await vdir.create(input, { organizer: config.organizer })
    window?.webContents.send('vdir:changed')
    return created
  })
  ipcMain.handle('vdir:undo', async (_event, path: string) => {
    await vdir.undo(path)
    window?.webContents.send('vdir:changed')
  })
  ipcMain.handle('shell:open', (_event, url: string) => {
    if (/^https?:\/\//.test(url)) return shell.openExternal(url)
  })
  ipcMain.on('window:close', () => window?.close())

  config = await loadConfig()
  await vdir.load()
  if (!screenshotPath) {
    vdir.watch(() => window?.webContents.send('vdir:changed'))
    watchConfig(async () => {
      config = await loadConfig()
      window?.webContents.send('config:changed')
    })
  }
  createWindow()
  setImmediate(() => vdir.warmUp())
})

app.on('window-all-closed', () => {
  vdir.close()
  app.quit()
})
