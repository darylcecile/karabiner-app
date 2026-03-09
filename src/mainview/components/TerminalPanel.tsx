import { useEffect, useRef, useCallback, useState, type FC } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { SerializeAddon } from "@xterm/addon-serialize";
import "@xterm/xterm/css/xterm.css";
import type { IDockviewPanelProps } from "dockview";
import { terminalRpc, openExternal } from "../rpc";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface TerminalPanelParams {
	/** Unique terminal session id (set after spawn) */
	sessionId?: string;
	/** Working directory for the terminal */
	cwd?: string;
}

/** Shared search decoration colors */
const SEARCH_DECORATIONS = {
	matchBackground: "#515c6a",
	activeMatchBackground: "#eea825",
	matchOverviewRuler: "#515c6a",
	activeMatchColorOverviewRuler: "#eea825",
} as const;

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
	const searchAddonRef = useRef<SearchAddon | null>(null);
	const serializeRef = useRef<SerializeAddon | null>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const sessionIdRef = useRef<string | null>(null);
	const cwdRef = useRef<string | undefined>((props.params as TerminalPanelParams).cwd);

	// Search overlay state
	const [searchOpen, setSearchOpen] = useState(false);
	const [searchText, setSearchText] = useState("");
	const [searchResults, setSearchResults] = useState<{ index: number; count: number }>({ index: -1, count: 0 });

	/** Fit the terminal to its container and notify the PTY */
	const fit = useCallback(() => {
		const fitAddon = fitRef.current;
		if (!fitAddon) return;
		try {
			fitAddon.fit();
			const notify = () => {
				const term = termRef.current;
				const sid = sessionIdRef.current;
				if (term && sid) {
					terminalRpc.resize(sid, term.cols, term.rows);
				}
			};

			requestAnimationFrame(notify);
			requestIdleCallback(notify, { timeout: 300 });
		} catch {
			// Container may not be visible yet
		}
	}, []);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		// Create xterm instance
		const term = new Terminal({
			fontFamily: "'MesloLGSDZ Nerd Font Mono', 'MesloLGS NF', 'JetBrainsMono Nerd Font', 'FiraCode Nerd Font', 'Hack Nerd Font', monospace",
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

		// Try WebGL renderer for better performance. Falls back to
		// the default DOM/canvas renderer if WebGL isn't available
		// (e.g. some WKWebView configurations).
		try {
			const webglAddon = new WebglAddon();
			webglAddon.onContextLoss(() => {
				webglAddon.dispose();
			});
			term.loadAddon(webglAddon);
		} catch {
			// WebGL not available — DOM renderer will be used
		}

		// Make URLs clickable — Cmd+click opens in default browser.
		const webLinksAddon = new WebLinksAddon(
			(event, uri) => {
				if (event.metaKey) {
					openExternal(uri);
				}
			},
		);
		term.loadAddon(webLinksAddon);

		// Unicode 11 — correct width calculation for emoji & CJK characters
		const unicode11Addon = new Unicode11Addon();
		term.loadAddon(unicode11Addon);
		term.unicode.activeVersion = "11";

		// Clipboard — OSC 52 clipboard support for TUI apps (e.g. neovim yank-to-clipboard)
		const clipboardAddon = new ClipboardAddon();
		term.loadAddon(clipboardAddon);

		// Serialize — save/restore terminal state (ref stored for future use)
		const serializeAddon = new SerializeAddon();
		term.loadAddon(serializeAddon);
		serializeRef.current = serializeAddon;

		// Search — Cmd+F find in terminal scrollback
		const searchAddon = new SearchAddon({ highlightLimit: 1000 });
		term.loadAddon(searchAddon);
		searchAddonRef.current = searchAddon;

		// Track search match results in real-time
		searchAddon.onDidChangeResults(({ resultIndex, resultCount }) => {
			setSearchResults({ index: resultIndex, count: resultCount });
		});

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
			searchAddonRef.current = null;
			serializeRef.current = null;
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

	// Cmd+F to open search overlay
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.metaKey && e.key === "f") {
				e.preventDefault();
				setSearchOpen(true);
				// Focus the search input after it renders
				requestAnimationFrame(() => searchInputRef.current?.focus());
			}
		};
		// Listen on window so Cmd+F works even when terminal has focus
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, []);

	/** Close search overlay and clear decorations */
	const closeSearch = useCallback(() => {
		setSearchOpen(false);
		setSearchText("");
		setSearchResults({ index: -1, count: 0 });
		searchAddonRef.current?.clearDecorations();
		termRef.current?.focus();
	}, []);

	/** Run incremental search as user types */
	const handleSearchChange = useCallback((value: string) => {
		setSearchText(value);
		if (value.length === 0) {
			searchAddonRef.current?.clearDecorations();
			setSearchResults({ index: -1, count: 0 });
			return;
		}
		searchAddonRef.current?.findNext(value, {
			caseSensitive: false,
			regex: false,
			incremental: true,
			decorations: SEARCH_DECORATIONS,
		});
	}, []);

	/** Navigate to next match */
	const findNext = useCallback(() => {
		if (!searchText) return;
		searchAddonRef.current?.findNext(searchText, {
			caseSensitive: false,
			regex: false,
			incremental: false,
			decorations: SEARCH_DECORATIONS,
		});
	}, [searchText]);

	/** Navigate to previous match */
	const findPrevious = useCallback(() => {
		if (!searchText) return;
		searchAddonRef.current?.findPrevious(searchText, {
			caseSensitive: false,
			regex: false,
			decorations: SEARCH_DECORATIONS,
		});
	}, [searchText]);

	return (
		<div className="relative h-full w-full">
			{/* Search overlay */}
			{searchOpen && (
				<div
					className="absolute top-1 right-4 z-10 flex items-center gap-1 rounded border border-[#454545] bg-[#252526] px-2 py-1 shadow-lg"
					onKeyDown={(e) => {
						if (e.key === "Escape") {
							e.stopPropagation();
							closeSearch();
						} else if (e.key === "Enter") {
							e.preventDefault();
							if (e.shiftKey) {
								findPrevious();
							} else {
								findNext();
							}
						}
					}}
				>
					<input
						ref={searchInputRef}
						type="text"
						value={searchText}
						onChange={(e) => handleSearchChange(e.target.value)}
						placeholder="Find"
						className="w-48 border-none bg-[#3c3c3c] px-2 py-0.5 text-xs text-[#cccccc] outline-none rounded placeholder-[#888]"
						autoFocus
					/>
					{searchText && (
						<span className="text-[10px] text-[#888] min-w-[4rem] text-center whitespace-nowrap">
							{searchResults.count === 0
								? "No results"
								: `${searchResults.index + 1} of ${searchResults.count}`}
						</span>
					)}
					<button
						type="button"
						onClick={findPrevious}
						className="flex items-center justify-center w-5 h-5 rounded text-[#cccccc] hover:bg-[#3c3c3c]"
						title="Previous (Shift+Enter)"
					>
						<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
							<path d="M8 3.5L3 8.5h3v5h4v-5h3L8 3.5z" />
						</svg>
					</button>
					<button
						type="button"
						onClick={findNext}
						className="flex items-center justify-center w-5 h-5 rounded text-[#cccccc] hover:bg-[#3c3c3c]"
						title="Next (Enter)"
					>
						<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
							<path d="M8 12.5l5-5H10v-5H6v5H3l5 5z" />
						</svg>
					</button>
					<button
						type="button"
						onClick={closeSearch}
						className="flex items-center justify-center w-5 h-5 rounded text-[#cccccc] hover:bg-[#3c3c3c]"
						title="Close (Esc)"
					>
						<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
							<path d="M8 8.707l3.646 3.647.708-.708L8.707 8l3.647-3.646-.708-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z" />
						</svg>
					</button>
				</div>
			)}
			{/* Terminal container */}
			<div
				ref={containerRef}
				className="h-full w-full bg-panel"
				style={{ padding: "4px 0 0 8px" }}
			/>
		</div>
	);
};
