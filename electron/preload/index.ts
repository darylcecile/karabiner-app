import { contextBridge, ipcRenderer } from 'electron'
import type { MainRelayMethods } from '@/main/ipcMethods';
import { exposeRelay } from '@karabiner/relay';


exposeRelay<MainRelayMethods>(contextBridge, "mainRelay", ipcRenderer, {
	namespace: "karabiner:main",
});
