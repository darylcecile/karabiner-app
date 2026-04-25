import type { KarabinerApi, FsApi } from '@/shared/electron';

declare global {
  interface Window {
    // electron: KarabinerApi
	// fsApi: FsApi
	ipcRelay: Record<string, (...args: any[]) => unknown> & {
		_syncMap: () => Record<string, "sync" | "async">;
	}
  }
}

export {}
