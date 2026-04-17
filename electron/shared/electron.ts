import type { Config } from "@/main/config";

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
	},
	readConfig: () => Config
	setConfig: (key: string, value: any) => any,
	getConfig: (key: string) => any,
	setPreference: (key: string, value: any) => any,
	getPreference: (key: string) => any,
}

export interface FsApi {
	readDirectory(
		dirPath: string,
		options?: {
			includeHidden?: boolean;
			sort?: "name" | "folders-first";
		},
	): Promise<
		Array<{
			name: string;
			path: string;
			kind: "file" | "directory" | "symlink";
			mimeType: string | null;
			size: number | null;
			mtimeMs: number | null;
			hasChildren?: boolean;
		}>
	>;
	startScan(
		rootPath: string,
		options?: {
			includeHidden?: boolean;
			maxDepth?: number;
			ignore?: string[];
		},
	): Promise<string>;
	cancelScan(scanId: string): Promise<boolean>;
	onScanChunk(
		callback: (payload: {
			scanId: string;
			parentPath: string;
			entries: Array<{
				name: string;
				path: string;
				kind: "file" | "directory" | "symlink";
				mimeType: string | null;
				size: number | null;
				mtimeMs: number | null;
				hasChildren?: boolean;
			}>;
		}) => void,
	): () => void;
	onScanDone(
		callback: (payload: { scanId: string; rootPath: string }) => void,
	): () => void;
	onScanError(
		callback: (payload: { scanId: string; path: string; message: string }) => void,
	): () => void;

	createFile: (path: string) => Promise<void>;
	createDirectory: (path: string) => Promise<void>;
	rename: (oldPath: string, newPath: string) => Promise<void>;
	delete: (path: string) => Promise<void>;
}
