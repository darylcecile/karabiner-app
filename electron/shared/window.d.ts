import type { KarabinerApi } from './electron'

declare global {
  interface Window {
    electron: KarabinerApi
  }
}

export {}
