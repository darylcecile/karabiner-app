import { contextBridge, ipcRenderer } from 'electron'
import type { MainRelay } from '@/main/ipcMethods';
import { createPreloadTerminal } from '@karabiner/relay';


createPreloadTerminal<MainRelay>(contextBridge, ipcRenderer);
