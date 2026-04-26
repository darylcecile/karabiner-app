import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import yaml from "yaml";
import { z } from "zod";

export const LabelCachePath = "~/.karabiner/cache/labels.yaml";

const LabelEntrySchema = z.object({
	label: z.string(),
	emoji: z.string(),
	category: z.string(),
	mtimeMs: z.number(),
	generatedAt: z.number(),
});

const LabelCacheSchema = z.object({
	entries: z.record(z.string(), LabelEntrySchema).default({}),
});

export type LabelEntry = z.infer<typeof LabelEntrySchema>;
type LabelCache = z.infer<typeof LabelCacheSchema>;

let cache: LabelCache | null = null;

function resolveCachePath(): string {
	const home = process.env.HOME || process.env.USERPROFILE || "";
	return LabelCachePath.replace("~", home);
}

async function loadCache(): Promise<LabelCache> {
	if (cache) return cache;
	const absPath = resolveCachePath();
	try {
		const raw = await readFile(absPath, "utf-8");
		const parsed = yaml.parse(raw);
		const validated = LabelCacheSchema.safeParse(parsed ?? { entries: {} });
		cache = validated.success ? validated.data : { entries: {} };
	} catch {
		cache = { entries: {} };
	}
	return cache;
}

async function persistCache(): Promise<void> {
	if (!cache) return;
	const absPath = resolveCachePath();
	await mkdir(path.dirname(absPath), { recursive: true });
	await writeFile(absPath, yaml.stringify(cache), "utf-8");
}

export async function getCachedLabel(absPath: string, currentMtimeMs?: number): Promise<LabelEntry | null> {
	const c = await loadCache();
	const entry = c.entries[absPath];
	if (!entry) return null;
	if (currentMtimeMs !== undefined && entry.mtimeMs !== currentMtimeMs) return null;
	return entry;
}

export async function setCachedLabel(absPath: string, entry: LabelEntry): Promise<void> {
	const c = await loadCache();
	c.entries[absPath] = entry;
	await persistCache();
}

export async function clearCachedLabel(absPath: string): Promise<void> {
	const c = await loadCache();
	if (c.entries[absPath]) {
		delete c.entries[absPath];
		await persistCache();
	}
}

export async function clearCachedLabelsByPrefix(prefix: string): Promise<number> {
	const c = await loadCache();
	const normalized = prefix.endsWith("/") ? prefix : prefix + "/";
	let removed = 0;
	for (const key of Object.keys(c.entries)) {
		if (key === prefix || key.startsWith(normalized)) {
			delete c.entries[key];
			removed += 1;
		}
	}
	if (removed > 0) await persistCache();
	return removed;
}

export async function reconcileCachedLabels(validPaths: Iterable<string>): Promise<number> {
	const c = await loadCache();
	const valid = new Set(validPaths);
	let removed = 0;
	for (const key of Object.keys(c.entries)) {
		if (!valid.has(key)) {
			delete c.entries[key];
			removed += 1;
		}
	}
	if (removed > 0) await persistCache();
	return removed;
}

export async function clearAllCachedLabels(): Promise<number> {
	const c = await loadCache();
	const count = Object.keys(c.entries).length;
	c.entries = {};
	await persistCache();
	return count;
}
