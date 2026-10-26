import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/api'

const api: Api = {
  calendars: () => ipcRenderer.invoke('vdir:calendars'),
  events: (range) => ipcRenderer.invoke('vdir:events', range),
  onChange: (listener) => {
    const handler = () => listener()
    ipcRenderer.on('vdir:changed', handler)
    return () => ipcRenderer.off('vdir:changed', handler)
  },
}

contextBridge.exposeInMainWorld('api', api)
