import crypto from "node:crypto";
import { activeScans, readDirectoryImpl, ReadDirectoryOptions, runScan, ScanOptions } from './fs';
import { getConfig, readConfig, setConfig } from './config';
import { getPreferences, setPreferences } from './preferences';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isBinaryFile } from '@/main/files';
import { createMainRelay, RelayMethodsOf, syncMethod } from '@karabiner/relay';


function resolvePath(p: string): string {
	if (p.startsWith("~")) {
		return path.join(process.env.HOME || process.env.USERPROFILE || "", p.slice(1));
	}
	return path.resolve(p);
}

export const mainRelay = createMainRelay({
	namespace: "karabiner:main",
	timeoutMs: 10_000,
	methods: {
		getConfig: syncMethod(getConfig),
		setConfig: syncMethod(setConfig),
		readConfig: syncMethod(readConfig),
		preferences: syncMethod((key: string, value?: any) => {
			if (value === undefined) {
				return getPreferences(key);
			}
			setPreferences(key, value);
		}),
		async readDirectory(dirPath: string, options?: ReadDirectoryOptions) {
			return await readDirectoryImpl(resolvePath(dirPath), options);
		},
		async startScan(rootPath: string, options?: ScanOptions) {
			const scanId = crypto.randomUUID();
			activeScans.set(scanId, {
				cancelled: false,
				webContentsId: 0, // not used in this context
			});

			void runScan(scanId, resolvePath(rootPath), options ?? {});
			return scanId;
		},
		async cancelScan(scanId: string) {
			const scan = activeScans.get(scanId);
			if (scan) scan.cancelled = true;
			return true;
		},
		async isBinaryFile(filePath: string) {
			return await isBinaryFile(resolvePath(filePath));
		},
		async readFile(filePath: string, encoding: BufferEncoding = "utf-8") {
			return await readFile(resolvePath(filePath), { encoding });
		},
		async writeFile(filePath: string, content: string, encoding: BufferEncoding = "utf-8") {
			const absPath = resolvePath(filePath);
			await mkdir(path.dirname(absPath), { recursive: true });
			await writeFile(absPath, content, { encoding });
			return true;
		},
		async createFile(filePath: string) {
			const absPath = resolvePath(filePath);
			await mkdir(path.dirname(absPath), { recursive: true });
			await writeFile(absPath, "");
			return true;
		},
		async createDirectory(dirPath: string) {
			await mkdir(resolvePath(dirPath), { recursive: true });
			return true;
		},
		async rename(oldPath: string, newPath: string) {
			await rename(resolvePath(oldPath), resolvePath(newPath));
			return true;
		},
		async delete(targetPath: string) {
			await rm(resolvePath(targetPath), { recursive: true, force: true });
			return true;
		},
		querySync: syncMethod((propertyName: string) => {
			if (propertyName === 'platform') {
				const platform = process.platform;
				switch (platform) {
					case 'darwin':
						return 'darwin';
					case 'win32':
						return 'win32';
					case 'linux':
						return 'linux';
					default:
						return 'unknown';
				}
			}
			if (propertyName === 'homeDir') {
				return process.env.HOME || process.env.USERPROFILE || '';
			}
			console.log('Unknown sync query:', propertyName);
			return 'unknown';
		}),
	},
});

export type MainRelay = typeof mainRelay;
export type MainRelayMethods = RelayMethodsOf<MainRelay>;
