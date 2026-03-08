import { Electroview } from "electrobun/view";
import type { KarabinerRPC } from "../shared/rpc";

/* ------------------------------------------------------------------ */
/*  Terminal output / exit event listeners                             */
/* ------------------------------------------------------------------ */

type OutputCallback = (sessionId: string, data: string) => void;
type ExitCallback = (sessionId: string, code: number) => void;

const outputListeners = new Set<OutputCallback>();
const exitListeners = new Set<ExitCallback>();

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
		},
	},
});

const electroview = new Electroview({ rpc: rpcHandlers });

/* ------------------------------------------------------------------ */
/*  Public API for terminal panels                                     */
/* ------------------------------------------------------------------ */

export const terminalRpc = {
	/** Spawn a new PTY session. Returns the session id. */
	spawn: async (cols: number, rows: number): Promise<string> => {
		const result = await electroview.rpc!.request.terminalSpawn({
			cols,
			rows,
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

export { electroview };
