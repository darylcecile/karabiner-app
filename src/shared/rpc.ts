import { RPCSchema } from "electrobun/bun";

/**
 * Shared RPC type definitions for communication between
 * the Bun main process and the webview (React app).
 */

/** Bun-side handlers (called by the webview) */
type BunSchema = RPCSchema<{
	requests: {
		/** Spawn a new PTY terminal session, returns the session id */
		terminalSpawn: {
			params: { cols: number; rows: number; cwd?: string };
			response: { sessionId: string };
		};
		/** Resize an existing terminal session */
		terminalResize: {
			params: { sessionId: string; cols: number; rows: number };
			response: { ok: boolean };
		};
		/** Close / kill a terminal session */
		terminalClose: {
			params: { sessionId: string };
			response: { ok: boolean };
		};
		/** Read a directory listing for the file tree */
		readDirectory: {
			params: { path: string };
			response: {
				entries: Array<{
					name: string;
					path: string;
					isDirectory: boolean;
				}>;
			};
		};
	};
	messages: {
		/** Write user input to a terminal session */
		terminalWrite: { sessionId: string; data: string };
	};
}>;

/** Webview-side handlers (called by the Bun main process) */
type WebviewSchema = RPCSchema<{
	requests: Record<string, never>;
	messages: {
		/** PTY output data from a terminal session */
		terminalOutput: { sessionId: string; data: string };
		/** Terminal session exited */
		terminalExit: { sessionId: string; code: number };
	};
}>;

export type KarabinerRPC = {
	bun: BunSchema;
	webview: WebviewSchema;
};
