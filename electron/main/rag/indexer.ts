import path from "node:path";
import crypto from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { webContents } from "electron";
import type { FSWatcher } from "chokidar";

import { getDb, runMigrations } from "@/main/rag/db";
import * as embedder from "@/main/rag/embedder";
import { chunkMarkdown } from "@/main/rag/chunker";
import { isBinaryFile } from "@/main/files";
import { getPreferences } from "@/main/preferences";
import { RAG_PROGRESS_CHANNEL, type RagProgress } from "@/shared/ragTypes";

const VAULT_ROOT = path.join(process.env.HOME ?? "", ".karabiner", "vault");
const MAX_FILE_BYTES = 1 * 1024 * 1024;
const BROADCAST_THROTTLE_MS = 200;
const WATCHER_DEBOUNCE_MS = 250;

let status: RagProgress = { state: "idle", total: 0, indexed: 0 };
const subscribers = new Set<(s: RagProgress) => void>();

let lastSentAt = 0;
let pendingFlush: ReturnType<typeof setTimeout> | null = null;

function broadcastNow(): void {
	lastSentAt = Date.now();
	if (pendingFlush) {
		clearTimeout(pendingFlush);
		pendingFlush = null;
	}
	for (const fn of subscribers) {
		try {
			fn(status);
		} catch {
			// ignore subscriber errors
		}
	}
	try {
		for (const wc of webContents.getAllWebContents()) {
			if (!wc.isDestroyed()) wc.send(RAG_PROGRESS_CHANNEL, status);
		}
	} catch {
		// no electron context (tests/etc)
	}
}

function setStatus(patch: Partial<RagProgress>): void {
	status = { ...status, ...patch };
	const isTerminal = status.state === "ready" || status.state === "error";
	if (isTerminal) {
		status.lastRunAt = Date.now();
	}
	const now = Date.now();
	if (isTerminal || now - lastSentAt >= BROADCAST_THROTTLE_MS) {
		broadcastNow();
		return;
	}
	if (pendingFlush) return;
	const wait = BROADCAST_THROTTLE_MS - (now - lastSentAt);
	pendingFlush = setTimeout(() => {
		pendingFlush = null;
		broadcastNow();
	}, Math.max(0, wait));
}

export function getStatus(): RagProgress {
	return status;
}

export function subscribeStatus(fn: (s: RagProgress) => void): () => void {
	subscribers.add(fn);
	return () => {
		subscribers.delete(fn);
	};
}

// MARK: file enumeration

function hasDotSegment(relPath: string): boolean {
	const parts = relPath.split(path.sep);
	return parts.some((p) => p.length > 0 && p.startsWith("."));
}

async function enumerateVaultFiles(): Promise<string[]> {
	const out: string[] = [];
	let entries: Array<{ name: string; isFile(): boolean; parentPath?: string; path?: string }>;
	try {
		entries = (await readdir(VAULT_ROOT, {
			withFileTypes: true,
			recursive: true,
		})) as unknown as Array<{ name: string; isFile(): boolean; parentPath?: string; path?: string }>;
	} catch (err) {
		console.error("[rag/indexer] readdir failed:", err);
		return out;
	}
	for (const ent of entries) {
		if (!ent.isFile()) continue;
		const parentDir: string = ent.parentPath ?? ent.path ?? VAULT_ROOT;
		const abs = path.join(parentDir, ent.name);
		const rel = path.relative(VAULT_ROOT, abs);
		if (hasDotSegment(rel)) continue;
		if (!ent.name.toLowerCase().endsWith(".md")) continue;
		try {
			const s = await stat(abs);
			if (s.size > MAX_FILE_BYTES) continue;
		} catch {
			continue;
		}
		out.push(abs);
	}
	return out;
}

// MARK: per-file pipeline

function vectorLiteral(vec: number[]): string {
	return "[" + vec.join(",") + "]";
}

let opChain: Promise<unknown> = Promise.resolve();
function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
	const next = opChain.then(fn, fn);
	opChain = next.catch(() => undefined);
	return next;
}

async function indexFileImpl(absPath: string): Promise<void> {
	let mtimeMs: number;
	let size: number;
	try {
		const s = await stat(absPath);
		mtimeMs = Math.floor(s.mtimeMs);
		size = s.size;
	} catch {
		return;
	}
	if (size > MAX_FILE_BYTES) return;
	if (!absPath.toLowerCase().endsWith(".md")) return;
	if (await isBinaryFile(absPath).catch(() => false)) return;

	const pg = await getDb();

	const existing = await pg.query<{ mtime_ms: string | number; content_hash: string }>(
		`SELECT mtime_ms, content_hash FROM files WHERE path = $1`,
		[absPath],
	);
	if (existing.rows.length > 0) {
		const dbMtime = Number(existing.rows[0].mtime_ms);
		if (dbMtime === mtimeMs) return;
	}

	let content: string;
	try {
		content = await readFile(absPath, "utf-8");
	} catch (err) {
		console.error("[rag/indexer] readFile failed:", absPath, err);
		return;
	}

	const contentHash = crypto.createHash("sha1").update(content).digest("hex");
	const now = Date.now();

	if (existing.rows.length > 0 && existing.rows[0].content_hash === contentHash) {
		await pg.query(
			`UPDATE files SET mtime_ms = $1, indexed_at = $2 WHERE path = $3`,
			[mtimeMs, now, absPath],
		);
		return;
	}

	const chunks = chunkMarkdown(content);
	let embeddings: number[][] = [];
	if (chunks.length > 0) {
		try {
			embeddings = await embedder.embedBatch(chunks.map((c) => c.content));
		} catch (err) {
			console.error("[rag/indexer] embedBatch failed:", absPath, err);
			throw err;
		}
	}

	await pg.transaction(async (tx) => {
		await tx.query(
			`INSERT INTO files (path, mtime_ms, indexed_at, content_hash)
			 VALUES ($1, $2, $3, $4)
			 ON CONFLICT (path) DO UPDATE SET
				mtime_ms = EXCLUDED.mtime_ms,
				indexed_at = EXCLUDED.indexed_at,
				content_hash = EXCLUDED.content_hash`,
			[absPath, mtimeMs, now, contentHash],
		);
		await tx.query(`DELETE FROM chunks WHERE file_path = $1`, [absPath]);
		for (let i = 0; i < chunks.length; i++) {
			const ch = chunks[i];
			const emb = embeddings[i];
			await tx.query(
				`INSERT INTO chunks (file_path, chunk_index, content, embedding, heading)
				 VALUES ($1, $2, $3, $4::vector, $5)`,
				[absPath, ch.chunkIndex, ch.content, vectorLiteral(emb), ch.heading],
			);
		}
	});
}

async function indexFile(absPath: string): Promise<void> {
	return runExclusive(() => indexFileImpl(absPath));
}

async function removeFile(absPath: string): Promise<void> {
	await runExclusive(async () => {
		const pg = await getDb();
		await pg.query(`DELETE FROM files WHERE path = $1`, [absPath]);
	});
}

async function removeDir(absPath: string): Promise<void> {
	await runExclusive(async () => {
		const pg = await getDb();
		const prefix = absPath.endsWith("/") ? absPath : absPath + "/";
		await pg.query(`DELETE FROM files WHERE path LIKE $1`, [prefix + "%"]);
	});
}

// MARK: full index pass

let cancelRequested = false;
let inFlight: Promise<void> | null = null;
let lastFullPassOk = false;

export function stopIndexing(): void {
	cancelRequested = true;
}

export async function startFullIndex(): Promise<void> {
	if (inFlight) return inFlight;
	cancelRequested = false;
	inFlight = (async () => {
		try {
			setStatus({ state: "loading-model", currentFile: undefined, errorMessage: undefined });
			try {
				await embedder.ensureLoaded();
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				setStatus({ state: "error", errorMessage: msg });
				lastFullPassOk = false;
				return;
			}

			const files = await enumerateVaultFiles();

			try {
				const pg = await getDb();
				const dbRows = await pg.query<{ path: string }>(`SELECT path FROM files`);
				const onDisk = new Set(files);
				for (const row of dbRows.rows) {
					if (!onDisk.has(row.path)) {
						await removeFile(row.path);
					}
				}
			} catch (err) {
				console.error("[rag/indexer] reconciliation failed:", err);
			}

			setStatus({ state: "indexing", total: files.length, indexed: 0, currentFile: undefined });

			for (const file of files) {
				if (cancelRequested) {
					setStatus({ state: "idle", currentFile: undefined });
					lastFullPassOk = false;
					return;
				}
				setStatus({ currentFile: file });
				try {
					await indexFile(file);
				} catch (err) {
					console.error("[rag/indexer] indexFile failed:", file, err);
				}
				status.indexed += 1;
				setStatus({ indexed: status.indexed });
			}

			setStatus({ state: "ready", currentFile: undefined });
			lastFullPassOk = true;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error("[rag/indexer] full index pass failed:", err);
			setStatus({ state: "error", errorMessage: msg });
			lastFullPassOk = false;
		} finally {
			inFlight = null;
		}
	})();
	return inFlight;
}

// MARK: watcher

let watcher: FSWatcher | null = null;
const pendingDebounce = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleWatcherUpdate(absPath: string): void {
	const existing = pendingDebounce.get(absPath);
	if (existing) clearTimeout(existing);
	const t = setTimeout(() => {
		pendingDebounce.delete(absPath);
		void (async () => {
			try {
				setStatus({ currentFile: absPath });
				await indexFile(absPath);
				if (lastFullPassOk && !inFlight && status.state !== "indexing") {
					setStatus({ state: "ready", currentFile: undefined });
				}
			} catch (err) {
				console.error("[rag/indexer] watcher indexFile failed:", absPath, err);
			}
		})();
	}, WATCHER_DEBOUNCE_MS);
	pendingDebounce.set(absPath, t);
}

export async function startWatcher(): Promise<void> {
	if (watcher) return;
	const chokidar = await import("chokidar");
	watcher = chokidar.watch(VAULT_ROOT, {
		ignoreInitial: true,
		ignored: [/(^|[\/\\])\..+/],
	});
	watcher.on("add", (p) => {
		if (!p.toLowerCase().endsWith(".md")) return;
		scheduleWatcherUpdate(p);
	});
	watcher.on("change", (p) => {
		if (!p.toLowerCase().endsWith(".md")) return;
		scheduleWatcherUpdate(p);
	});
	watcher.on("unlink", (p) => {
		const t = pendingDebounce.get(p);
		if (t) {
			clearTimeout(t);
			pendingDebounce.delete(p);
		}
		void removeFile(p).catch((err) =>
			console.error("[rag/indexer] removeFile failed:", p, err),
		);
	});
	watcher.on("unlinkDir", (p) => {
		void removeDir(p).catch((err) =>
			console.error("[rag/indexer] removeDir failed:", p, err),
		);
	});
	watcher.on("error", (err) => {
		console.error("[rag/indexer] watcher error:", err);
	});
}

export async function stopWatcher(): Promise<void> {
	if (!watcher) return;
	const w = watcher;
	watcher = null;
	for (const t of pendingDebounce.values()) clearTimeout(t);
	pendingDebounce.clear();
	try {
		await w.close();
	} catch (err) {
		console.error("[rag/indexer] watcher close failed:", err);
	}
}

// MARK: bootstrap

export async function bootstrap(): Promise<void> {
	try {
		await runMigrations();
	} catch (err) {
		console.error("[rag/indexer] migrations failed:", err);
		setStatus({ state: "error", errorMessage: err instanceof Error ? err.message : String(err) });
		return;
	}
	const auto = (getPreferences("rag.autoIndex") as boolean | undefined) ?? true;
	if (auto) {
		void embedder.ensureLoaded().catch((err) => {
			console.error("[rag/indexer] ensureLoaded failed:", err);
		});
		void startFullIndex().catch((err) => {
			console.error("[rag/indexer] startFullIndex failed:", err);
		});
		void startWatcher().catch((err) => {
			console.error("[rag/indexer] startWatcher failed:", err);
		});
	}
}
