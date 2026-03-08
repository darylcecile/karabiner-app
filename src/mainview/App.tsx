import { useCallback, useRef, useState, useMemo } from "react";
import {
	DockviewReact,
	type DockviewApi,
	type IDockviewPanelProps,
	type DockviewReadyEvent,
} from "dockview";
import "dockview/dist/styles/dockview.css";

import { Sidebar, type FileNode } from "./components/Sidebar";
import { StatusBar, type StatusBarItem } from "./components/StatusBar";
import { CommandPalette, type CommandItem } from "./components/CommandPalette";
import { TerminalPanel } from "./components/TerminalPanel";

/* ------------------------------------------------------------------ */
/*  Dockview panel components                                         */
/* ------------------------------------------------------------------ */

/** Welcome / empty-state panel shown when no files are open */
const WelcomePanel = (_props: IDockviewPanelProps) => {
	return (
		<div className="flex items-center justify-center h-full text-fg-muted select-none">
			<div className="text-center space-y-3">
				<div className="text-6xl opacity-15 font-bold tracking-tighter">K</div>
				<p className="text-[var(--font-size-base)] text-fg-secondary">
					Open a file or start a terminal session
				</p>
				<p className="text-[var(--font-size-xs)] text-fg-muted">
					Press <kbd className="px-1.5 py-0.5 bg-bg-surface border border-border rounded text-[var(--font-size-xs)]">Cmd+K</kbd> for commands
				</p>
			</div>
		</div>
	);
};

/** Generic editor panel -- placeholder for file content */
const EditorPanel = (props: IDockviewPanelProps) => {
	const filePath = props.params.filePath as string | undefined;
	return (
		<div className="h-full overflow-auto p-4 font-mono text-[var(--font-size-editor)] leading-[var(--line-height-editor)] text-editor-fg bg-editor">
			{filePath ? (
				<pre className="whitespace-pre-wrap">{`// ${filePath}\n// File content will be rendered here`}</pre>
			) : (
				<p className="text-fg-muted">Empty editor</p>
			)}
		</div>
	);
};

/** Context / info panel -- shows MCPs, modified files, etc. */
const ContextPanel = (_props: IDockviewPanelProps) => {
	return (
		<div className="h-full overflow-auto text-[var(--font-size-sm)] text-context-panel-fg bg-context-panel">
			<div className="px-3 py-2 bg-context-panel-header text-[11px] font-semibold uppercase tracking-wider">
				Modified Files
			</div>
			<div className="px-3 py-2 text-fg-muted">No changes detected</div>

			<div className="px-3 py-2 bg-context-panel-header text-[11px] font-semibold uppercase tracking-wider">
				MCP Servers
			</div>
			<div className="px-3 py-2 text-fg-muted">No servers connected</div>
		</div>
	);
};

/* ------------------------------------------------------------------ */
/*  Dockview theme                                                    */
/* ------------------------------------------------------------------ */

const karabinerTheme = {
	name: "karabiner",
	className: "dockview-theme-karabiner",
};

/* ------------------------------------------------------------------ */
/*  Demo file tree data (headless-tree format)                        */
/* ------------------------------------------------------------------ */

const DEMO_ITEMS: Record<string, FileNode> = {
	root: {
		name: "karabiner-app",
		path: "/",
		isDirectory: true,
		children: ["src", "package.json", "tsconfig.json", "electrobun.config.ts"],
	},
	src: {
		name: "src",
		path: "/src",
		isDirectory: true,
		children: ["mainview", "bun", "shared"],
	},
	mainview: {
		name: "mainview",
		path: "/src/mainview",
		isDirectory: true,
		children: ["app-tsx", "main-tsx", "index-css", "index-html", "components"],
	},
	"app-tsx": {
		name: "App.tsx",
		path: "/src/mainview/App.tsx",
		isDirectory: false,
		status: "modified",
	},
	"main-tsx": {
		name: "main.tsx",
		path: "/src/mainview/main.tsx",
		isDirectory: false,
	},
	"index-css": {
		name: "index.css",
		path: "/src/mainview/index.css",
		isDirectory: false,
		status: "modified",
	},
	"index-html": {
		name: "index.html",
		path: "/src/mainview/index.html",
		isDirectory: false,
	},
	components: {
		name: "components",
		path: "/src/mainview/components",
		isDirectory: true,
		children: [
			"sidebar-tsx",
			"statusbar-tsx",
			"terminal-tsx",
			"cmdpalette-tsx",
			"editorpanel-tsx",
			"contextpanel-tsx",
		],
	},
	"sidebar-tsx": {
		name: "Sidebar.tsx",
		path: "/src/mainview/components/Sidebar.tsx",
		isDirectory: false,
		status: "modified",
	},
	"statusbar-tsx": {
		name: "StatusBar.tsx",
		path: "/src/mainview/components/StatusBar.tsx",
		isDirectory: false,
	},
	"terminal-tsx": {
		name: "TerminalPanel.tsx",
		path: "/src/mainview/components/TerminalPanel.tsx",
		isDirectory: false,
		status: "added",
	},
	"cmdpalette-tsx": {
		name: "CommandPalette.tsx",
		path: "/src/mainview/components/CommandPalette.tsx",
		isDirectory: false,
		status: "added",
	},
	"editorpanel-tsx": {
		name: "EditorPanel.tsx",
		path: "/src/mainview/components/EditorPanel.tsx",
		isDirectory: false,
	},
	"contextpanel-tsx": {
		name: "ContextPanel.tsx",
		path: "/src/mainview/components/ContextPanel.tsx",
		isDirectory: false,
	},
	bun: {
		name: "bun",
		path: "/src/bun",
		isDirectory: true,
		children: ["bun-index-ts"],
	},
	"bun-index-ts": {
		name: "index.ts",
		path: "/src/bun/index.ts",
		isDirectory: false,
		status: "modified",
	},
	shared: {
		name: "shared",
		path: "/src/shared",
		isDirectory: true,
		children: ["shared-rpc-ts"],
	},
	"shared-rpc-ts": {
		name: "rpc.ts",
		path: "/src/shared/rpc.ts",
		isDirectory: false,
		status: "added",
	},
	"package.json": {
		name: "package.json",
		path: "/package.json",
		isDirectory: false,
	},
	"tsconfig.json": {
		name: "tsconfig.json",
		path: "/tsconfig.json",
		isDirectory: false,
	},
	"electrobun.config.ts": {
		name: "electrobun.config.ts",
		path: "/electrobun.config.ts",
		isDirectory: false,
	},
};

/* ------------------------------------------------------------------ */
/*  Status bar data                                                   */
/* ------------------------------------------------------------------ */

const STATUS_ITEMS: StatusBarItem[] = [
	{ id: "branch", content: "main", align: "left" },
	{ id: "errors", content: "0 errors, 0 warnings", align: "left" },
	{ id: "line", content: "Ln 1, Col 1", align: "right" },
	{ id: "encoding", content: "UTF-8", align: "right" },
	{ id: "lang", content: "TypeScript", align: "right" },
];

/* ------------------------------------------------------------------ */
/*  Dockview components map                                           */
/* ------------------------------------------------------------------ */

const dockviewComponents = {
	welcome: WelcomePanel,
	editor: EditorPanel,
	context: ContextPanel,
	terminal: TerminalPanel,
};

/* ------------------------------------------------------------------ */
/*  App                                                               */
/* ------------------------------------------------------------------ */

let terminalCounter = 0;

function App() {
	const apiRef = useRef<DockviewApi | null>(null);
	const [sidebarVisible, setSidebarVisible] = useState(true);

	/** Initialise the default Dockview layout */
	const onReady = useCallback((event: DockviewReadyEvent) => {
		apiRef.current = event.api;

		// Main editor area -- welcome panel
		event.api.addPanel({
			id: "welcome",
			component: "welcome",
			title: "Welcome",
		});
	}, []);

	/** Open a file in the editor area */
	const handleSelectFile = useCallback((path: string) => {
		const api = apiRef.current;
		if (!api) return;

		// Check if a panel for this file already exists
		const existing = api.getPanel(path);
		if (existing) {
			existing.api.setActive();
			return;
		}

		// Add a new editor panel in the same group as welcome
		const fileName = path.split("/").pop() ?? path;
		api.addPanel({
			id: path,
			component: "editor",
			title: fileName,
			params: { filePath: path },
			position: { referencePanel: "welcome", direction: "within" },
		});
	}, []);

	/** Open a new terminal panel */
	const openTerminal = useCallback(() => {
		const api = apiRef.current;
		if (!api) return;

		const termId = `terminal-${++terminalCounter}`;

		// Find if there's already a terminal group at the bottom
		const existingTerminal = api.panels.find(
			(p) => p.id.startsWith("terminal-"),
		);

		api.addPanel({
			id: termId,
			component: "terminal",
			title: `Terminal ${terminalCounter}`,
			position: existingTerminal
				? { referencePanel: existingTerminal.id, direction: "within" }
				: { referencePanel: "welcome", direction: "below" },
			initialHeight: 250,
		});
	}, []);

	/** Toggle sidebar visibility */
	const toggleSidebar = useCallback(() => {
		setSidebarVisible((v) => !v);
	}, []);

	/** Command palette commands */
	const commands: CommandItem[] = useMemo(
		() => [
			{
				id: "new-terminal",
				label: "New Terminal",
				group: "Terminal",
				shortcut: "Ctrl+`",
				onSelect: openTerminal,
			},
			{
				id: "toggle-sidebar",
				label: sidebarVisible ? "Hide Sidebar" : "Show Sidebar",
				group: "View",
				shortcut: "Cmd+B",
				onSelect: toggleSidebar,
			},
			{
				id: "close-panel",
				label: "Close Active Panel",
				group: "View",
				shortcut: "Cmd+W",
				onSelect: () => {
					const api = apiRef.current;
					if (!api) return;
					const active = api.activePanel;
					if (active && active.id !== "welcome") {
						api.removePanel(active);
					}
				},
			},
			{
				id: "split-right",
				label: "Split Editor Right",
				group: "View",
				onSelect: () => {
					const api = apiRef.current;
					if (!api) return;
					const active = api.activePanel;
					if (active) {
						api.addPanel({
							id: `split-${Date.now()}`,
							component: "editor",
							title: "Untitled",
							position: { referencePanel: active.id, direction: "right" },
						});
					}
				},
			},
		],
		[sidebarVisible, openTerminal, toggleSidebar],
	);

	// Keyboard shortcuts for actions that bypass the command palette
	// (The palette itself handles Cmd+K / Cmd+Shift+P)

	return (
		<div className="flex flex-col h-full w-full overflow-hidden bg-bg">
			{/* Main content: sidebar + dockview */}
			<div className="flex flex-1 min-h-0">
				{/* Sidebar */}
				{sidebarVisible && (
					<Sidebar
						title="Explorer"
						items={DEMO_ITEMS}
						rootId="root"
						onSelectFile={handleSelectFile}
					/>
				)}

				{/* Dockview -- fills remaining space */}
				<div className="flex-1 min-w-0">
					<DockviewReact
						theme={karabinerTheme}
						components={dockviewComponents}
						onReady={onReady}
					/>
				</div>
			</div>

			{/* Status Bar */}
			<StatusBar items={STATUS_ITEMS} />

			{/* Command Palette (overlay) */}
			<CommandPalette commands={commands} />
		</div>
	);
}

export default App;
