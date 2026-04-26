import crypto from "node:crypto";
import { app, nativeImage, shell } from 'electron';
import { activeScans, readDirectoryImpl, ReadDirectoryOptions, runScan, ScanOptions } from './fs';
import { getConfig, readConfig, setConfig } from './config';
import { getPreferences, setPreferences } from './preferences';
import { mkdir, readFile, rename, rm, stat, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { isBinaryFile } from '@/main/files';
import { getAIAvailability, getActiveProvider, clearAIAvailabilityCache } from '@/main/ai/resolver';
import { isLabelEchoingFilename } from '@/main/ai/index';
import {
	extractMarkdownHeading,
	isMarkdownExtension,
	prependMarkdownHeading,
} from '@/main/ai/markdownHeading';
import { getCachedLabel, setCachedLabel } from '@/main/ai/labelCache';
import { createMainRelay, RelayMethodsOf, syncMethod } from '@karabiner/relay';
import type { RagProgress } from '@/shared/ragTypes';
import { CanvasDataSchema, parseCanvas, type CanvasData } from '@/shared/canvasTypes';
import * as ragIndexer from '@/main/rag/indexer';
import { showSearch, hideSearch, toggleSearch } from '@/main/searchWindow';
import { getMainWindow } from '@/main/index';
import { showFileTreeContextMenu, type FileTreeMenuPayload } from '@/main/contextMenu';


function resolvePath(p: string): string {
	if (p.startsWith("~")) {
		return path.join(process.env.HOME || process.env.USERPROFILE || "", p.slice(1));
	}
	return path.resolve(p);
}

async function uniqueDestName(destDir: string, baseName: string): Promise<string> {
	const exists = async (name: string) => {
		try {
			await stat(path.join(destDir, name));
			return true;
		} catch {
			return false;
		}
	};
	if (!(await exists(baseName))) return baseName;
	const ext = path.extname(baseName);
	const stem = ext ? baseName.slice(0, -ext.length) : baseName;
	for (let i = 1; i < 1000; i++) {
		const candidate = i === 1 ? `${stem} copy${ext}` : `${stem} copy ${i}${ext}`;
		if (!(await exists(candidate))) return candidate;
	}
	return `${stem}-${Date.now()}${ext}`;
}

// 16x16 transparent PNG, used when app.getFileIcon hasn't resolved yet or fails.
const FALLBACK_DRAG_ICON = nativeImage.createFromDataURL(
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAH0lEQVR42mNkYGD4z0AEYBxVSF+FjKMK6auQcVQhfRUCAEOVAQGgFha3AAAAAElFTkSuQmCC',
);

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
			// Provider config (api keys, urls, models) influences detection &
			// instance state — invalidate so the next request re-evaluates.
			if (key === 'ai.provider' || key.startsWith('ai.openai') || key.startsWith('ai.ollama')) {
				clearAIAvailabilityCache();
			}
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
		async readCanvas(
			absPath: string,
		): Promise<{ data: CanvasData; error?: undefined } | { data?: undefined; error: string }> {
			try {
				const resolved = resolvePath(absPath);
				let raw: string;
				try {
					raw = await readFile(resolved, { encoding: "utf-8" });
				} catch (err: any) {
					if (err && (err.code === "ENOENT" || err.code === "ENOTDIR")) {
						return { error: "File not found" };
					}
					console.error("readCanvas read failed:", err);
					return { error: err instanceof Error ? err.message : String(err) };
				}
				const trimmed = raw.trim();
				if (trimmed === "" || trimmed === "{}") {
					return { data: { nodes: [], edges: [] } };
				}
				try {
					const data = parseCanvas(raw);
					return { data };
				} catch (err) {
					console.warn("readCanvas parse failed:", err);
					return { error: err instanceof Error ? err.message : String(err) };
				}
			} catch (err) {
				console.error("readCanvas failed:", err);
				return { error: err instanceof Error ? err.message : String(err) };
			}
		},
		async writeCanvas(
			absPath: string,
			data: CanvasData,
		): Promise<{ ok: true; error?: undefined } | { ok?: undefined; error: string }> {
			try {
				const parsed = CanvasDataSchema.safeParse(data);
				if (!parsed.success) {
					const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
					console.warn('[canvas] writeCanvas validation failed:', msg);
					return { error: msg };
				}
				const resolved = resolvePath(absPath);
				const json = JSON.stringify(parsed.data, null, '\t');
				const tmp = `${resolved}.tmp`;
				try {
					await mkdir(path.dirname(resolved), { recursive: true });
					await writeFile(tmp, json, { encoding: 'utf-8' });
					await rename(tmp, resolved);
					return { ok: true };
				} catch (err) {
					console.error('[canvas] writeCanvas failed:', err);
					try {
						await rm(tmp, { force: true });
					} catch {
						// ignore cleanup failure
					}
					return { error: err instanceof Error ? err.message : String(err) };
				}
			} catch (err) {
				console.error('[canvas] writeCanvas failed:', err);
				return { error: err instanceof Error ? err.message : String(err) };
			}
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
				if (getPreferences("ai.labelGeneration") === false) {
					console.warn(`[regenerateFileLabel] bail: ai.labelGeneration disabled (${absPath})`);
					return null;
				}
				const resolved = resolvePath(absPath);
				let mtimeMs: number;
				try {
					const s = await stat(resolved);
					mtimeMs = s.mtimeMs;
				} catch (err) {
					console.warn(`[regenerateFileLabel] bail: stat failed for ${resolved}:`, err);
					return null;
				}
				if (await isBinaryFile(resolved)) {
					console.warn(`[regenerateFileLabel] bail: binary file ${resolved}`);
					return null;
				}
				let content: string;
				try {
					content = await readFile(resolved, "utf-8");
				} catch (err) {
					console.warn(`[regenerateFileLabel] bail: readFile failed for ${resolved}:`, err);
					return null;
				}
				const filename = path.basename(resolved);
				const ext = path.extname(resolved);
				const isMarkdown = isMarkdownExtension(ext);

				// Fast path: if the markdown file already starts with an H1/H2,
				// use that as the label without calling the provider.
				if (isMarkdown) {
					const heading = extractMarkdownHeading(content);
					if (heading && heading.label.trim().length > 0) {
						const entry = {
							label: heading.label,
							emoji: heading.emoji || "📝",
							category: "Notes",
							mtimeMs,
							generatedAt: Date.now(),
						};
						await setCachedLabel(resolved, entry).catch((err) => {
							console.error("setCachedLabel failed:", err);
						});
						return { label: entry.label, emoji: entry.emoji, category: entry.category };
					}
				}

				const provider = await getActiveProvider();
				if (!provider) {
					console.warn(`[regenerateFileLabel] bail: no active AI provider (${resolved})`);
					return null;
				}
				const truncated = content.length > 4000 ? content.slice(0, 4000) : content;
				if (truncated.trim().length < 20) {
					console.warn(
						`[regenerateFileLabel] bail: content too short to summarise (${truncated.trim().length} chars) for ${filename}`,
					);
					return null;
				}
				const result = await provider.generateFileMetadata(truncated, filename).catch((err) => {
					console.warn(`[regenerateFileLabel] bail: provider threw for ${filename}:`, err);
					return null;
				});
				if (!result) {
					console.warn(`[regenerateFileLabel] bail: provider returned no result for ${filename}`);
					return null;
				}
				if (!result.label || result.label.trim().length === 0) {
					console.warn(`[regenerateFileLabel] bail: provider returned empty label for ${filename}`);
					return null;
				}
				if (isLabelEchoingFilename(result.label, filename)) {
					console.warn(
						`[regenerateFileLabel] bail: label echoes filename — "${result.label}" vs "${filename}"`,
					);
					return null;
				}

				// For markdown files that lacked a heading, write the generated label
				// back as an H1 so it becomes the source of truth on next read and
				// the user can edit it directly in the file.
				if (isMarkdown) {
					try {
						const updated = prependMarkdownHeading(content, result.label, result.emoji);
						const tmp = `${resolved}.tmp`;
						try {
							await writeFile(tmp, updated, { encoding: "utf-8" });
							await rename(tmp, resolved);
						} catch (writeErr) {
							try { await rm(tmp, { force: true }); } catch {}
							throw writeErr;
						}
						const s = await stat(resolved);
						mtimeMs = s.mtimeMs;
					} catch (err) {
						console.warn(
							`[regenerateFileLabel] heading prepend failed for ${filename}; caching label only:`,
							err,
						);
					}
				}

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
		async clearLabelCache() {
			try {
				const { clearAllCachedLabels } = await import('@/main/ai/labelCache');
				const cleared = await clearAllCachedLabels();
				return { cleared };
			} catch (err) {
				console.error("clearLabelCache failed:", err);
				return { cleared: 0, error: err instanceof Error ? err.message : String(err) };
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
		async ragSearch(query: string, opts?: { limit?: number; forceAsk?: boolean }) {
			const { search } = await import('@/main/rag/search');
			return await search(query, opts);
		},
		async openExternal(url: string): Promise<{ ok: true; error?: undefined } | { ok?: undefined; error: string }> {
			try {
				let parsed: URL;
				try {
					parsed = new URL(url);
				} catch {
					return { error: 'Invalid URL' };
				}
				const allowed = new Set(['http:', 'https:', 'mailto:']);
				if (!allowed.has(parsed.protocol)) {
					return { error: `Refused to open URL with protocol "${parsed.protocol}"` };
				}
				await shell.openExternal(url);
				return { ok: true };
			} catch (err) {
				console.error('openExternal failed:', err);
				return { error: err instanceof Error ? err.message : String(err) };
			}
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
		async showTreeContextMenu(payload: FileTreeMenuPayload) {
			const mw = getMainWindow();
			if (!mw || mw.isDestroyed()) return { action: null };
			return await showFileTreeContextMenu(payload, mw);
		},
		async revealInFinder(absPath: string) {
			try {
				shell.showItemInFolder(absPath);
				return { ok: true as const };
			} catch (err) {
				return { error: err instanceof Error ? err.message : String(err) };
			}
		},
		async importPaths(srcPaths: string[], destDirAbs: string) {
			const dest = resolvePath(destDirAbs);
			try {
				const destStat = await stat(dest);
				if (!destStat.isDirectory()) {
					return { error: 'Destination is not a directory.' };
				}
			} catch {
				return { error: 'Destination directory does not exist.' };
			}

			const imported: string[] = [];
			const errors: { src: string; error: string }[] = [];

			for (const rawSrc of srcPaths) {
				const src = resolvePath(rawSrc);
				if (!src) continue;
				try {
					const srcStat = await stat(src);
					// Refuse to copy a directory into itself or a descendant.
					if (srcStat.isDirectory() && (dest === src || dest.startsWith(src + path.sep))) {
						errors.push({ src, error: 'Cannot copy a folder into itself.' });
						continue;
					}
					const baseName = path.basename(src);
					const finalName = await uniqueDestName(dest, baseName);
					const target = path.join(dest, finalName);
					if (srcStat.isDirectory()) {
						await cp(src, target, { recursive: true, errorOnExist: true, force: false });
					} else {
						await cp(src, target, { errorOnExist: true, force: false });
					}
					imported.push(target);
				} catch (err) {
					errors.push({ src, error: err instanceof Error ? err.message : String(err) });
				}
			}
			return { imported, errors };
		},
		async startFileDrag(absPaths: string[]) {
			const mw = getMainWindow();
			if (!mw || mw.isDestroyed()) return { ok: false as const };
			const paths = absPaths.map((p) => resolvePath(p)).filter((p) => !!p);
			if (paths.length === 0) return { ok: false as const };

			let icon = FALLBACK_DRAG_ICON;
			try {
				const got = await app.getFileIcon(paths[0], { size: 'normal' });
				if (got && !got.isEmpty()) icon = got;
			} catch {
				// fall back to default
			}

			try {
				mw.webContents.startDrag({
					file: paths[0],
					files: paths,
					icon,
				});
				return { ok: true as const };
			} catch (err) {
				return { error: err instanceof Error ? err.message : String(err) };
			}
		},
		async saveImageToWorkspace(srcPath: string, workspaceRoot: string) {
			const src = resolvePath(srcPath);
			const root = resolvePath(workspaceRoot);
			if (!src || !root) return { error: 'Invalid source or workspace path.' };
			try {
				const s = await stat(src);
				if (!s.isFile()) return { error: 'Source is not a file.' };
			} catch {
				return { error: 'Source file does not exist.' };
			}
			const assetsDir = path.join(root, 'assets');
			try {
				await mkdir(assetsDir, { recursive: true });
			} catch (err) {
				return { error: err instanceof Error ? err.message : String(err) };
			}
			const baseName = path.basename(src);
			const finalName = await uniqueDestName(assetsDir, baseName);
			const target = path.join(assetsDir, finalName);
			try {
				await cp(src, target, { errorOnExist: true, force: false });
			} catch (err) {
				return { error: err instanceof Error ? err.message : String(err) };
			}
			return { absPath: target };
		},
	},
});

export type MainRelay = typeof mainRelay;
export type MainRelayMethods = RelayMethodsOf<MainRelay>;
