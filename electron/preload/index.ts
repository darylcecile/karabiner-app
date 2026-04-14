import { contextBridge, ipcRenderer } from 'electron'

import type { KarabinerApi } from '../shared/electron'

const electronApi: KarabinerApi = {
  ping: () => ipcRenderer.invoke('ping'),
  getPlatform: () => ipcRenderer.invoke('getPlatform'),
}

contextBridge.exposeInMainWorld('electron', electronApi)
