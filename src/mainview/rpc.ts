import { Electroview } from "electrobun/view";
import type { KarabinerRPC } from "../shared/rpc";

/* ------------------------------------------------------------------ */
/*  Terminal output / exit event listeners                             */
/* ------------------------------------------------------------------ */

type OutputCallback = (sessionId: string, data: string) => void;
type ExitCallback = (sessionId: string, code: number) => void;
type WorkspaceOpenedCallback = (path: string) => void;
type FileChangedCallback = (path: string, event: "create" | "update" | "delete") => void;

const outputListeners = new Set<OutputCallback>();
const exitListeners = new Set<ExitCallback>();
const workspaceOpenedListeners = new Set<WorkspaceOpenedCallback>();
const fileChangedListeners = new Set<FileChangedCallback>();

/* ------------------------------------------------------------------ */
/*  Electroview RPC setup                                              */
/* ------------------------------------------------------------------ */

const rpcHandlers = Electroview.defineRPC<KarabinerRPC>({
	handlers: {
		requests: {},
		messages: {
			terminalOutput: ({ sessionId, data }) => {
				for (const cb of outputListeners) {
					cb(sessionId, data);
				}
			},
			terminalExit: ({ sessionId, code }) => {
				for (const cb of exitListeners) {
					cb(sessionId, code);
				}
			},
			workspaceOpened: ({ path }) => {
				for (const cb of workspaceOpenedListeners) {
					cb(path);
				}
			},
			fileChanged: ({ path, event }) => {
				for (const cb of fileChangedListeners) {
					cb(path, event);
				}
			},
		},
	},
});

const electroview = new Electroview({ rpc: rpcHandlers });

/* ------------------------------------------------------------------ */
/*  Public API for terminal panels                                     */
/* ------------------------------------------------------------------ */

export const terminalRpc = {
	/** Spawn a new PTY session. Returns the session id. */
	spawn: async (cols: number, rows: number, cwd?: string): Promise<string> => {
		const result = await electroview.rpc!.request.terminalSpawn({
			cols,
			rows,
			cwd,
		});
		return result.sessionId;
	},

	/** Write user input to a terminal session (fire-and-forget). */
	write: (sessionId: string, data: string): void => {
		electroview.rpc!.send.terminalWrite({ sessionId, data });
	},

	/** Resize a terminal session. */
	resize: (sessionId: string, cols: number, rows: number): void => {
		electroview.rpc!.request.terminalResize({ sessionId, cols, rows });
	},

	/** Close / kill a terminal session. */
	close: (sessionId: string): void => {
		electroview.rpc!.request.terminalClose({ sessionId });
	},

	/** Subscribe to PTY output. Returns an unsubscribe function. */
	onOutput: (cb: OutputCallback): (() => void) => {
		outputListeners.add(cb);
		return () => outputListeners.delete(cb);
	},

	/** Subscribe to terminal exit. Returns an unsubscribe function. */
	onExit: (cb: ExitCallback): (() => void) => {
		exitListeners.add(cb);
		return () => exitListeners.delete(cb);
	},

	/** Whether the RPC bridge is available (running inside Electrobun). */
	get available(): boolean {
		return electroview.rpc != null;
	},
};

/** Read a directory listing (used by the file tree sidebar). */
export const readDirectory = async (path: string) => {
	return electroview.rpc!.request.readDirectory({ path });
};

/** Get git status for all changed files in a repository. */
export const gitStatus = async (cwd: string) => {
	return electroview.rpc!.request.gitStatus({ cwd });
};

/** Read file contents as a UTF-8 string. */
export const readFile = async (path: string) => {
	return electroview.rpc!.request.readFile({ path });
};

/** Get the original (HEAD) version of a file from git. */
export const gitShowFile = async (cwd: string, relativePath: string) => {
	return electroview.rpc!.request.gitShowFile({ cwd, relativePath });
};

/** Write file contents to disk. */
export const writeFile = async (path: string, contents: string) => {
	return electroview.rpc!.request.writeFile({ path, contents });
};

/** Get current git branch name and ahead/behind counts. */
export const gitBranchInfo = async (cwd: string) => {
	return electroview.rpc!.request.gitBranchInfo({ cwd });
};

/** Start watching a directory for file changes. */
export const watchDirectory = async (path: string) => {
	return electroview.rpc!.request.watchDirectory({ path });
};

/** Stop watching a directory for file changes. */
export const unwatchDirectory = async (path: string) => {
	return electroview.rpc!.request.unwatchDirectory({ path });
};

/** Ask bun to open a native folder picker dialog. Result arrives via onWorkspaceOpened callback. */
export const openFolderDialog = (): void => {
	electroview.rpc!.send.openFolderDialog({});
};

/** Open a URL in the system default browser. */
export const openExternal = (url: string): void => {
	electroview.rpc!.send.openExternal({ url });
};

/** Subscribe to workspace-opened events (triggered from the app menu). Returns an unsubscribe function. */
export const onWorkspaceOpened = (cb: WorkspaceOpenedCallback): (() => void) => {
	workspaceOpenedListeners.add(cb);
	return () => workspaceOpenedListeners.delete(cb);
};

/** Subscribe to file change events (from the file watcher). Returns an unsubscribe function. */
export const onFileChanged = (cb: FileChangedCallback): (() => void) => {
	fileChangedListeners.add(cb);
	return () => fileChangedListeners.delete(cb);
};

export { electroview };
