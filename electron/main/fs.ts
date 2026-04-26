import path from 'node:path';
import { readdir, lstat, readFile } from 'node:fs/promises';
import { lookup as lookupMime } from "mime-types";
import { webContents } from 'electron';
import { Path } from '@/shared/fsUtils';
import { existsSync } from 'node:fs';
import yaml from "yaml";
import { FSReplay } from './vaultTemplates';

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
export async function setUpAppDir() {
	const vaultPath = '~/.karabiner/vault';
	const assetPath = '~/.karabiner/assets';

	const absVaultPath = vaultPath.replace("~", process.env.HOME || "");
	const absAssetPath = assetPath.replace("~", process.env.HOME || "");

	if (!existsSync(absVaultPath)) {
		const defaultActions = FSReplay.defineOperations([
			{ type: 'createDirectory', path: absVaultPath },
			{ type: 'createDirectory', path: path.join(absVaultPath, 'Notes') },
			{ type: 'metadata', path: path.join(absVaultPath, 'Notes'), metadata: { icon: 'archive', tint: 'green' } },
			{
				type: 'createFile',
				path: path.join(absVaultPath, 'Notes', 'welcome.md'),
				content: '## 🌻 Welcome to Karabiner\n\nThis is your vault. Start by creating a new file or folder!'
			},
			{
				type: 'createFile',
				path: path.join(absVaultPath, 'Notes', 'why-karabiner.md'),
				content: '## 🥺 Why Karabiner?\n\nKarabiner is designed to be a simple, local-first knowledge base that helps you organize your thoughts and ideas without the overhead of more complex tools. It’s perfect for:\n\n- **Personal Notes**: Jot down quick thoughts, ideas, or reminders.\n- **Project Planning**: Keep track of project details, to-dos, and resources.\n- **Learning and Research**: Collect information, links, and insights in one place.\n\nKarabiner focuses on simplicity and speed, making it easy to capture and access your information whenever you need it.'
			},
			{ type: 'createDirectory', path: path.join(absVaultPath, 'Projects') },
			{ type: 'metadata', path: path.join(absVaultPath, 'Projects'), metadata: { icon: 'inbox', tint: 'purple' } },
			{
				type: 'createFile',
				path: path.join(absVaultPath, 'Projects', 'example-project.md'),
				content: '## 👾 Example Project\n\nThis is an example project file. You can use this space to outline your project goals, tasks, and resources.\n\n## Project Overview\n\nProvide a brief description of your project here.\n\n## Tasks\n\n- [ ] Task 1\n- [ ] Task 2\n- [ ] Task 3\n\n## Resources\n\n- Link to resource 1\n- Link to resource 2\n- Link to resource 3'
			},
			{ type: 'createDirectory', path: path.join(absVaultPath, 'Journal') },
			{ type: 'metadata', path: path.join(absVaultPath, 'Journal'), metadata: { icon: 'calendar', tint: 'blue' } },
			{
				type: 'createFile',
				path: path.join(absVaultPath, 'Journal', '2024-01-01.md'),
				content: '## 📓 Journal Entry - January 1, 2024\n\nToday marks the beginning of a new year and a fresh start. I am excited to embark on this journey with Karabiner as my trusted knowledge base. My goals for this year include:\n\n- [ ] Organize my thoughts and ideas more effectively.\n- [ ] Keep track of my projects and their progress.\n- [ ] Capture insights and information that I come across in my daily life.\n\nI am looking forward to seeing how Karabiner helps me grow and stay organized throughout the year!'
			},
			{
				type: 'createFile',
				path: path.join(absVaultPath, 'Journal', '2024-01-02.md'),
				content: '## 📔 Journal Entry - January 2, 2024\n\nToday I started setting up my Karabiner vault. I created a few folders and files to get things organized. I am impressed with how easy it is to create and manage my notes. I can already see the potential for this tool to help me stay organized and productive. Looking forward to filling this vault with all my thoughts and ideas!'
			},
			{ type: 'createDirectory', path: path.join(absVaultPath, 'Research') },
			{ type: 'metadata', path: path.join(absVaultPath, 'Research'), metadata: { icon: 'test-tube', tint: 'orange' } },
			{
				type: 'createFile',
				path: path.join(absVaultPath, 'Research', 'example-research.md'),
				content: '# 🧪 Example Research Note\n\nThis is an example research note. Use this template to capture your research findings, insights, and references.\n\n## Research Topic\n\nBriefly describe the topic of your research here.\n\n## Key Findings\n\n- Finding 1: Description and implications.\n- Finding 2: Description and implications.\n- Finding 3: Description and implications.\n\n## References\n\n- [Link to reference 1](https://example.com)\n- [Link to reference 2](https://example.com)\n- [Link to reference 3](https://example.com)'
			}
		]);
		await FSReplay.applyOperations(defaultActions);
	}

	if (!existsSync(absAssetPath)) {
		await FSReplay.applyOperations([
			{ type: 'createDirectory', path: absAssetPath },
		]);
	}
}
