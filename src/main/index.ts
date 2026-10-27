import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, Menu, nativeImage, nativeTheme, shell, Tray } from 'electron'
import type {
  Config,
  DateRange,
  EventInput,
  EventRef,
  ImportDecision,
  ImportPlan,
  NewEvent,
  Scope,
} from '../shared/types'
import { loadConfig, watchConfig } from './config'
import { filesIn, readOpened } from './opened'
import { type Candidate, mergePeople, parseVcards, rankPeople, readVcards } from './people'
import { eventPlaces, Photon, type PlaceCandidate, parseVcardPlaces, rankPlaces } from './places'
import { captureAndQuit, screenshotPath, screenshotSize } from './screenshot'
import { State } from './state'
import { Vdir } from './vdir'

const root = process.env.BCAL_VDIR ?? join(homedir(), '.calendar')
const vdir = new Vdir(root)
let window: BrowserWindow | null = null
const contactsDir = process.env.BCAL_CONTACTS ?? join(homedir(), '.contacts')
let people: Promise<Candidate[]> | undefined
let places: Promise<PlaceCandidate[]> | undefined
let vcards: Promise<string[]> | undefined
const photon = new Photon(() => config.near)
// rebuilt lazily after the vdir or the config changed
const loadPeople = async () => {
  vcards ??= readVcards(contactsDir)
  const contacts = (await vcards).flatMap(parseVcards)
  return mergePeople(contacts, vdir.participants()).filter(
    (p) => p.email !== config.organizer?.email,
  )
}
const loadPlaces = async () => {
  vcards ??= readVcards(contactsDir)
  return [
    ...(await vcards).flatMap(parseVcardPlaces),
    ...eventPlaces(vdir.locations()),
    ...config.places.map((p) => ({ ...p, count: 1 })),
  ]
}
let config: Config

// Keep Chromium's caches out of ~/.config/bcal, which holds only config.yml.
// Screenshot runs (often on test data) keep their toggles apart.
const stateDir = join(
  process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state'),
  screenshotPath ? 'bcal-screenshot' : 'bcal',
)
app.setPath('userData', stateDir)
const visibility = new State<Record<string, boolean>>(stateDir, 'visibility', {})

// One bcal per state dir: a second start hands its files over and quits.
if (!screenshotPath && !app.requestSingleInstanceLock()) app.exit(0)

// opened .ics files waiting for the renderer, and their text by plan id
let imports: ImportPlan[] = []
const importTexts = new Map<string, string>()
const me = () => [config.organizer?.email, ...config.emails].filter((e): e is string => Boolean(e))

async function openFiles(paths: string[]): Promise<void> {
  for (const path of paths) {
    const id = randomUUID()
    try {
      const { name, text } = await readOpened(path)
      importTexts.set(id, text)
      imports.push({ id, name, ...vdir.planImport(text, me()) })
    } catch (error) {
      imports.push({ id, name: path, items: [], error: String((error as Error).message ?? error) })
    }
  }
  window?.webContents.send('import:changed')
  present()
}

// Closing only hides the window; bcal keeps running until quit explicitly
// (palette, tray). `--hidden` starts without showing it, e.g. from a service.
let quitting = false
const startHidden = process.argv.includes('--hidden')
let tray: Tray | undefined

/** Brings the window up (Hyprland's rule floats it on top) and focuses it. */
function present(): void {
  if (!window) return
  window.show()
  window.focus()
}

function quit(): void {
  quitting = true
  app.quit()
}

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
  else if (!startHidden) window.once('ready-to-show', present)
  window.on('close', (event) => {
    if (quitting || screenshotPath) return
    event.preventDefault()
    window?.hide()
  })
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
  ipcMain.handle('people:search', async (_event, query: string) => {
    people ??= loadPeople()
    return rankPeople(await people, query).map(({ name, email }) => ({ name, email }))
  })
  ipcMain.handle('places:search', async (_event, query: string) => {
    places ??= loadPlaces()
    return rankPlaces(await places, query)
  })
  ipcMain.handle('places:map', (_event, query: string) => photon.search(query))
  ipcMain.handle('places:geocode', (_event, address: string) => photon.geocode(address))
  ipcMain.handle('vdir:update', async (_event, ref: EventRef, input: EventInput, scope: Scope) => {
    const updated = await vdir.update(ref, input, scope, { organizer: config.organizer })
    window?.webContents.send('vdir:changed')
    return updated
  })
  ipcMain.handle('vdir:remove', async (_event, ref: EventRef, scope: Scope) => {
    await vdir.remove(ref, scope, { organizer: config.organizer })
    window?.webContents.send('vdir:changed')
  })
  ipcMain.handle('vdir:undo', async () => {
    const undone = await vdir.undo()
    window?.webContents.send('vdir:changed')
    return undone
  })
  ipcMain.handle('import:take', () => {
    const taken = imports
    imports = []
    return taken
  })
  ipcMain.handle('import:apply', async (_event, id: string, decisions: ImportDecision[]) => {
    const text = importTexts.get(id)
    if (text === undefined) throw new Error('Import nicht mehr da')
    const created = await vdir.applyImport(text, decisions, me())
    window?.webContents.send('vdir:changed')
    return created
  })
  ipcMain.handle('shell:open', (_event, url: string) => {
    if (/^https?:\/\//.test(url)) return shell.openExternal(url)
  })
  ipcMain.on('window:close', () => window?.close())
  ipcMain.on('app:hide', () => window?.hide())
  ipcMain.on('app:quit', quit)

  config = await loadConfig()
  await vdir.load()
  if (!screenshotPath) {
    vdir.watch(() => {
      people = undefined
      places = undefined
      window?.webContents.send('vdir:changed')
    })
    watchConfig(async () => {
      config = await loadConfig()
      places = undefined
      window?.webContents.send('config:changed')
    })
  }
  app.on('second-instance', (_event, argv, cwd) => {
    const files = filesIn(argv, cwd, app.getAppPath())
    if (files.length) openFiles(files)
    else present()
  })
  createWindow()
  setImmediate(() => vdir.warmUp())
  if (!screenshotPath) tray = createTray()
  const files = filesIn(process.argv, process.cwd(), app.getAppPath())
  if (files.length) openFiles(files)
})

app.on('before-quit', () => {
  quitting = true
})

app.on('will-quit', () => vdir.close())

/** Tray icon (StatusNotifierItem): click shows bcal, the menu also quits it. */
function createTray(): Tray | undefined {
  try {
    const icon = nativeImage.createFromPath(join(__dirname, '../../resources/tray.png'))
    const created = new Tray(icon)
    created.setToolTip('bcal')
    created.on('click', present)
    created.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Öffnen', click: present },
        {
          label: 'Neuer Termin',
          click: () => {
            present()
            window?.webContents.send('app:command', 'new')
          },
        },
        { type: 'separator' },
        { label: 'bcal beenden', click: quit },
      ]),
    )
    return created
  } catch (error) {
    console.warn('bcal: no tray:', error)
    return undefined
  }
}
