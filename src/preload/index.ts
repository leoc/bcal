import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/api'
import type { SyncStatus } from '../shared/types'

function subscribe(channel: string, listener: () => void) {
  const handler = () => listener()
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.off(channel, handler)
  }
}

const api: Api = {
  config: () => ipcRenderer.invoke('config:get'),
  calendars: () => ipcRenderer.invoke('vdir:calendars'),
  events: (range) => ipcRenderer.invoke('vdir:events', range),
  search: (query) => ipcRenderer.invoke('vdir:search', query),
  create: (event) => ipcRenderer.invoke('vdir:create', event),
  update: (ref, input, scope) => ipcRenderer.invoke('vdir:update', ref, input, scope),
  remove: (ref, scope) => ipcRenderer.invoke('vdir:remove', ref, scope),
  cancel: (ref, scope, mode) => ipcRenderer.invoke('vdir:cancel', ref, scope, mode),
  answer: (ref, scope, partstat) => ipcRenderer.invoke('vdir:answer', ref, scope, partstat),
  undo: () => ipcRenderer.invoke('vdir:undo'),
  syncStatus: () => ipcRenderer.invoke('sync:status'),
  sync: () => ipcRenderer.invoke('sync:run'),
  onSyncStatus: (listener) => {
    const handler = (_event: unknown, status: SyncStatus) => listener(status)
    ipcRenderer.on('sync:changed', handler)
    return () => {
      ipcRenderer.off('sync:changed', handler)
    }
  },
  people: (query) => ipcRenderer.invoke('people:search', query),
  places: (query) => ipcRenderer.invoke('places:search', query),
  mapPlaces: (query) => ipcRenderer.invoke('places:map', query),
  geocode: (address) => ipcRenderer.invoke('places:geocode', address),
  takeImports: () => ipcRenderer.invoke('import:take'),
  applyImport: (id, decisions) => ipcRenderer.invoke('import:apply', id, decisions),
  onImport: (listener) => subscribe('import:changed', listener),
  onChange: (listener) => subscribe('vdir:changed', listener),
  onConfigChange: (listener) => subscribe('config:changed', listener),
  openLink: (url) => ipcRenderer.invoke('shell:open', url),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  hide: () => ipcRenderer.send('app:hide'),
  quit: () => ipcRenderer.send('app:quit'),
  onCommand: (listener) => {
    const handler = (_event: unknown, action: string) => listener(action)
    ipcRenderer.on('app:command', handler)
    return () => {
      ipcRenderer.off('app:command', handler)
    }
  },
  visibility: () => ipcRenderer.invoke('state:visibility'),
  setVisibility: (visibility) => ipcRenderer.invoke('state:setVisibility', visibility),
  panels: () => ipcRenderer.invoke('state:panels'),
  setPanels: (panels) => ipcRenderer.invoke('state:setPanels', panels),
}

contextBridge.exposeInMainWorld('api', api)
