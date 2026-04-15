import { contextBridge, ipcRenderer } from 'electron'

import type { KarabinerApi } from '../shared/electron';

const cache = new Map<string, any>();

const electronApi: KarabinerApi = {
	ping: () => ipcRenderer.invoke('ping'),
	getPlatform: () => {
		const cacheKey = 'platform';
		if (cache.has(cacheKey)) {
			return cache.get(cacheKey);
		}
		const value = ipcRenderer.sendSync('query-sync', 'platform');
		cache.set(cacheKey, value);
		return value;
	},
	getHomeDir: () => {
		const cacheKey = 'homeDir';
		if (cache.has(cacheKey)) {
			return cache.get(cacheKey);
		}
		const value = ipcRenderer.sendSync('query-sync', 'homeDir');
		cache.set(cacheKey, value);
		return value;
	},
	fs: {
		read: (path) => ipcRenderer.invoke('fs:read', path),
		readBinary: (path) => ipcRenderer.invoke('fs:readBinary', path),
		write: (path, content) => ipcRenderer.invoke('fs:write', path, content),
		writeBinary: (path, content) => ipcRenderer.invoke('fs:writeBinary', path, content),
		delete: (path) => ipcRenderer.invoke('fs:delete', path),
		exists: (path) => ipcRenderer.invoke('fs:exists', path),
		mkdir: (path) => ipcRenderer.invoke('fs:mkdir', path),
		rmdir: (path) => ipcRenderer.invoke('fs:rmdir', path),
		readdir: (path) => ipcRenderer.invoke('fs:readdir', path),
		stat: (path) => ipcRenderer.invoke('fs:stat', path),
	}
}

contextBridge.exposeInMainWorld('electron', electronApi)
