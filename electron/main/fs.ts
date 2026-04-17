import path from 'node:path';
import { readdir, lstat } from 'node:fs/promises';
import { lookup as lookupMime } from "mime-types";
import { webContents } from 'electron';
import { Path } from '@/shared/fsUtils';

type EntryKind = "file" | "directory" | "symlink";

export type DirEntry = {
	name: string;
	path: string;
	kind: EntryKind;
	mimeType: string | null;
	size: number | null;
	mtimeMs: number | null;
	hasChildren?: boolean;
};

export type ScanOptions = {
	includeHidden?: boolean;
	maxDepth?: number;
	ignore?: string[];
};

export type ReadDirectoryOptions = {
	includeHidden?: boolean;
};

export const activeScans = new Map<string, { cancelled: boolean; webContentsId: number }>();

function isHidden(name: string): boolean {
	return name.startsWith(".");
}

function shouldIgnore(name: string, ignore: string[] = []): boolean {
	return ignore.includes(name);
}

function sortEntries(entries: DirEntry[]): DirEntry[] {
	//  we sort directories first, then files, and within those groups we sort alphabetically by name. This is a common convention in file explorers.
	return entries.sort((a, b) => {
		if (a.kind === b.kind) {
			return a.name.localeCompare(b.name);
		}
		if (a.kind === "directory") return -1;
		if (b.kind === "directory") return 1;
		return 0;
	});
}

async function getHasChildren(dirPath: string): Promise<boolean> {
	try {
		const children = await readdir(Path.normalize(dirPath));
		return children.length > 0;
	} catch {
		return false;
	}
}

async function toDirEntry(fullPath: string, name: string): Promise<DirEntry> {
	const stat = await lstat(Path.normalize(fullPath));

	if (stat.isSymbolicLink()) {
		return {
			name,
			path: Path.normalize(fullPath),
			kind: "symlink",
			mimeType: null,
			size: null,
			mtimeMs: stat.mtimeMs,
		};
	}

	if (stat.isDirectory()) {
		return {
			name,
			path: Path.normalize(fullPath),
			kind: "directory",
			mimeType: null,
			size: null,
			mtimeMs: stat.mtimeMs,
			hasChildren: await getHasChildren(fullPath),
		};
	}

	return {
		name,
		path: Path.normalize(fullPath),
		kind: "file",
		mimeType: (lookupMime(name) || null) as string | null,
		size: stat.size,
		mtimeMs: stat.mtimeMs,
	};
}

export async function readDirectoryImpl(
	dirPath: string,
	options: ReadDirectoryOptions = {},
): Promise<DirEntry[]> {
	const dirents = await readdir(Path.normalize(dirPath), { withFileTypes: true });

	const filtered = dirents.filter((dirent) => {
		if (!options.includeHidden && isHidden(dirent.name)) return false;
		return true;
	});

	const entries = await Promise.all(
		filtered.map(async (dirent) => {
			const fullPath = path.join(Path.normalize(dirPath), dirent.name);
			return toDirEntry(fullPath, dirent.name);
		}),
	);

	return sortEntries(entries);
}

async function emitToRenderer(webContentsId: number, channel: string, payload: unknown): Promise<void> {
	const contents = webContents.fromId(webContentsId);
	if (!contents || contents.isDestroyed()) return;
	contents.send(channel, payload);
}

export async function runScan(scanId: string, rootPath: string, options: ScanOptions): Promise<void> {
	const scan = activeScans.get(scanId);
	if (!scan) return;

	const ignore = options.ignore ?? ["node_modules", ".git", "dist", "build", ".next"];
	const maxDepth = options.maxDepth ?? Infinity;

	async function walk(dirPath: string, depth: number): Promise<void> {
		const current = activeScans.get(scanId);
		if (!current || current.cancelled) return;
		if (depth > maxDepth) return;

		let entries: DirEntry[];
		try {
			const raw = await readdir(dirPath, { withFileTypes: true });
			const filtered = raw.filter((dirent) => {
				if (!options.includeHidden && isHidden(dirent.name)) return false;
				if (shouldIgnore(dirent.name, ignore)) return false;
				return true;
			});

			entries = await Promise.all(
				filtered.map(async (dirent) => {
					const fullPath = path.join(dirPath, dirent.name);
					return toDirEntry(fullPath, dirent.name);
				}),
			);

			entries = sortEntries(entries);
		} catch (error) {
			await emitToRenderer(scan!.webContentsId, "fs:scanError", {
				scanId,
				path: dirPath,
				message: error instanceof Error ? error.message : String(error),
			});
			return;
		}

		await emitToRenderer(scan!.webContentsId, "fs:scanChunk", {
			scanId,
			parentPath: dirPath,
			entries,
		});

		for (const entry of entries) {
			const currentScan = activeScans.get(scanId);
			if (!currentScan || currentScan.cancelled) return;

			if (entry.kind === "directory") {
				await walk(entry.path, depth + 1);
			}
		}
	}

	try {
		await walk(Path.normalize(rootPath), 0);
		const current = activeScans.get(scanId);
		if (current && !current.cancelled) {
			await emitToRenderer(scan.webContentsId, "fs:scanDone", { scanId, rootPath: Path.normalize(rootPath) });
		}
	} finally {
		activeScans.delete(scanId);
	}
}