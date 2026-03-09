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
		/** Get git status for all changed files in a repo */
		gitStatus: {
			params: { cwd: string };
			response: {
				/** Map of relative file path → git status code (M, A, D, ??, R, !, C, etc.) */
				files: Record<string, string>;
				/** Whether this directory is inside a git repo */
				isGitRepo: boolean;
			};
		};
		/** Read file contents as a UTF-8 string */
		readFile: {
			params: { path: string };
			response: {
				contents: string;
				/** True if this is a binary file (contents will be empty) */
				isBinary: boolean;
			};
		};
		/** Get the original (HEAD) version of a file from git */
		gitShowFile: {
			params: { cwd: string; relativePath: string };
			response: {
				contents: string;
				/** True if the file doesn't exist in HEAD (new file) */
				isNew: boolean;
			};
		};
		/** Write file contents to disk */
		writeFile: {
			params: { path: string; contents: string };
			response: { ok: boolean; error?: string };
		};
		/** Get the current git branch name and ahead/behind counts */
		gitBranchInfo: {
			params: { cwd: string };
			response: {
				/** Current branch name (e.g. "main") or null if not a git repo / detached HEAD */
				branch: string | null;
				/** Number of commits ahead of remote */
				ahead: number;
				/** Number of commits behind remote */
				behind: number;
			};
		};
		/** Start watching a directory for file changes */
		watchDirectory: {
			params: { path: string };
			response: { ok: boolean };
		};
		/** Stop watching a directory for file changes */
		unwatchDirectory: {
			params: { path: string };
			response: { ok: boolean };
		};
	};
	messages: {
		/** Write user input to a terminal session */
		terminalWrite: { sessionId: string; data: string };
		/** Request to open a native folder picker dialog (fire-and-forget; result comes back via workspaceOpened message) */
		openFolderDialog: Record<string, never>;
		/** Open a URL in the system default browser */
		openExternal: { url: string };
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
		/** A folder was opened in the workspace (triggered from app menu) */
		workspaceOpened: { path: string };
		/** A file or directory changed on disk (from file watcher) */
		fileChanged: { path: string; event: "create" | "update" | "delete" };
	};
}>;

export type KarabinerRPC = {
	bun: BunSchema;
	webview: WebviewSchema;
};
