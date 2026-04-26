import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { MainRelayMethods } from '@/main/ipcMethods';
import { exposeRelay } from '@karabiner/relay';

contextBridge.exposeInMainWorld('karabinerFiles', {
	getPathForFile: (file: File): string => {
		try {
			return webUtils.getPathForFile(file);
		} catch {
			return '';
		}
	},
});


exposeRelay<MainRelayMethods>(contextBridge, "mainRelay", ipcRenderer, {
	namespace: "karabiner:main",
});

const ALLOWED_EVENT_CHANNELS = new Set([
	'rag:progress',
	'fs:scanChunk',
	'fs:scanDone',
	'fs:scanError',
	'search:focus-input',
	'search:open-file',
	'workspace:open-url',
]);

contextBridge.exposeInMainWorld('karabinerEvents', {
	on: (channel: string, listener: (payload: any) => void) => {
		if (!ALLOWED_EVENT_CHANNELS.has(channel)) {
			console.warn(`[karabinerEvents] Rejected subscription to non-whitelisted channel: ${channel}`);
			return () => {};
		}
		const wrapped = (_e: unknown, payload: any) => listener(payload);
		ipcRenderer.on(channel, wrapped as any);
		return () => ipcRenderer.off(channel, wrapped as any);
	},
});
