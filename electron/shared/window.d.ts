import type { KarabinerApi, FsApi } from '@/shared/electron';

declare global {
  interface Window {
    electron: KarabinerApi
	fsApi: FsApi
  }
}

export {}
