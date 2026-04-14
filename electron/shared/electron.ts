export interface KarabinerApi {
  ping: () => Promise<string>,
  getPlatform: () => Promise<"darwin" | "win32" | "linux" | "unknown">,
}
