import crypto from "node:crypto";
import { activeScans, readDirectoryImpl, ReadDirectoryOptions, runScan, ScanOptions } from './fs';
import { getConfig, readConfig, setConfig } from './config';
import { getPreferences, setPreferences } from './preferences';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isBinaryFile } from '@/main/files';
import { getAIAvailability, getActiveProvider } from '@/main/ai/resolver';
import { getCachedLabel, setCachedLabel } from '@/main/ai/labelCache';
import { createMainRelay, RelayMethodsOf, syncMethod } from '@karabiner/relay';
import type { RagProgress } from '@/shared/ragTypes';
import * as ragIndexer from '@/main/rag/indexer';
import { showSearch, hideSearch, toggleSearch } from '@/main/searchWindow';
import { getMainWindow } from '@/main/index';


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
		async aiAvailability() {
			return await getAIAvailability();
		},
		async getFileLabel(absPath: string) {
			try {
				const resolved = resolvePath(absPath);
				let mtimeMs: number | undefined;
				try {
					const s = await stat(resolved);
					mtimeMs = s.mtimeMs;
				} catch {
					return null;
				}
				const entry = await getCachedLabel(resolved, mtimeMs);
				if (!entry) return null;
				return { label: entry.label, emoji: entry.emoji, category: entry.category };
			} catch (err) {
				console.error("getFileLabel failed:", err);
				return null;
			}
		},
		async regenerateFileLabel(absPath: string) {
			try {
				const resolved = resolvePath(absPath);
				let mtimeMs: number;
				try {
					const s = await stat(resolved);
					mtimeMs = s.mtimeMs;
				} catch {
					return null;
				}
				if (await isBinaryFile(resolved)) return null;
				const provider = await getActiveProvider();
				if (!provider) return null;
				let content: string;
				try {
					content = await readFile(resolved, "utf-8");
				} catch {
					return null;
				}
				const truncated = content.length > 4000 ? content.slice(0, 4000) : content;
				const filename = path.basename(resolved);
				const result = await provider.generateFileMetadata(truncated, filename).catch(() => null);
				if (!result) return null;
				await setCachedLabel(resolved, {
					label: result.label,
					emoji: result.emoji,
					category: result.category,
					mtimeMs,
					generatedAt: Date.now(),
				}).catch((err) => {
					console.error("setCachedLabel failed:", err);
				});
				return { label: result.label, emoji: result.emoji, category: result.category };
			} catch (err) {
				console.error("regenerateFileLabel failed:", err);
				return null;
			}
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
		async ragGetStatus(): Promise<RagProgress> {
			return ragIndexer.getStatus();
		},
		async ragStartIndexing(): Promise<void> {
			void ragIndexer.startFullIndex().catch((err) => {
				console.error('ragStartIndexing failed:', err);
			});
		},
		async ragStopIndexing(): Promise<void> {
			ragIndexer.stopIndexing();
		},
		async ragSetAutoIndex(enabled: boolean): Promise<void> {
			setPreferences('rag.autoIndex', enabled);
			if (enabled) {
				void ragIndexer.startFullIndex().catch((err) => {
					console.error('ragSetAutoIndex startFullIndex failed:', err);
				});
				void ragIndexer.startWatcher().catch((err) => {
					console.error('ragSetAutoIndex startWatcher failed:', err);
				});
			} else {
				ragIndexer.stopIndexing();
				void ragIndexer.stopWatcher().catch((err) => {
					console.error('ragSetAutoIndex stopWatcher failed:', err);
				});
			}
		},
		async ragGetAutoIndex(): Promise<boolean> {
			return getPreferences('rag.autoIndex') ?? true;
		},
		async ragSearch(query: string, opts?: { limit?: number }) {
			const { search } = await import('@/main/rag/search');
			return await search(query, opts);
		},
		searchShow: syncMethod(() => { showSearch(); }),
		searchHide: syncMethod(() => { hideSearch(); }),
		searchToggle: syncMethod(() => { toggleSearch(); }),
		async searchOpenFile(absPath: string) {
			hideSearch();
			const mw = getMainWindow();
			if (!mw || mw.isDestroyed()) return false;
			if (mw.isMinimized()) mw.restore();
			mw.show();
			mw.focus();
			mw.webContents.send('search:open-file', { path: absPath });
			return true;
		},
	},
});

export type MainRelay = typeof mainRelay;
export type MainRelayMethods = RelayMethodsOf<MainRelay>;
