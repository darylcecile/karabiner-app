import Electrobun from "electrobun/bun";
import {
	BrowserWindow,
	BrowserView,
	ApplicationMenu,
	Updater,
	Utils,
} from "electrobun/bun";
import type { KarabinerRPC } from "../shared/rpc";

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
	}
});

console.log("Karabiner app started!");
