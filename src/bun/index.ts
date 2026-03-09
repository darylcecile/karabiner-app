import Electrobun from "electrobun/bun";
import {
	BrowserWindow,
	BrowserView,
	ApplicationMenu,
	Updater,
	Utils,
} from "electrobun/bun";
import type { KarabinerRPC, OpenCodeContextData, OpenCodeMcpServer, OpenCodeModelInfo, OpenCodeTokens } from "../shared/rpc";

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

/* ------------------------------------------------------------------ */
/*  Terminal PTY session management                                   */
/* ------------------------------------------------------------------ */

interface TerminalSession {
	proc: ReturnType<typeof Bun.spawn>;
	cols: number;
	rows: number;
}

const sessions = new Map<string, TerminalSession>();
let sessionCounter = 0;

/* ------------------------------------------------------------------ */
/*  File watcher management                                           */
/* ------------------------------------------------------------------ */

const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");

const watchers = new Map<string, ReturnType<typeof fs.watch>>();

/* ------------------------------------------------------------------ */
/*  OpenCode server auto-detection from terminal PTY output            */
/* ------------------------------------------------------------------ */

/** Strip ANSI escape sequences from raw terminal output */
function stripAnsi(text: string): string {
	// Matches CSI sequences, OSC sequences, and other common escape codes
	return text.replace(
		// biome-ignore lint: complex regex for ANSI stripping
		/\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][A-Z0-9]|\x1b[>=<]|\x1b\[[\?]?[0-9;]*[hl]/g,
		"",
	);
}

/** Regex to find http(s)://host:port URLs in text */
const URL_PATTERN = /https?:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0):(\d+)/g;

/**
 * Track which terminal session is running OpenCode so we can
 * reset connection state when that terminal closes.
 */
let opencodeTerminalSessionId: string | null = null;

/**
 * Check if a URL points to an OpenCode server by hitting /global/health.
 * Returns the verified base URL (without trailing slash) or null.
 */
async function verifyOpenCodeServer(url: string): Promise<string | null> {
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 2000);
		const res = await fetch(`${url}/global/health`, {
			signal: controller.signal,
		});
		clearTimeout(timeout);
		if (!res.ok) return null;
		const body = await res.json() as { healthy?: boolean };
		if (body?.healthy) return url;
		return null;
	} catch {
		return null;
	}
}

/**
 * Scan raw PTY output for HTTP URLs and check if any is an OpenCode server.
 * Only scans for the first ~30 seconds after a terminal spawns (to avoid
 * wasting cycles on long-running sessions that won't start OpenCode).
 */
function createPtyUrlDetector(terminalSessionId: string) {
	const decoder = new TextDecoder();
	let active = true;
	const alreadyChecked = new Set<string>();

	// Stop scanning after 60 seconds — if OpenCode hasn't started by then,
	// it's not going to.
	const scanTimeout = setTimeout(() => {
		active = false;
	}, 60_000);

	return {
		scan(data: Uint8Array) {
			if (!active) return;
			const text = stripAnsi(decoder.decode(data, { stream: true }));
			let match: RegExpExecArray | null;
			URL_PATTERN.lastIndex = 0;
			while ((match = URL_PATTERN.exec(text)) !== null) {
				const candidateUrl = match[0];
				if (alreadyChecked.has(candidateUrl)) continue;
				alreadyChecked.add(candidateUrl);

				// Verify asynchronously — don't block the PTY data callback
				verifyOpenCodeServer(candidateUrl).then((verifiedUrl) => {
					if (verifiedUrl && active) {
						active = false; // Found it — stop scanning
						opencodeTerminalSessionId = terminalSessionId;
						opencodeBaseUrl = verifiedUrl;
						// Restart SSE to connect to the newly discovered server
						startOpenCodeSSE();
						// Immediately push updated context to webview
						fetchOpenCodeContext().then((ctx) => {
							mainWindow.webview.rpc?.send.openCodeContextUpdated(ctx);
						}).catch(() => {});
					}
				});
			}
		},
		dispose() {
			active = false;
			clearTimeout(scanTimeout);
		},
	};
}

/* ------------------------------------------------------------------ */
/*  OpenCode server integration                                       */
/* ------------------------------------------------------------------ */

let opencodeBaseUrl = "http://127.0.0.1:4096";

/** Fetch JSON from the OpenCode server with a short timeout */
async function opencodeFetch<T>(urlPath: string): Promise<T | null> {
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 3000);
		const res = await fetch(`${opencodeBaseUrl}${urlPath}`, {
			signal: controller.signal,
		});
		clearTimeout(timeout);
		if (!res.ok) return null;
		return (await res.json()) as T;
	} catch {
		return null;
	}
}

/** Empty context data returned when OpenCode is unreachable */
function emptyContextData(): OpenCodeContextData {
	return {
		connected: false,
		sessionId: null,
		sessionTitle: null,
		sessionStatus: null,
		tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		sessionCost: 0,
		todayCost: 0,
		mcpServers: [],
		model: null,
		serverUrl: opencodeBaseUrl,
	};
}

/** Fetch complete context sidebar data from the OpenCode server */
async function fetchOpenCodeContext(): Promise<OpenCodeContextData> {
	// 1. Check if server is reachable by fetching session statuses
	type SessionStatusMap = Record<string, { type: "idle" | "busy" | "retry" }>;
	const statusMap = await opencodeFetch<SessionStatusMap>("/session/status");
	if (!statusMap) return emptyContextData();

	// 2. Find the active session: prefer busy > most recently updated idle
	type OcSession = {
		id: string;
		title: string;
		time: { created: number; updated: number };
	};
	const sessions = await opencodeFetch<OcSession[]>("/session");
	if (!sessions || sessions.length === 0) {
		return { ...emptyContextData(), connected: true };
	}

	// Find a busy session first, then fall back to the most recently updated
	let targetSession: OcSession | null = null;
	let targetStatus: "idle" | "busy" | "retry" = "idle";

	// Check for busy sessions
	for (const session of sessions) {
		const status = statusMap[session.id];
		if (status?.type === "busy") {
			targetSession = session;
			targetStatus = "busy";
			break;
		}
	}

	// If no busy session, pick the most recently updated
	if (!targetSession) {
		const sorted = [...sessions].sort((a, b) => b.time.updated - a.time.updated);
		targetSession = sorted[0];
		targetStatus = statusMap[targetSession.id]?.type ?? "idle";
	}

	// 3. Determine which sessions were active today (for todayCost).
	//    Session timestamps are in milliseconds (Unix epoch).
	const now = new Date();
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const todaySessions = sessions
		.filter((s) => s.time.updated >= todayStart)
		.sort((a, b) => b.time.updated - a.time.updated)
		.slice(0, 15); // Cap to avoid RPC timeout with many sessions

	// 4. Fetch messages for the target session + all today sessions, MCP status,
	//    and providers in parallel.
	type OcMessage = {
		info: {
			role: "user" | "assistant";
			cost?: number;
			tokens?: {
				input: number;
				output: number;
				reasoning: number;
				cache: { read: number; write: number };
			};
			modelID?: string;
			providerID?: string;
		};
		parts: unknown[];
	};
	type McpStatusMap = Record<string, { status: string; error?: string }>;
	type OcProvider = {
		id: string;
		models: Record<string, {
			id: string;
			name: string;
			limit: { context: number; output: number };
		}>;
	};
	type OcProvidersResponse = {
		providers: OcProvider[];
		default: Record<string, string>;
	};

	// Build the set of session IDs we need messages for.
	// Always include the target session; also include today's sessions for cost.
	const todaySessionIds = new Set(todaySessions.map((s) => s.id));
	todaySessionIds.add(targetSession.id);

	const messagePromises = [...todaySessionIds].map((sid) =>
		opencodeFetch<OcMessage[]>(`/session/${sid}/message`).then((msgs) => ({
			sessionId: sid,
			messages: msgs,
		})),
	);

	const [messageResults, mcpMap, providersResponse] = await Promise.all([
		Promise.all(messagePromises),
		opencodeFetch<McpStatusMap>("/mcp"),
		opencodeFetch<OcProvidersResponse>("/config/providers"),
	]);
	const providers = providersResponse?.providers ?? null;

	// Process messages for the target session (tokens + cost)
	const tokens: OpenCodeTokens = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
	let sessionCost = 0;
	let lastModelID: string | undefined;
	let lastProviderID: string | undefined;

	// Also compute today's total cost across all fetched sessions
	let todayCost = 0;

	for (const { sessionId, messages } of messageResults) {
		if (!messages) continue;
		const isTarget = sessionId === targetSession.id;
		const isToday = todaySessions.some((s) => s.id === sessionId);

		for (const msg of messages) {
			if (msg.info.role !== "assistant") continue;
			const msgCost = msg.info.cost ?? 0;

			if (isToday) todayCost += msgCost;

			if (isTarget) {
				sessionCost += msgCost;
				if (msg.info.tokens) {
					tokens.input += msg.info.tokens.input;
					tokens.output += msg.info.tokens.output;
					tokens.reasoning += msg.info.tokens.reasoning;
					tokens.cacheRead += msg.info.tokens.cache.read;
					tokens.cacheWrite += msg.info.tokens.cache.write;
				}
				if (msg.info.modelID) lastModelID = msg.info.modelID;
				if (msg.info.providerID) lastProviderID = msg.info.providerID;
			}
		}
	}
	tokens.total = tokens.input + tokens.output + tokens.reasoning;

	// Process MCP server statuses
	const mcpServers: OpenCodeMcpServer[] = [];
	if (mcpMap) {
		for (const [name, info] of Object.entries(mcpMap)) {
			mcpServers.push({
				name,
				status: info.status as OpenCodeMcpServer["status"],
				error: info.error,
			});
		}
	}

	// Resolve model info from providers
	let model: OpenCodeModelInfo | null = null;
	if (lastProviderID && lastModelID && providers) {
		const provider = providers.find((p) => p.id === lastProviderID);
		if (provider) {
			const modelInfo = provider.models[lastModelID];
			if (modelInfo) {
				model = {
					id: modelInfo.id,
					providerID: provider.id,
					name: modelInfo.name,
					contextLimit: modelInfo.limit.context,
					outputLimit: modelInfo.limit.output,
				};
			}
		}
	}

	return {
		connected: true,
		sessionId: targetSession.id,
		sessionTitle: targetSession.title,
		sessionStatus: targetStatus,
		tokens,
		sessionCost,
		todayCost,
		mcpServers,
		model,
		serverUrl: opencodeBaseUrl,
	};
}

/* ------------------------------------------------------------------ */
/*  OpenCode SSE event stream                                         */
/* ------------------------------------------------------------------ */

let sseAbortController: AbortController | null = null;

/**
 * Subscribe to SSE events from the OpenCode server.
 * On relevant events, re-fetches context and pushes to the webview.
 * Automatically reconnects on disconnect with exponential backoff.
 */
function startOpenCodeSSE() {
	stopOpenCodeSSE();

	const controller = new AbortController();
	sseAbortController = controller;

	let reconnectDelay = 10000;
	const MAX_RECONNECT_DELAY = 10000;

	async function connect() {
		try {
			const res = await fetch(`${opencodeBaseUrl}/event`, {
				signal: controller.signal,
				headers: { Accept: "text/event-stream" },
			});

			if (!res.ok || !res.body) {
				throw new Error(`SSE connect failed: ${res.status}`);
			}

			// Reset delay on successful connection
			reconnectDelay = 1000;

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			// Debounce re-fetches: multiple SSE events in quick succession
			// should trigger only one context refresh.
			let refreshTimer: ReturnType<typeof setTimeout> | null = null;
			const scheduleRefresh = () => {
				if (refreshTimer) clearTimeout(refreshTimer);
				refreshTimer = setTimeout(async () => {
					refreshTimer = null;
					try {
						const data = await fetchOpenCodeContext();
						mainWindow.webview.rpc?.send.openCodeContextUpdated(data);
					} catch {
						// Ignore fetch errors during SSE-triggered refresh
					}
				}, 200);
			};

			while (true) {
				const { done, value } = await reader.read();
				if (done || controller.signal.aborted) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";

				for (const line of lines) {
					// SSE format: "event: <type>" or "data: <json>"
					// We care about certain event types that indicate state changes.
					if (line.startsWith("event: ")) {
						const eventType = line.substring(7).trim();
						// Refresh on events that change context sidebar data
						if (
							eventType === "message.part.updated" ||
							eventType === "session.status" ||
							eventType === "session.idle" ||
							eventType === "session.updated" ||
							eventType === "session.created" ||
							eventType === "session.deleted"
						) {
							scheduleRefresh();
						}
					}
				}
			}
		} catch (err) {
			if (controller.signal.aborted) return; // Intentional stop
		}

		// Reconnect with backoff (unless aborted)
		if (!controller.signal.aborted) {
			setTimeout(() => {
				if (!controller.signal.aborted) connect();
			}, reconnectDelay);
			reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
		}
	}

	connect();
}

function stopOpenCodeSSE() {
	if (sseAbortController) {
		sseAbortController.abort();
		sseAbortController = null;
	}
}

/* ------------------------------------------------------------------ */
/*  RPC bridge                                                        */
/* ------------------------------------------------------------------ */

const rpc = BrowserView.defineRPC<KarabinerRPC>({
	maxRequestTime: 10_000,
	handlers: {
		requests: {
			terminalSpawn: ({ cols, rows, cwd }) => {
				const sessionId = `term-${++sessionCounter}`;

				// Buffer PTY output and flush on a timer to avoid
				// overwhelming the RPC channel with per-chunk messages.
				// TUI apps (opencode, vim, htop…) emit many small writes
				// in rapid succession — batching keeps the bridge healthy.
				// We collect raw Uint8Array chunks and base64-encode on flush
				// to preserve binary escape sequences through JSON serialization.
				let outputChunks: Uint8Array[] = [];
				let flushTimer: ReturnType<typeof setTimeout> | null = null;
				const FLUSH_INTERVAL_MS = 8; // ~120 fps

				const flushOutput = () => {
					flushTimer = null;
					if (outputChunks.length > 0) {
						const combined = Buffer.concat(outputChunks);
						outputChunks = [];
						const data = combined.toString("base64");
						mainWindow.webview.rpc?.send.terminalOutput({
							sessionId,
							data,
						});
					}
				};

				// Auto-detect OpenCode server URLs in terminal output
				const urlDetector = createPtyUrlDetector(sessionId);

				const userShell = process.env.SHELL || "/bin/zsh";

				const proc = Bun.spawn([userShell, "-l"], {
					cwd: cwd ?? process.cwd(),
					env: {
						...process.env,
						TERM: "xterm-256color",
						COLORTERM: "truecolor",
					},
					terminal: {
						cols,
						rows,
						data(_terminal, data) {
							// Copy the chunk — data may be a Buffer slice with
							// a shared underlying ArrayBuffer that gets reused.
							const chunk = new Uint8Array(data.length);
							chunk.set(data instanceof Uint8Array ? data : new Uint8Array(data));
							outputChunks.push(chunk);
							if (!flushTimer) {
								flushTimer = setTimeout(flushOutput, FLUSH_INTERVAL_MS);
							}

							// Scan for OpenCode server URLs in the output
							urlDetector.scan(chunk);
						},
					},
				});

				// Handle process exit
				proc.exited.then((code) => {
					// Flush any remaining buffered output
					if (flushTimer) {
						clearTimeout(flushTimer);
						flushTimer = null;
					}
					flushOutput();

					// Clean up URL detector
					urlDetector.dispose();

					// If this was the terminal running OpenCode, reset connection
					if (opencodeTerminalSessionId === sessionId) {
						opencodeTerminalSessionId = null;
						// Push disconnected state to webview
						fetchOpenCodeContext().then((ctx) => {
							mainWindow.webview.rpc?.send.openCodeContextUpdated(ctx);
						}).catch(() => {});
					}

					mainWindow.webview.rpc?.send.terminalExit({
						sessionId,
						code: code ?? 0,
					});
					sessions.delete(sessionId);
				});

				sessions.set(sessionId, { proc, cols, rows });
				return { sessionId };
			},

			terminalResize: ({ sessionId, cols, rows }) => {
				const session = sessions.get(sessionId);
				if (!session) return { ok: false };
				session.proc.terminal?.resize(cols, rows);
				session.cols = cols;
				session.rows = rows;
				return { ok: true };
			},

			terminalClose: ({ sessionId }) => {
				const session = sessions.get(sessionId);
				if (!session) return { ok: false };
				session.proc.terminal?.close();
				session.proc.kill();
				sessions.delete(sessionId);
				return { ok: true };
			},

		readDirectory: ({ path: dirPath }) => {
			try {
				const names = fs.readdirSync(dirPath);
				const entries: Array<{
					name: string;
					path: string;
					isDirectory: boolean;
				}> = [];

				for (const name of names) {
					// Skip hidden files
					if (name.startsWith(".")) continue;
					const fullPath = path.join(dirPath, name);
					try {
						const stat = fs.statSync(fullPath);
						entries.push({
							name,
							path: fullPath,
							isDirectory: stat.isDirectory(),
						});
					} catch {
						// Skip files we can't stat
					}
				}

				// Sort: directories first, then alphabetical
				entries.sort((a, b) => {
					if (a.isDirectory !== b.isDirectory)
						return a.isDirectory ? -1 : 1;
					return a.name.localeCompare(b.name);
				});

				return { entries };
			} catch {
				return { entries: [] };
			}
		},

			gitStatus: async ({ cwd }) => {
				try {
					const proc = Bun.spawn(["git", "status", "--porcelain", "-uall"], {
						cwd,
						stdout: "pipe",
						stderr: "pipe",
					});
					const stdout = await new Response(proc.stdout).text();
					await proc.exited;

					if (proc.exitCode !== 0) {
						return { files: {}, isGitRepo: false };
					}

					const files: Record<string, string> = {};
					for (const line of stdout.split("\n")) {
						if (!line || line.length < 4) continue;
						// git status --porcelain format: XY filename
						// X = index status, Y = work tree status
						const statusCode = line.substring(0, 2).trim();
						let filePath = line.substring(3);
						// Handle renames: "R  old -> new"
						if (filePath.includes(" -> ")) {
							filePath = filePath.split(" -> ")[1];
						}
						files[filePath] = statusCode;
					}

					return { files, isGitRepo: true };
				} catch {
					return { files: {}, isGitRepo: false };
				}
			},

		readFile: ({ path: filePath }) => {
			try {
				// Check for binary files by reading first bytes
				const fd = fs.openSync(filePath, "r");
				const buf = Buffer.alloc(8192);
				const bytesRead = fs.readSync(fd, buf, 0, 8192, 0);
				fs.closeSync(fd);

				// Simple binary detection: check for null bytes in the first chunk
				for (let i = 0; i < bytesRead; i++) {
					if (buf[i] === 0) {
						return { contents: "", isBinary: true };
					}
				}

				const contents = fs.readFileSync(filePath, "utf-8");
				return { contents, isBinary: false };
			} catch {
				return { contents: "", isBinary: true };
			}
		},

			gitShowFile: async ({ cwd, relativePath }) => {
				try {
					const proc = Bun.spawn(
						["git", "show", `HEAD:${relativePath}`],
						{
							cwd,
							stdout: "pipe",
							stderr: "pipe",
						},
					);
					const stdout = await new Response(proc.stdout).text();
					await proc.exited;

					if (proc.exitCode !== 0) {
						// File doesn't exist in HEAD (new/untracked file)
						return { contents: "", isNew: true };
					}

					return { contents: stdout, isNew: false };
				} catch {
					return { contents: "", isNew: true };
				}
			},

			writeFile: ({ path: filePath, contents }) => {
				try {
					fs.writeFileSync(filePath, contents, "utf-8");
					return { ok: true };
				} catch (err) {
					return { ok: false, error: String(err) };
				}
			},

			gitBranchInfo: async ({ cwd }) => {
				try {
					// Get current branch name
					const branchProc = Bun.spawn(
						["git", "rev-parse", "--abbrev-ref", "HEAD"],
						{ cwd, stdout: "pipe", stderr: "pipe" },
					);
					const branchName = (await new Response(branchProc.stdout).text()).trim();
					await branchProc.exited;

					if (branchProc.exitCode !== 0) {
						return { branch: null, ahead: 0, behind: 0 };
					}

					// Get ahead/behind counts relative to upstream
					let ahead = 0;
					let behind = 0;
					try {
						const revListProc = Bun.spawn(
							["git", "rev-list", "--left-right", "--count", `${branchName}...@{upstream}`],
							{ cwd, stdout: "pipe", stderr: "pipe" },
						);
						const revOutput = (await new Response(revListProc.stdout).text()).trim();
						await revListProc.exited;

						if (revListProc.exitCode === 0 && revOutput) {
							const parts = revOutput.split(/\s+/);
							ahead = parseInt(parts[0], 10) || 0;
							behind = parseInt(parts[1], 10) || 0;
						}
					} catch {
						// No upstream configured — ahead/behind stay 0
					}

					return { branch: branchName, ahead, behind };
				} catch {
					return { branch: null, ahead: 0, behind: 0 };
				}
			},

			watchDirectory: ({ path: dirPath }) => {
				// Don't double-watch
				if (watchers.has(dirPath)) return { ok: true };

				try {
					const watcher = fs.watch(dirPath, { recursive: true }, (_event, filename) => {
						if (!filename) return;
						// Skip hidden files and common noisy directories
						if (filename.startsWith(".git/") || filename.includes("node_modules/")) return;

						const fullPath = path.join(dirPath, filename);

						// Determine event type
						let eventType: "create" | "update" | "delete" = "update";
						try {
							fs.statSync(fullPath);
							// File exists — could be create or update, we report "update"
							// (the webview will refresh git status either way)
							eventType = "update";
						} catch {
							eventType = "delete";
						}

						mainWindow.webview.rpc?.send.fileChanged({
							path: fullPath,
							event: eventType,
						});
					});

					watchers.set(dirPath, watcher);
					return { ok: true };
				} catch {
					return { ok: false };
				}
			},

			unwatchDirectory: ({ path: dirPath }) => {
				const watcher = watchers.get(dirPath);
				if (watcher) {
					watcher.close();
					watchers.delete(dirPath);
				}
				return { ok: true };
			},

			getOpenCodeContext: async () => {
				return await fetchOpenCodeContext();
			},

			getOpenCodeUrl: () => {
				return { url: opencodeBaseUrl };
			},
		},
		messages: {
			terminalWrite: ({ sessionId, data }) => {
				const session = sessions.get(sessionId);
				if (session) {
					session.proc.terminal?.write(data);
				}
			},
			openExternal: ({ url }) => {
				Utils.openExternal(url);
			},
			setOpenCodeUrl: ({ url }) => {
				opencodeBaseUrl = url;
				// Restart SSE with the new URL
				startOpenCodeSSE();
			},
			openFolderDialog: async () => {
				const chosenPaths = await Utils.openFileDialog({
					startingFolder: Utils.paths.home,
					allowedFileTypes: "*",
					canChooseFiles: false,
					canChooseDirectory: true,
					allowsMultipleSelection: false,
				});

				if (chosenPaths && chosenPaths.length > 0) {
					mainWindow.webview.rpc?.send.workspaceOpened({
						path: chosenPaths[0],
					});
				}
			},
		},
	},
});

/* ------------------------------------------------------------------ */
/*  Check for Vite HMR dev server                                    */
/* ------------------------------------------------------------------ */

async function getMainViewUrl(): Promise<string> {
	const channel = await Updater.localInfo.channel();
	if (channel === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
			return DEV_SERVER_URL;
		} catch {
			console.log(
				"Vite dev server not running. Run 'bun run dev:hmr' for HMR support.",
			);
		}
	}
	return "views://mainview/index.html";
}

/* ------------------------------------------------------------------ */
/*  Application menu                                                  */
/* ------------------------------------------------------------------ */

ApplicationMenu.setApplicationMenu([
	{
		submenu: [
			{ label: "About Karabiner", role: "hide" },
			{ type: "separator" },
			{ label: "Hide Karabiner", role: "hide" },
			{ label: "Hide Others", role: "hideOthers" },
			{ label: "Show All", role: "showAll" },
			{ type: "separator" },
			{ label: "Quit Karabiner", role: "quit" },
		],
	},
	{
		label: "File",
		submenu: [
			{ label: "Open Folder...", action: "open-folder", accelerator: "o" },
			{ type: "separator" },
			{ label: "Save", action: "save-file", accelerator: "s" },
			{ type: "separator" },
			{ label: "New Terminal", action: "new-terminal", accelerator: "t" },
			{ label: "Open OpenCode", action: "open-opencode" },
			{ type: "separator" },
			{ label: "Close Window", role: "close" },
		],
	},
	{
		label: "Edit",
		submenu: [
			{ role: "undo" },
			{ role: "redo" },
			{ type: "separator" },
			{ role: "cut" },
			{ role: "copy" },
			{ role: "paste" },
			{ role: "selectAll" },
		],
	},
	{
		label: "View",
		submenu: [
			{ label: "Toggle Full Screen", role: "toggleFullScreen" },
			{ type: "separator" },
			{ label: "Toggle DevTools", action: "toggle-devtools" },
		],
	},
]);

/* ------------------------------------------------------------------ */
/*  Create main window                                                */
/* ------------------------------------------------------------------ */

const url = await getMainViewUrl();

const mainWindow = new BrowserWindow({
	title: "Karabiner",
	url,
	rpc,
	frame: {
		width: 1200,
		height: 800,
		x: 200,
		y: 200,
	},
});

/* ------------------------------------------------------------------ */
/*  Handle application menu actions                                   */
/* ------------------------------------------------------------------ */

Electrobun.events.on("application-menu-clicked", async (e) => {
	if (e.data.action === "open-folder") {
		const chosenPaths = await Utils.openFileDialog({
			startingFolder: Utils.paths.home,
			allowedFileTypes: "*",
			canChooseFiles: false,
			canChooseDirectory: true,
			allowsMultipleSelection: false,
		});

		if (chosenPaths && chosenPaths.length > 0) {
			mainWindow.webview.rpc?.send.workspaceOpened({
				path: chosenPaths[0],
			});
		}
	} else if (e.data.action === "open-opencode") {
		mainWindow.webview.rpc?.send.openOpenCodeTerminal({});
	}
});

console.log("Karabiner app started!");

// Start listening for OpenCode server SSE events
startOpenCodeSSE();
