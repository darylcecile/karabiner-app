import { useEffect, useRef, useCallback, type FC } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { IDockviewPanelProps } from "dockview";
import { terminalRpc } from "../rpc";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface TerminalPanelParams {
	/** Unique terminal session id (set after spawn) */
	sessionId?: string;
	/** Working directory for the terminal */
	cwd?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

/**
 * Terminal panel that renders xterm.js inside a Dockview panel.
 * Connects to the Bun PTY via the Electrobun RPC bridge.
 */
export const TerminalPanel: FC<IDockviewPanelProps<TerminalPanelParams>> = (props) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const termRef = useRef<Terminal | null>(null);
	const fitRef = useRef<FitAddon | null>(null);
	const sessionIdRef = useRef<string | null>(null);
	const cwdRef = useRef<string | undefined>((props.params as TerminalPanelParams).cwd);

	/** Fit the terminal to its container and notify the PTY */
	const fit = useCallback(() => {
		const fitAddon = fitRef.current;
		if (!fitAddon) return;
		try {
			fitAddon.fit();
			const term = termRef.current;
			const sid = sessionIdRef.current;
			if (term && sid) {
				terminalRpc.resize(sid, term.cols, term.rows);
			}
		} catch {
			// Container may not be visible yet
		}
	}, []);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		// Create xterm instance
		const term = new Terminal({
			fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace",
			fontSize: 13,
			lineHeight: 1.0,
			cursorBlink: true,
			cursorStyle: "bar",
			theme: {
				background: "#1e1e1e",
				foreground: "#cccccc",
				cursor: "#aeafad",
				selectionBackground: "#264f78",
				black: "#1e1e1e",
				red: "#f44747",
				green: "#6a9955",
				yellow: "#d7ba7d",
				blue: "#569cd6",
				magenta: "#c586c0",
				cyan: "#4ec9b0",
				white: "#d4d4d4",
				brightBlack: "#808080",
				brightRed: "#f44747",
				brightGreen: "#6a9955",
				brightYellow: "#d7ba7d",
				brightBlue: "#569cd6",
				brightMagenta: "#c586c0",
				brightCyan: "#4ec9b0",
				brightWhite: "#e5e5e5",
			},
			allowProposedApi: true,
		});

		const fitAddon = new FitAddon();
		term.loadAddon(fitAddon);
		term.open(container);

		termRef.current = term;
		fitRef.current = fitAddon;

		// Initial fit
		requestAnimationFrame(() => {
			try {
				fitAddon.fit();
			} catch {
				// noop
			}
		});

		// Connect to PTY via Electrobun RPC
		let unsubOutput: (() => void) | undefined;
		let unsubExit: (() => void) | undefined;

		if (terminalRpc.available) {
			// Streaming TextDecoder handles multi-byte UTF-8 chars that may be
			// split across consecutive base64 batches (the {stream: true} option
			// keeps partial sequences buffered between decode() calls).
			const utf8Decoder = new TextDecoder("utf-8", { fatal: false });

			// Subscribe to output before spawning so we don't miss early output
			unsubOutput = terminalRpc.onOutput((sid, data) => {
				if (sid === sessionIdRef.current) {
					// Data arrives as base64-encoded raw PTY bytes.
					// Decode base64 → Uint8Array → UTF-8 string for xterm.js.
					try {
						const binaryString = atob(data);
						const bytes = new Uint8Array(binaryString.length);
						for (let i = 0; i < binaryString.length; i++) {
							bytes[i] = binaryString.charCodeAt(i);
						}
						const decoded = utf8Decoder.decode(bytes, { stream: true });
						if (decoded.length > 0) {
							term.write(decoded);
						}
					} catch (err) {
						console.error("[Terminal] decode error:", err);
					}
				}
			});

			unsubExit = terminalRpc.onExit((sid, code) => {
				if (sid === sessionIdRef.current) {
					term.writeln(`\r\n\x1b[90m[Process exited with code ${code}]\x1b[0m`);
				}
			});

			// Spawn terminal
			terminalRpc.spawn(term.cols, term.rows, cwdRef.current).then((sessionId) => {
				sessionIdRef.current = sessionId;

				// Forward user input to PTY
				term.onData((data) => {
					terminalRpc.write(sessionId, data);
				});

				// Forward binary input (e.g. mouse events in TUI apps)
				term.onBinary((data) => {
					terminalRpc.write(sessionId, data);
				});
			});
		} else {
			// No RPC available — show a message
			term.writeln("\x1b[33mTerminal RPC not available.\x1b[0m");
			term.writeln("Running in browser without Electrobun runtime.");
		}

		return () => {
			unsubOutput?.();
			unsubExit?.();

			// Clean up the PTY session on the Bun side
			const sid = sessionIdRef.current;
			if (sid && terminalRpc.available) {
				terminalRpc.close(sid);
			}

			term.dispose();
			termRef.current = null;
			fitRef.current = null;
			sessionIdRef.current = null;
		};
	}, []);

	// Resize when the Dockview panel resizes
	useEffect(() => {
		const api = props.api;
		const disposable = api.onDidDimensionsChange(() => {
			requestAnimationFrame(fit);
		});
		return () => disposable.dispose();
	}, [props.api, fit]);

	return (
		<div
			ref={containerRef}
			className="h-full w-full bg-panel"
			style={{ padding: "4px 0 0 8px" }}
		/>
	);
};
