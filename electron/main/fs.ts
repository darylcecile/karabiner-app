import path from 'node:path';
import { readdir, lstat, readFile } from 'node:fs/promises';
import { lookup as lookupMime } from "mime-types";
import { webContents } from 'electron';
import { Path } from '@/shared/fsUtils';
import { existsSync } from 'node:fs';
import yaml from "yaml";

type EntryKind = "file" | "directory" | "symlink";

export type DirEntry = {
	name: string;
	path: string;
	kind: EntryKind;
	mimeType: string | null;
	size: number | null;
	mtimeMs: number | null;
	hasChildren?: boolean;
	metadata?: Record<string, any>;
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

function isRecord(value: unknown): value is Record<string, any> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeMetadataPayload(value: unknown): value is Record<string, any> {
	return (
		isRecord(value) &&
		("icon" in value || "tint" in value || "gitChanges" in value)
	);
}

async function readMetadataFile(metadataFilePath: string): Promise<Record<string, any> | undefined> {
	if (!existsSync(metadataFilePath)) {
		return undefined;
	}

	const content = await readFile(metadataFilePath, "utf-8");
	if (!content) {
		return undefined;
	}

	try {
		const parsed = yaml.parse(content);
		return isRecord(parsed) ? parsed : undefined;
	} catch {
		// Invalid YAML should not break directory reads.
		return undefined;
	}
}

function extractMetadataEntry(
	metadataMap: Record<string, any> | undefined,
	targetPath: string,
): Record<string, any> | undefined {
	if (!metadataMap) {
		return undefined;
	}

	const normalizedTargetPath = Path.normalize(targetPath);
	const targetName = path.basename(normalizedTargetPath);

	const directMatch = metadataMap[normalizedTargetPath];
	if (isRecord(directMatch)) {
		return directMatch;
	}

	const basenameMatch = metadataMap[targetName];
	if (isRecord(basenameMatch)) {
		return basenameMatch;
	}

	if (looksLikeMetadataPayload(metadataMap)) {
		return metadataMap;
	}

	return undefined;
}

async function getMetadata(
	targetPath: string,
	isDirectory: boolean,
): Promise<Record<string, any> | undefined> {
	const normalizedTargetPath = Path.normalize(targetPath);
	const candidateMetadataFiles = [
		isDirectory ? path.join(normalizedTargetPath, ".metadata") : null,
		path.join(path.dirname(normalizedTargetPath), ".metadata"),
	].filter((candidate): candidate is string => Boolean(candidate));

	for (const metadataFilePath of candidateMetadataFiles) {
		const metadataMap = await readMetadataFile(metadataFilePath);
		const metadata = extractMetadataEntry(metadataMap, normalizedTargetPath);

		if (metadata) {
			return metadata;
		}
	}

	return undefined;
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
			metadata: await getMetadata(fullPath, true),
		};
	}

	return {
		name,
		path: Path.normalize(fullPath),
		kind: "file",
		mimeType: (lookupMime(name) || null) as string | null,
		size: stat.size,
		mtimeMs: stat.mtimeMs,
		metadata: await getMetadata(fullPath, false),
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
