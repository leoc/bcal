import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/api'

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
  onChange: (listener) => subscribe('vdir:changed', listener),
  onConfigChange: (listener) => subscribe('config:changed', listener),
  openLink: (url) => ipcRenderer.invoke('shell:open', url),
}

contextBridge.exposeInMainWorld('api', api)
