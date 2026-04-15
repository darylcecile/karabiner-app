export interface KarabinerApi {
  ping: () => Promise<string>,
  getPlatform: () => "darwin" | "win32" | "linux" | "unknown",
  getHomeDir: () => string,
  fs: {
	read: (path: string) => Promise<string>,
	readBinary: (path: string) => Promise<ArrayBuffer>,
	write: (path: string, content: string) => Promise<void>,
	writeBinary: (path: string, content: ArrayBuffer) => Promise<void>,
	delete: (path: string) => Promise<void>,
	exists: (path: string) => Promise<boolean>,
	mkdir: (path: string) => Promise<void>,
	rmdir: (path: string) => Promise<void>,
	readdir: (path: string) => Promise<string[]>,
	stat: (path: string) => Promise<{ isFile: boolean, isDirectory: boolean, size: number, mtimeMs: number }>,
  }
}
