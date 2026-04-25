import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { promisify } from "node:util";
import { getDb } from "@/main/rag/db";
import { embed, isReady } from "@/main/rag/embedder";

const execFileP = promisify(execFile);

export type SearchResult = {
	path: string;
	score: number;
	snippet: string;
	heading?: string | null;
	chunkIndex?: number;
};

export type SearchResponse = {
	source: "vector" | "grep";
	query: string;
	results: SearchResult[];
	reason?: string;
};

const SNIPPET_LEN = 200;
const MAX_FILE_BYTES = 1_000_000;

function getVaultRoot(): string {
	const home = os.homedir() || process.env.HOME || process.env.USERPROFILE || "";
	return path.join(home, ".karabiner/vault");
}

function clampLimit(n: number | undefined): number {
	const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : 20;
	return Math.max(1, Math.min(100, v));
}

function buildSnippet(content: string, query: string): string {
	if (!content) return "";
	const trimmed = content.replace(/\s+/g, " ").trim();
	if (trimmed.length <= SNIPPET_LEN) return trimmed;

	const firstWord = query.trim().split(/\s+/).filter(Boolean)[0] ?? "";
	let idx = -1;
	if (firstWord) {
		idx = trimmed.toLowerCase().indexOf(firstWord.toLowerCase());
	}

	let start: number;
	let end: number;
	if (idx < 0) {
		start = 0;
		end = SNIPPET_LEN;
	} else {
		const half = Math.floor(SNIPPET_LEN / 2);
		start = Math.max(0, idx - half);
		end = Math.min(trimmed.length, start + SNIPPET_LEN);
		start = Math.max(0, end - SNIPPET_LEN);
	}

	let slice = trimmed.slice(start, end);

	// Trim partial words on the edges if we're not at content boundaries.
	if (start > 0) {
		const sp = slice.indexOf(" ");
		if (sp > 0 && sp < 30) slice = slice.slice(sp + 1);
	}
	if (end < trimmed.length) {
		const sp = slice.lastIndexOf(" ");
		if (sp > slice.length - 30 && sp > 0) slice = slice.slice(0, sp);
	}

	slice = slice.trim();
	const prefix = start > 0 ? "…" : "";
	const suffix = end < trimmed.length ? "…" : "";
	return `${prefix}${slice}${suffix}`;
}

function vectorToLiteral(v: number[]): string {
	return `[${v.join(",")}]`;
}

async function countChunks(): Promise<number> {
	const pg = await getDb();
	const res = await pg.query<{ count: number | string }>(`SELECT COUNT(*)::int AS count FROM chunks WHERE embedding IS NOT NULL;`);
	const row = res.rows[0];
	if (!row) return 0;
	const n = typeof row.count === "string" ? parseInt(row.count, 10) : row.count;
	return Number.isFinite(n) ? n : 0;
}

async function vectorSearch(query: string, limit: number): Promise<SearchResult[]> {
	const vec = await embed(query);
	const lit = vectorToLiteral(vec);
	const pg = await getDb();
	const sql = `
		SELECT
			c.file_path AS file_path,
			c.chunk_index AS chunk_index,
			c.content AS content,
			c.heading AS heading,
			1 - (c.embedding <=> '${lit}'::vector) AS score
		FROM chunks c
		WHERE c.embedding IS NOT NULL
		ORDER BY c.embedding <=> '${lit}'::vector
		LIMIT ${limit}
	`;
	const res = await pg.query<{
		file_path: string;
		chunk_index: number;
		content: string;
		heading: string | null;
		score: number | string;
	}>(sql);
	return res.rows.map((r) => ({
		path: r.file_path,
		score: typeof r.score === "string" ? parseFloat(r.score) : r.score,
		snippet: buildSnippet(r.content ?? "", query),
		heading: r.heading,
		chunkIndex: r.chunk_index,
	}));
}

let rgPathCache: string | null | undefined;

async function getRgPath(): Promise<string | null> {
	if (rgPathCache !== undefined) return rgPathCache;
	try {
		const { stdout } = await execFileP("which", ["rg"]);
		const p = stdout.trim();
		rgPathCache = p || null;
	} catch {
		rgPathCache = null;
	}
	return rgPathCache;
}

type RgMatch = {
	type: string;
	data?: {
		path?: { text?: string };
		lines?: { text?: string };
		line_number?: number;
		submatches?: Array<{ start: number; end: number; match?: { text?: string } }>;
	};
};

async function rgSearch(query: string, vaultRoot: string, limit: number): Promise<SearchResult[]> {
	const rg = await getRgPath();
	if (!rg) return [];
	const args = ["--json", "--max-count", "5", "--max-filesize", "1M", "-S", "--", query, vaultRoot];
	let stdout = "";
	try {
		const r = await execFileP(rg, args, { maxBuffer: 50 * 1024 * 1024 });
		stdout = r.stdout;
	} catch (err: any) {
		// rg exits with code 1 when no matches; that yields a rejection with a code.
		if (err && typeof err === "object" && (err.code === 1 || err.code === "1")) {
			return [];
		}
		if (err && typeof err.stdout === "string") {
			stdout = err.stdout;
		} else {
			throw err;
		}
	}

	const results: SearchResult[] = [];
	const lines = stdout.split("\n");
	const normalizedRoot = path.resolve(vaultRoot);
	for (const line of lines) {
		if (!line) continue;
		let obj: RgMatch;
		try {
			obj = JSON.parse(line) as RgMatch;
		} catch {
			continue;
		}
		if (obj.type !== "match" || !obj.data) continue;
		const filePath = obj.data.path?.text;
		const lineText = obj.data.lines?.text ?? "";
		const lineNumber = obj.data.line_number ?? 0;
		if (!filePath) continue;
		const abs = path.resolve(filePath);
		if (!abs.startsWith(normalizedRoot + path.sep) && abs !== normalizedRoot) continue;

		results.push({
			path: abs,
			score: 1 / (1 + lineNumber / 100),
			snippet: buildSnippet(lineText, query),
		});
		if (results.length >= limit) break;
	}
	return results;
}

async function* walkMarkdown(root: string): AsyncGenerator<string> {
	let entries: import("node:fs").Dirent[];
	try {
		entries = await readdir(root, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (entry.name.startsWith(".")) continue;
		const full = path.join(root, entry.name);
		if (entry.isDirectory()) {
			yield* walkMarkdown(full);
		} else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
			yield full;
		}
	}
}

async function nodeGrepSearch(query: string, vaultRoot: string, limit: number): Promise<SearchResult[]> {
	const results: SearchResult[] = [];
	const lowered = query.toLowerCase();
	for await (const file of walkMarkdown(vaultRoot)) {
		if (results.length >= limit) break;
		try {
			const s = await stat(file);
			if (s.size > MAX_FILE_BYTES) continue;
			const content = await readFile(file, "utf-8");
			const idx = content.toLowerCase().indexOf(lowered);
			if (idx < 0) continue;
			results.push({
				path: file,
				score: 1 / (1 + idx / 1000),
				snippet: buildSnippet(content, query),
			});
		} catch {
			// skip unreadable files
		}
	}
	return results;
}

async function grepFallback(
	query: string,
	limit: number,
	baseReason: string,
): Promise<SearchResponse> {
	const vaultRoot = getVaultRoot();
	try {
		const rg = await getRgPath();
		if (rg) {
			const results = await rgSearch(query, vaultRoot, limit);
			return { source: "grep", query, results, reason: `${baseReason}:rg` };
		}
		const results = await nodeGrepSearch(query, vaultRoot, limit);
		return { source: "grep", query, results, reason: `${baseReason}:node-grep` };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error("[rag/search] grep error:", err);
		return { source: "grep", query, results: [], reason: `grep-error: ${msg}` };
	}
}

export async function search(query: string, opts?: { limit?: number }): Promise<SearchResponse> {
	const trimmed = query.trim();
	if (!trimmed) {
		return { source: "grep", query: "", results: [], reason: "empty query" };
	}
	const limit = clampLimit(opts?.limit);

	let chunkCount = 0;
	let dbOk = true;
	try {
		chunkCount = await countChunks();
	} catch (err) {
		dbOk = false;
		console.error("[rag/search] chunk count failed:", err);
	}

	if (!isReady()) {
		return await grepFallback(trimmed, limit, "embedder-not-ready");
	}
	if (!dbOk || chunkCount < 1) {
		return await grepFallback(trimmed, limit, "no-chunks");
	}

	try {
		const results = await vectorSearch(trimmed, limit);
		return { source: "vector", query: trimmed, results, reason: "vector" };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error("[rag/search] vector error, falling back to grep:", err);
		return await grepFallback(trimmed, limit, `vector-error: ${msg}`);
	}
}
