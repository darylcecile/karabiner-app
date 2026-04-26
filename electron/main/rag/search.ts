import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { promisify } from "node:util";
import Fuse from "fuse.js";
import { getDb } from "@/main/rag/db";
import { embed, isReady } from "@/main/rag/embedder";
import { getPreferences } from "@/main/preferences";
import { getActiveProvider } from "@/main/ai/resolver";

const execFileP = promisify(execFile);

export type SearchResult = {
	path: string;
	score: number;
	snippet: string;
	heading?: string | null;
	chunkIndex?: number;
};

export type AskAnswer = {
	text: string;
	citations: Array<{ resultIndex: number; path: string; snippet?: string }>;
};

export type SearchResponse = {
	source: "vector" | "grep" | "ask";
	query: string;
	results: SearchResult[];
	reason?: string;
	answer?: AskAnswer;
	rewrittenQueries?: string[];
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

type GrepCandidate = {
	path: string;
	snippet: string;
	lineNumber: number;
};

const FUZZY_LIMIT = 200;

function buildRgPattern(query: string): string {
	const tokens = query
		.split(/\s+/)
		.map((t) => t.trim())
		.filter(Boolean)
		.map((t) => t.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&"));
	if (tokens.length === 0) return query;
	return tokens.join("|");
}

async function rgFindCandidates(query: string, vaultRoot: string): Promise<GrepCandidate[]> {
	const rg = await getRgPath();
	if (!rg) return [];
	const pattern = buildRgPattern(query);
	const args = [
		"--json",
		"--max-count",
		"3",
		"--max-filesize",
		"1M",
		"-S",
		"-e",
		pattern,
		vaultRoot,
	];
	let stdout = "";
	try {
		const r = await execFileP(rg, args, { maxBuffer: 50 * 1024 * 1024 });
		stdout = r.stdout;
	} catch (err: any) {
		if (err && typeof err === "object" && (err.code === 1 || err.code === "1")) {
			return [];
		}
		if (err && typeof err.stdout === "string") {
			stdout = err.stdout;
		} else {
			throw err;
		}
	}

	const byPath = new Map<string, GrepCandidate>();
	const normalizedRoot = path.resolve(vaultRoot);
	for (const line of stdout.split("\n")) {
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

		const existing = byPath.get(abs);
		if (!existing || lineNumber < existing.lineNumber) {
			byPath.set(abs, {
				path: abs,
				snippet: buildSnippet(lineText, query),
				lineNumber,
			});
		}
		if (byPath.size >= FUZZY_LIMIT) break;
	}
	return Array.from(byPath.values());
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

async function nodeGrepCandidates(query: string, vaultRoot: string): Promise<GrepCandidate[]> {
	const candidates: GrepCandidate[] = [];
	const tokens = query
		.toLowerCase()
		.split(/\s+/)
		.map((t) => t.trim())
		.filter(Boolean);
	const lowered = query.toLowerCase();
	for await (const file of walkMarkdown(vaultRoot)) {
		if (candidates.length >= FUZZY_LIMIT) break;
		try {
			const s = await stat(file);
			if (s.size > MAX_FILE_BYTES) continue;
			const content = await readFile(file, "utf-8");
			const loweredContent = content.toLowerCase();
			let idx = loweredContent.indexOf(lowered);
			if (idx < 0) {
				// fall back: any individual token must match
				idx = -1;
				for (const tok of tokens) {
					const i = loweredContent.indexOf(tok);
					if (i >= 0 && (idx < 0 || i < idx)) idx = i;
				}
				if (idx < 0) continue;
			}
			candidates.push({
				path: file,
				snippet: buildSnippet(content, query),
				lineNumber: content.slice(0, idx).split("\n").length,
			});
		} catch {
			// skip unreadable files
		}
	}
	return candidates;
}

function fuzzyRank(candidates: GrepCandidate[], query: string, limit: number): SearchResult[] {
	if (candidates.length === 0) return [];
	const enriched = candidates.map((c) => ({
		...c,
		basename: path.basename(c.path),
	}));
	const fuse = new Fuse(enriched, {
		includeScore: true,
		ignoreLocation: true,
		threshold: 0.5,
		keys: [
			{ name: "basename", weight: 0.6 },
			{ name: "snippet", weight: 0.3 },
			{ name: "path", weight: 0.1 },
		],
	});
	const ranked = fuse.search(query);
	const matched = ranked.map((r) => ({
		path: r.item.path,
		// fuse score: 0 = perfect, 1 = no match. Convert to a 0..1 relevance.
		score: 1 - (r.score ?? 0),
		snippet: r.item.snippet,
	}));
	if (matched.length >= limit) return matched.slice(0, limit);
	// Fall back: include any leftover candidates Fuse filtered out, ranked by line number proximity.
	const matchedPaths = new Set(matched.map((m) => m.path));
	const leftovers = enriched
		.filter((c) => !matchedPaths.has(c.path))
		.sort((a, b) => a.lineNumber - b.lineNumber)
		.map((c) => ({
			path: c.path,
			score: 1 / (1 + c.lineNumber / 100),
			snippet: c.snippet,
		}));
	return matched.concat(leftovers).slice(0, limit);
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
			const candidates = await rgFindCandidates(query, vaultRoot);
			const results = fuzzyRank(candidates, query, limit);
			return { source: "grep", query, results, reason: `${baseReason}:rg+fuse` };
		}
		const candidates = await nodeGrepCandidates(query, vaultRoot);
		const results = fuzzyRank(candidates, query, limit);
		return { source: "grep", query, results, reason: `${baseReason}:node-grep+fuse` };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error("[rag/search] grep error:", err);
		return { source: "grep", query, results: [], reason: `grep-error: ${msg}` };
	}
}

export async function search(query: string, opts?: { limit?: number; forceAsk?: boolean, ignoreRag?: boolean }): Promise<SearchResponse> {
	const trimmed = query.trim();
	if (!trimmed) {
		return { source: "grep", query: "", results: [], reason: "empty query" };
	}
	const limit = clampLimit(opts?.limit);

	if (opts?.ignoreRag) {
		return await grepFallback(trimmed, limit, "rag-ignored");
	}

	// Honor the user preference: if AI-powered semantic search is disabled, skip
	// the vector path entirely and fall back to grep + fuzzy ranking.
	let aiSearchEnabled = true;
	try {
		const pref = getPreferences("ai.searchEnabled");
		if (pref === false) aiSearchEnabled = false;
	} catch {
		// preferences unavailable — assume enabled
	}
	if (!aiSearchEnabled) {
		return await grepFallback(trimmed, limit, "ai-search-disabled");
	}

	const askPrefs = readAskModePrefs();
	const wantAsk = opts?.forceAsk
		? askPrefs.enabled
		: askPrefs.enabled && askPrefs.autoDetect && looksLikeQuestion(trimmed);

	if (wantAsk) {
		try {
			const askResp = await askSearch(trimmed, limit, askPrefs);
			if (askResp) return askResp;
		} catch (err) {
			console.error("[rag/search] ask error, falling back to vector:", err);
		}
	}

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

// MARK: ask mode

type AskPrefs = {
	enabled: boolean;
	autoDetect: boolean;
	showAnswer: boolean;
	showResults: boolean;
};

function readAskModePrefs(): AskPrefs {
	const fallback: AskPrefs = { enabled: true, autoDetect: true, showAnswer: true, showResults: true };
	try {
		const raw = getPreferences("ai.askMode") as Partial<AskPrefs> | undefined;
		if (!raw) return fallback;
		return {
			enabled: raw.enabled !== false,
			autoDetect: raw.autoDetect !== false,
			showAnswer: raw.showAnswer !== false,
			showResults: raw.showResults !== false,
		};
	} catch {
		return fallback;
	}
}

const QUESTION_WORDS = ["what", "who", "how", "where", "why", "when", "which", "show", "find", "list"];

export function looksLikeQuestion(query: string): boolean {
	const trimmed = query.trim().toLowerCase();
	if (!trimmed) return false;
	if (trimmed.endsWith("?")) return true;
	const tokens = trimmed.split(/\s+/);
	if (tokens.length >= 6) return true;
	const first = tokens[0] ?? "";
	if (QUESTION_WORDS.includes(first)) return true;
	return false;
}

const REWRITE_PROMPT = [
	"You convert a natural-language question about a personal notes vault into 1 to 3 short search queries.",
	"Rules:",
	"- Each rewrite is 2 to 6 words, no quotes, no punctuation.",
	"- Cover different phrasings or synonyms when useful.",
	"- Return ONLY a JSON array of strings, no commentary, no fences.",
	'- Example: ["end of year review", "year-end retrospective"]',
].join("\n");

function parseRewrites(raw: string, fallback: string): string[] {
	const candidates: string[] = [];
	const trimmed = raw.trim();
	if (trimmed) candidates.push(trimmed);
	const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fence?.[1]) candidates.push(fence[1].trim());
	const arr = trimmed.match(/\[[\s\S]*\]/);
	if (arr) candidates.push(arr[0]);
	for (const c of candidates) {
		try {
			const parsed = JSON.parse(c);
			if (Array.isArray(parsed)) {
				const cleaned = parsed
					.filter((x): x is string => typeof x === "string")
					.map((s) => s.trim())
					.filter((s) => s.length > 0)
					.slice(0, 3);
				if (cleaned.length > 0) return cleaned;
			}
		} catch {
			// keep trying
		}
	}
	return [fallback];
}

async function dedupedVectorSearch(queries: string[], limit: number): Promise<SearchResult[]> {
	const merged = new Map<string, SearchResult>();
	for (const q of queries) {
		try {
			const part = await vectorSearch(q, limit);
			for (const r of part) {
				const key = `${r.path}#${r.chunkIndex ?? 0}`;
				const existing = merged.get(key);
				if (!existing || r.score > existing.score) merged.set(key, r);
			}
		} catch (err) {
			console.error("[rag/search] sub-query failed:", q, err);
		}
	}
	return Array.from(merged.values())
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);
}

const ANSWER_PROMPT = [
	"You are a concise assistant answering a question using ONLY the user's note excerpts.",
	"Rules:",
	"- Answer in 1 to 3 short sentences. Plain text, no markdown headings, no fences.",
	"- Cite supporting excerpts with [N] tokens (e.g. [1], [2]) using the indices below.",
	"- If the excerpts don't contain the answer, say so plainly without speculation.",
].join("\n");

function buildAnswerUserPrompt(question: string, results: SearchResult[]): string {
	const excerpts = results.slice(0, 6).map((r, i) => {
		const name = path.basename(r.path);
		return `[${i + 1}] ${name}\n${r.snippet}`;
	});
	return [
		`Question: ${question}`,
		"",
		"Excerpts:",
		excerpts.join("\n\n"),
		"",
		"Answer with citations:",
	].join("\n");
}

async function askSearch(query: string, limit: number, prefs: AskPrefs): Promise<SearchResponse | null> {
	const provider = await getActiveProvider();
	if (!provider) return null;

	// 1. Rewrite the question into a small set of search queries.
	let rewrites: string[] = [query];
	try {
		const raw = await provider.ask(`${REWRITE_PROMPT}\n\nQuestion: ${query}`);
		rewrites = parseRewrites(raw, query);
	} catch (err) {
		console.error("[rag/search] rewrite failed:", err);
	}

	// 2. Run vector search per rewrite (with the original question as a fallback)
	//    and merge results.
	if (!isReady()) return null;
	let chunkCount = 0;
	try {
		chunkCount = await countChunks();
	} catch {
		return null;
	}
	if (chunkCount < 1) return null;

	const allQueries = Array.from(new Set([query, ...rewrites])).slice(0, 4);
	const results = await dedupedVectorSearch(allQueries, limit);
	if (results.length === 0) {
		return {
			source: "ask",
			query,
			results: [],
			rewrittenQueries: rewrites,
			reason: "ask:no-matches",
		};
	}

	// 3. Optionally synthesize an answer from the top results.
	let answer: AskAnswer | undefined;
	if (prefs.showAnswer) {
		try {
			const answerText = await provider.ask(
				`${ANSWER_PROMPT}\n\n${buildAnswerUserPrompt(query, results)}`,
			);
			if (answerText && answerText.trim()) {
				const used = new Set<number>();
				const re = /\[(\d+)\]/g;
				let match: RegExpExecArray | null;
				while ((match = re.exec(answerText)) !== null) {
					const n = parseInt(match[1] ?? "0", 10);
					if (n >= 1 && n <= results.length) used.add(n - 1);
				}
				const citations = (used.size > 0 ? Array.from(used) : results.map((_, i) => i).slice(0, 3))
					.sort((a, b) => a - b)
					.map((idx) => ({
						resultIndex: idx,
						path: results[idx]!.path,
						snippet: results[idx]!.snippet,
					}));
				answer = { text: answerText.trim(), citations };
			}
		} catch (err) {
			console.error("[rag/search] answer synthesis failed:", err);
		}
	}

	return {
		source: "ask",
		query,
		results: prefs.showResults ? results : [],
		rewrittenQueries: rewrites,
		answer,
		reason: answer
			? prefs.showResults ? "ask:answer+results" : "ask:answer-only"
			: prefs.showResults ? "ask:results-only" : "ask:no-output",
	};
}
