import {
	BrowserWindow,
	BrowserView,
	ApplicationMenu,
	Updater,
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
/*  RPC bridge                                                        */
/* ------------------------------------------------------------------ */

const rpc = BrowserView.defineRPC<KarabinerRPC>({
	maxRequestTime: 10_000,
	handlers: {
		requests: {
			terminalSpawn: ({ cols, rows, cwd }) => {
				const sessionId = `term-${++sessionCounter}`;

				const proc = Bun.spawn(["bash", "-l"], {
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
							// Send PTY output to the webview
							mainWindow.webview.rpc?.send.terminalOutput({
								sessionId,
								data: Buffer.from(data).toString("utf-8"),
							});
						},
					},
				});

				// Handle process exit
				proc.exited.then((code) => {
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
					const fs = require("node:fs") as typeof import("node:fs");
					const path = require("node:path") as typeof import("node:path");

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
		},
		messages: {
			terminalWrite: ({ sessionId, data }) => {
				const session = sessions.get(sessionId);
				if (session) {
					session.proc.terminal?.write(data);
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

console.log("Karabiner app started!");
