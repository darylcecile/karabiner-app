import { contextBridge, ipcRenderer } from 'electron'

import type { KarabinerApi, FsApi } from '@/shared/electron';
import type { DirEntry, ReadDirectoryOptions, ScanOptions } from '@/main/fs';

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
	},
	readConfig: () => ipcRenderer.sendSync('config', ''),
	setConfig: (key, value) => ipcRenderer.sendSync('config', key, value),
	getConfig: (key) => ipcRenderer.sendSync('config', key),
	setPreference: (key, value) => ipcRenderer.sendSync('preferences', key, value),
	getPreference: (key) => ipcRenderer.sendSync('preferences', key),
};

const fsApi: FsApi = {
	readDirectory(dirPath: string, options?: ReadDirectoryOptions): Promise<DirEntry[]> {
		return ipcRenderer.invoke("fs:readDirectory", dirPath, options);
	},

	startScan(rootPath: string, options?: ScanOptions): Promise<string> {
		return ipcRenderer.invoke("fs:startScan", rootPath, options);
	},

	cancelScan(scanId: string): Promise<boolean> {
		return ipcRenderer.invoke("fs:cancelScan", scanId);
	},

	onScanChunk(callback: (payload: { scanId: string; parentPath: string; entries: DirEntry[] }) => void) {
		const handler = (_event: Electron.IpcRendererEvent, payload: { scanId: string; parentPath: string; entries: DirEntry[] }) => {
			callback(payload);
		};
		ipcRenderer.on("fs:scanChunk", handler);
		return () => ipcRenderer.removeListener("fs:scanChunk", handler);
	},

	onScanDone(callback: (payload: { scanId: string; rootPath: string }) => void) {
		const handler = (_event: Electron.IpcRendererEvent, payload: { scanId: string; rootPath: string }) => {
			callback(payload);
		};
		ipcRenderer.on("fs:scanDone", handler);
		return () => ipcRenderer.removeListener("fs:scanDone", handler);
	},

	onScanError(
		callback: (payload: { scanId: string; path: string; message: string }) => void,
	) {
		const handler = (
			_event: Electron.IpcRendererEvent,
			payload: { scanId: string; path: string; message: string },
		) => {
			callback(payload);
		};
		ipcRenderer.on("fs:scanError", handler);
		return () => ipcRenderer.removeListener("fs:scanError", handler);
	},

	createFile: (path: string) => ipcRenderer.invoke("fs:createFile", path),
	createDirectory: (path: string) => ipcRenderer.invoke("fs:createDirectory", path),
	rename: (oldPath: string, newPath: string) => ipcRenderer.invoke("fs:rename", oldPath, newPath),
	delete: (path: string) => ipcRenderer.invoke("fs:delete", path),
};

contextBridge.exposeInMainWorld('electron', electronApi);
contextBridge.exposeInMainWorld("fsApi", fsApi);
