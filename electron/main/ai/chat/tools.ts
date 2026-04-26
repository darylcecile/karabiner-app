import { spawn } from "node:child_process";
import type { Dirent } from "node:fs";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { Bash, OverlayFs } from "just-bash";
import { search as ragSearch } from "@/main/rag/search";
import { getWorkspaceRoot, resolveInsideWorkspace } from "./workspace";

const MAX_READ_BYTES = 100 * 1024;
const TRUNCATION_NOTE = "\n\n…[truncated, file exceeds 100KB]";

function describeError(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

const readFileTool = tool({
	description:
		"Read a file from the workspace. Path may be absolute or relative to the workspace root. Returns the file content (truncated to 100KB).",
	inputSchema: z.object({
		path: z.string().min(1).describe("Absolute or workspace-relative file path."),
	}),
	execute: async ({ path: rawPath }) => {
		try {
			const abs = resolveInsideWorkspace(rawPath);
			const info = await stat(abs);
			if (!info.isFile()) return { error: `Not a regular file: ${rawPath}` };
			const buffer = await readFile(abs);
			let content = buffer.toString("utf-8");
			let truncated = false;
			if (buffer.byteLength > MAX_READ_BYTES) {
				content = buffer.subarray(0, MAX_READ_BYTES).toString("utf-8") + TRUNCATION_NOTE;
				truncated = true;
			}
			return { path: abs, bytes: buffer.byteLength, truncated, content };
		} catch (err) {
			return { error: describeError(err) };
		}
	},
});

const writeFileTool = tool({
	description:
		"Write a file inside the workspace. Creates parent directories as needed. Requires user approval.",
	inputSchema: z.object({
		path: z.string().min(1).describe("Absolute or workspace-relative file path."),
		content: z.string().describe("UTF-8 file content to write."),
	}),
	needsApproval: true,
	execute: async ({ path: rawPath, content }) => {
		try {
			const abs = resolveInsideWorkspace(rawPath);
			await mkdir(path.dirname(abs), { recursive: true });
			await writeFile(abs, content, "utf-8");
			return { success: true, path: abs, bytesWritten: Buffer.byteLength(content, "utf-8") };
		} catch (err) {
			return { success: false, error: describeError(err) };
		}
	},
});

type GrepMatch = { path: string; line: number; text: string };

async function runRipgrep(
	pattern: string,
	cwd: string,
	relativePath: string | undefined,
	caseSensitive: boolean,
): Promise<{ matches: GrepMatch[]; tool: "ripgrep" } | null> {
	return new Promise((resolve) => {
		const args = ["--json", "-n", "--no-messages", "--max-count", "200"];
		if (!caseSensitive) args.push("-i");
		args.push(pattern);
		if (relativePath) args.push(relativePath);
		const child = spawn("rg", args, { cwd });
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf-8");
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf-8");
		});
		child.on("error", () => resolve(null));
		child.on("close", (code) => {
			if (code !== 0 && code !== 1) {
				if (stderr) console.warn("[chat tools] ripgrep stderr:", stderr.slice(0, 200));
				resolve(null);
				return;
			}
			const matches: GrepMatch[] = [];
			for (const line of stdout.split("\n")) {
				if (!line) continue;
				try {
					const evt = JSON.parse(line) as {
						type: string;
						data?: {
							path?: { text?: string };
							line_number?: number;
							lines?: { text?: string };
						};
					};
					if (evt.type === "match" && evt.data) {
						const p = evt.data.path?.text ?? "";
						const ln = evt.data.line_number ?? 0;
						const text = evt.data.lines?.text ?? "";
						matches.push({ path: p, line: ln, text: text.replace(/\r?\n$/, "") });
					}
				} catch {
					// skip
				}
			}
			resolve({ matches, tool: "ripgrep" });
		});
	});
}

async function jsGrep(
	pattern: string,
	root: string,
	relativePath: string | undefined,
	caseSensitive: boolean,
): Promise<{ matches: GrepMatch[]; tool: "js" }> {
	const target = relativePath ? resolveInsideWorkspace(relativePath) : root;
	const re = new RegExp(pattern, caseSensitive ? "" : "i");
	const matches: GrepMatch[] = [];
	const { readdir } = await import("node:fs/promises");
	async function walk(dir: string): Promise<void> {
		if (matches.length >= 200) return;
		let entries: Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (matches.length >= 200) return;
			if (entry.name.startsWith(".")) continue;
			if (entry.name === "node_modules") continue;
			const child = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				await walk(child);
			} else if (entry.isFile()) {
				try {
					const content = await readFile(child, "utf-8");
					const lines = content.split("\n");
					for (let i = 0; i < lines.length; i++) {
						if (re.test(lines[i])) {
							matches.push({ path: child, line: i + 1, text: lines[i] });
							if (matches.length >= 200) return;
						}
					}
				} catch {
					// binary or unreadable, skip
				}
			}
		}
	}
	const targetStat = await stat(target).catch(() => null);
	if (!targetStat) return { matches, tool: "js" };
	if (targetStat.isFile()) {
		try {
			const content = await readFile(target, "utf-8");
			const lines = content.split("\n");
			for (let i = 0; i < lines.length; i++) {
				if (re.test(lines[i])) matches.push({ path: target, line: i + 1, text: lines[i] });
			}
		} catch {
			// skip
		}
	} else {
		await walk(target);
	}
	return { matches, tool: "js" };
}

const grepTool = tool({
	description:
		"Search for a regex pattern in workspace files. Case-insensitive by default (set caseSensitive: true to disable). Uses ripgrep when available; otherwise falls back to a JS implementation. Returns up to 200 matches.",
	inputSchema: z.object({
		pattern: z.string().min(1).describe("Regular expression to search for."),
		path: z.string().optional().describe("Optional workspace-relative path to limit the search."),
		caseSensitive: z
			.boolean()
			.optional()
			.describe("Whether to match case-sensitively. Defaults to false."),
	}),
	execute: async ({ pattern, path: rawPath, caseSensitive }) => {
		try {
			const root = getWorkspaceRoot();
			if (rawPath) resolveInsideWorkspace(rawPath); // path safety check
			const cs = caseSensitive ?? false;
			const rg = await runRipgrep(pattern, root, rawPath, cs);
			const result = rg ?? (await jsGrep(pattern, root, rawPath, cs));
			return {
				pattern,
				engine: result.tool,
				matchCount: result.matches.length,
				matches: result.matches,
			};
		} catch (err) {
			return { error: describeError(err) };
		}
	},
});

const searchFilesTool = tool({
	description:
		"Find files in the workspace matching a glob-like pattern (substring/glob match against the workspace-relative path). Case-insensitive by default.",
	inputSchema: z.object({
		pattern: z.string().min(1).describe("Substring or basic glob pattern."),
		caseSensitive: z
			.boolean()
			.optional()
			.describe("Whether to match case-sensitively. Defaults to false."),
	}),
	execute: async ({ pattern, caseSensitive }) => {
		try {
			const root = getWorkspaceRoot();
			const { readdir } = await import("node:fs/promises");
			const re = globToRegex(pattern, caseSensitive ?? false);
			const out: string[] = [];
			async function walk(dir: string): Promise<void> {
				if (out.length >= 500) return;
				let entries: Dirent[];
				try {
					entries = await readdir(dir, { withFileTypes: true });
				} catch {
					return;
				}
				for (const entry of entries) {
					if (out.length >= 500) return;
					if (entry.name.startsWith(".")) continue;
					if (entry.name === "node_modules") continue;
					const child = path.join(dir, entry.name);
					const rel = path.relative(root, child);
					if (entry.isDirectory()) {
						await walk(child);
					} else if (re.test(rel) || re.test(entry.name)) {
						out.push(rel);
					}
				}
			}
			await walk(root);
			return { pattern, matchCount: out.length, files: out };
		} catch (err) {
			return { error: describeError(err) };
		}
	},
});

function globToRegex(glob: string, caseSensitive: boolean = false): RegExp {
	const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	const pattern = escaped.replace(/\*\*/g, "::DOUBLE::").replace(/\*/g, "[^/]*").replace(/::DOUBLE::/g, ".*").replace(/\?/g, ".");
	return new RegExp(pattern, caseSensitive ? "" : "i");
}

const runBashTool = tool({
	description:
		"Run a shell command inside a sandboxed bash environment with copy-on-write access to the workspace. Network access is restricted to https GET/HEAD/POST. Requires user approval.",
	inputSchema: z.object({
		command: z.string().min(1).describe("Shell command to execute."),
	}),
	needsApproval: true,
	execute: async ({ command }) => {
		try {
			const root = getWorkspaceRoot();
			const fs = new OverlayFs({ root, mountPoint: "/workspace", readOnly: false });
			const bash = new Bash({
				fs,
				cwd: "/workspace",
				executionLimits: {
					maxCommandCount: 1000,
					maxLoopIterations: 10_000,
					maxCallDepth: 32,
				},
				network: {
					allowedUrlPrefixes: ["https://"],
					allowedMethods: ["GET", "HEAD", "POST"],
				},
				python: false,
				javascript: false,
			});
			const result = await bash.exec(command);
			return {
				stdout: result.stdout,
				stderr: result.stderr,
				exitCode: result.exitCode,
			};
		} catch (err) {
			return { error: describeError(err), exitCode: -1, stdout: "", stderr: "" };
		}
	},
});

const searchWorkspaceTool = tool({
	description:
		"Search the user's workspace using the same engine as the in-app search panel. This is a SEMANTIC + fuzzy search across note content (powered by vector embeddings when available, with grep/fuzzy fallback). PREFER THIS over `grep` when looking up topics, ideas or keywords by meaning rather than exact text. Returns up to 20 ranked results with snippets.",
	inputSchema: z.object({
		query: z.string().min(1).describe("Natural-language query or keywords."),
		limit: z.number().int().positive().max(50).optional().describe("Max results (default 20)."),
	}),
	execute: async ({ query, limit }) => {
		try {
			const response = await ragSearch(query, { limit: limit ?? 20 });
			return {
				query: response.query,
				source: response.source,
				reason: response.reason,
				resultCount: response.results.length,
				results: response.results.map((r) => ({
					path: r.path,
					score: r.score,
					heading: r.heading ?? null,
					snippet: r.snippet,
				})),
			};
		} catch (err) {
			return { error: describeError(err) };
		}
	},
});

export function buildTools() {
	return {
		readFile: readFileTool,
		writeFile: writeFileTool,
		grep: grepTool,
		searchFiles: searchFilesTool,
		searchWorkspace: searchWorkspaceTool,
		runBash: runBashTool,
	};
}

/**
 * Slash-command interception. The bridged language model adapter cannot emit
 * tool-call stream parts, so we let users invoke tools imperatively from chat
 * with `/read`, `/write`, `/grep`, `/find`, `/bash`. The protocol handler runs
 * matching commands BEFORE streamText() and prepends the result to the user
 * message so the model can reason about it.
 */
export const SLASH_COMMAND_HELP = [
	"/read <path>",
	"/search <query>            (semantic + fuzzy across notes)",
	"/grep <pattern> [path]",
	"/find <glob>",
	"/write <path> <content…>  (executed on send)",
	"/bash <command…>          (executed on send)",
].join("\n");

export type SlashResult = {
	command: string;
	args: string;
	output: string;
};

export async function tryInterceptSlashCommand(text: string): Promise<SlashResult | null> {
	const trimmed = text.trim();
	if (!trimmed.startsWith("/")) return null;
	const firstSpace = trimmed.indexOf(" ");
	const command = (firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace)).toLowerCase();
	const args = firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1).trim();

	try {
		switch (command) {
			case "/read": {
				if (!args) return makeResult(command, args, "Usage: /read <path>");
				const abs = resolveInsideWorkspace(args);
				const info = await stat(abs);
				if (!info.isFile()) return makeResult(command, args, `Not a file: ${args}`);
				const buf = await readFile(abs);
				const text = buf.byteLength > MAX_READ_BYTES
					? buf.subarray(0, MAX_READ_BYTES).toString("utf-8") + TRUNCATION_NOTE
					: buf.toString("utf-8");
				return makeResult(command, args, text);
			}
			case "/search": {
				if (!args) return makeResult(command, args, "Usage: /search <query>");
				const response = await ragSearch(args, { limit: 10 });
				const lines = response.results.map((r) => {
					const head = r.heading ? ` — ${r.heading}` : "";
					return `${r.path}${head}\n  ${r.snippet.replace(/\s+/g, " ").slice(0, 200)}`;
				});
				const header = `(source: ${response.source}${response.reason ? ", " + response.reason : ""})`;
				return makeResult(command, args, lines.length ? `${header}\n${lines.join("\n")}` : `${header}\n(no results)`);
			}
			case "/grep": {
				if (!args) return makeResult(command, args, "Usage: /grep <pattern> [path]");
				const sep = args.indexOf(" ");
				const pattern = sep === -1 ? args : args.slice(0, sep);
				const where = sep === -1 ? undefined : args.slice(sep + 1).trim() || undefined;
				const root = getWorkspaceRoot();
				if (where) resolveInsideWorkspace(where);
				const rg = await runRipgrep(pattern, root, where, false);
				const result = rg ?? (await jsGrep(pattern, root, where, false));
				const lines = result.matches.map((m) => `${m.path}:${m.line}: ${m.text}`);
				return makeResult(command, args, lines.length ? lines.join("\n") : "(no matches)");
			}
			case "/find": {
				if (!args) return makeResult(command, args, "Usage: /find <pattern>");
				const root = getWorkspaceRoot();
				const re = globToRegex(args);
				const { readdir } = await import("node:fs/promises");
				const out: string[] = [];
				async function walk(dir: string): Promise<void> {
					if (out.length >= 500) return;
					let entries: Dirent[];
					try {
						entries = await readdir(dir, { withFileTypes: true });
					} catch {
						return;
					}
					for (const entry of entries) {
						if (out.length >= 500) return;
						if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
						const child = path.join(dir, entry.name);
						const rel = path.relative(root, child);
						if (entry.isDirectory()) await walk(child);
						else if (re.test(rel) || re.test(entry.name)) out.push(rel);
					}
				}
				await walk(root);
				return makeResult(command, args, out.length ? out.join("\n") : "(no files)");
			}
			case "/write": {
				const sep = args.indexOf(" ");
				if (sep === -1) return makeResult(command, args, "Usage: /write <path> <content>");
				const targetPath = args.slice(0, sep);
				const content = args.slice(sep + 1);
				const abs = resolveInsideWorkspace(targetPath);
				await mkdir(path.dirname(abs), { recursive: true });
				await writeFile(abs, content, "utf-8");
				return makeResult(
					command,
					args,
					`Wrote ${Buffer.byteLength(content, "utf-8")} bytes to ${abs}`,
				);
			}
			case "/bash": {
				if (!args) return makeResult(command, args, "Usage: /bash <command>");
				const root = getWorkspaceRoot();
				const fs = new OverlayFs({ root, mountPoint: "/workspace", readOnly: false });
				const bash = new Bash({
					fs,
					cwd: "/workspace",
					executionLimits: { maxCommandCount: 1000, maxLoopIterations: 10_000, maxCallDepth: 32 },
					network: {
						allowedUrlPrefixes: ["https://"],
						allowedMethods: ["GET", "HEAD", "POST"],
					},
					python: false,
					javascript: false,
				});
				const r = await bash.exec(args);
				const out = `exit=${r.exitCode}\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}`;
				return makeResult(command, args, out);
			}
			case "/help":
				return makeResult(command, args, SLASH_COMMAND_HELP);
			default:
				return null;
		}
	} catch (err) {
		return makeResult(command, args, `Error: ${describeError(err)}`);
	}
}

function makeResult(command: string, args: string, output: string): SlashResult {
	return { command, args, output };
}
