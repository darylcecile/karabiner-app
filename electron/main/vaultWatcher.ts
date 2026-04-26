import path from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { BrowserWindow } from "electron";
import type { FSWatcher } from "chokidar";

const VAULT_ROOT = path.join(process.env.HOME ?? "", ".karabiner", "vault");

export type VaultFsChangeKind =
	| "add"
	| "change"
	| "unlink"
	| "addDir"
	| "unlinkDir";

export interface VaultFsChangeEvent {
	path: string;
	kind: VaultFsChangeKind;
}

const EVENT_CHANNEL = "vault:fs-change";
// Window during which a chokidar event for a path we just wrote is treated as
// our own. Generous because chokidar's awaitWriteFinish + macOS FSEvents
// coalescing can delay events by several hundred ms.
const SELF_WRITE_WINDOW_MS = 3000;
const DEBOUNCE_MS = 250;

interface SelfWriteRecord {
	timestamp: number;
	hash: string | null;
}

let watcher: FSWatcher | null = null;
const recentSelfWrites = new Map<string, SelfWriteRecord>();
const pending = new Map<string, { kind: VaultFsChangeKind; timer: ReturnType<typeof setTimeout> }>();

function hashContent(content: string | Buffer): string {
	const h = createHash("sha1");
	h.update(typeof content === "string" ? Buffer.from(content, "utf-8") : content);
	return h.digest("hex");
}

/**
 * Record a write performed by this app so the watcher can suppress the
 * resulting chokidar event. Pass `content` whenever it is cheaply available
 * (as a string or buffer) — it enables a content-hash safety net for events
 * that arrive outside the timestamp window.
 */
export function noteSelfWrite(absPath: string, content?: string | Buffer): void {
	const normalized = path.normalize(absPath);
	const hash = content !== undefined ? hashContent(content) : null;
	recentSelfWrites.set(normalized, { timestamp: Date.now(), hash });
	if (recentSelfWrites.size > 256) {
		const cutoff = Date.now() - SELF_WRITE_WINDOW_MS * 2;
		for (const [k, rec] of recentSelfWrites) {
			if (rec.timestamp < cutoff) recentSelfWrites.delete(k);
		}
	}
}

function withinTimestampWindow(record: SelfWriteRecord): boolean {
	return Date.now() - record.timestamp < SELF_WRITE_WINDOW_MS;
}

async function diskMatchesRecordedHash(absPath: string, hash: string): Promise<boolean> {
	try {
		const buf = await readFile(absPath);
		return hashContent(buf) === hash;
	} catch {
		// Missing or unreadable — treat as not-our-write so the renderer can react.
		return false;
	}
}

function broadcast(event: VaultFsChangeEvent): void {
	for (const win of BrowserWindow.getAllWindows()) {
		if (win.isDestroyed()) continue;
		try {
			win.webContents.send(EVENT_CHANNEL, event);
		} catch (err) {
			console.warn("[vaultWatcher] send failed:", err);
		}
	}
}

async function broadcastIfExternal(absPath: string, kind: VaultFsChangeKind): Promise<void> {
	const record = recentSelfWrites.get(absPath);

	if (record && withinTimestampWindow(record)) {
		// Fast path: very recent self-write; assume the event is ours.
		return;
	}

	if (record && record.hash !== null && (kind === "change" || kind === "add")) {
		// Slow path: outside the window but we still have a recorded hash. Read
		// the file once; if its content matches what we last wrote, this event
		// is still ours (chokidar/FSEvents was just slow).
		if (await diskMatchesRecordedHash(absPath, record.hash)) {
			return;
		}
	}

	broadcast({ path: absPath, kind });
}

function schedule(absPath: string, kind: VaultFsChangeKind): void {
	const normalized = path.normalize(absPath);

	// Cheap timestamp gate so we never even queue a debounce timer for the
	// editor's per-keystroke saves.
	if (kind === "change" || kind === "add" || kind === "unlink") {
		const record = recentSelfWrites.get(normalized);
		if (record && withinTimestampWindow(record)) {
			return;
		}
	}

	const existing = pending.get(normalized);
	if (existing) clearTimeout(existing.timer);

	const timer = setTimeout(() => {
		pending.delete(normalized);
		void broadcastIfExternal(normalized, kind).catch((err) => {
			console.warn("[vaultWatcher] broadcast failed:", normalized, err);
		});
	}, DEBOUNCE_MS);
	pending.set(normalized, { kind, timer });
}

export async function startVaultWatcher(): Promise<void> {
	if (watcher) return;
	const chokidar = await import("chokidar");
	watcher = chokidar.watch(VAULT_ROOT, {
		ignoreInitial: true,
		// Skip dotfiles, transient *.tmp files used by atomic writes, and
		// editor backup files so we never spend cycles processing them.
		ignored: [
			/(^|[\/\\])\..+/,
			/\.tmp$/i,
			/~$/,
		],
		awaitWriteFinish: {
			stabilityThreshold: 200,
			pollInterval: 50,
		},
	});

	watcher.on("add", (p) => schedule(p, "add"));
	watcher.on("change", (p) => schedule(p, "change"));
	watcher.on("unlink", (p) => schedule(p, "unlink"));
	watcher.on("addDir", (p) => {
		if (path.normalize(p) === path.normalize(VAULT_ROOT)) return;
		schedule(p, "addDir");
	});
	watcher.on("unlinkDir", (p) => schedule(p, "unlinkDir"));
	watcher.on("error", (err) => {
		console.error("[vaultWatcher] watcher error:", err);
	});
}

export async function stopVaultWatcher(): Promise<void> {
	if (!watcher) return;
	const w = watcher;
	watcher = null;
	for (const entry of pending.values()) clearTimeout(entry.timer);
	pending.clear();
	try {
		await w.close();
	} catch (err) {
		console.error("[vaultWatcher] close failed:", err);
	}
}
