import { useCallback, useRef, useState, useMemo, useEffect } from "react";
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
import { readDirectory, openFolder, onWorkspaceOpened } from "./rpc";

/* ------------------------------------------------------------------ */
/*  Dockview panel components                                         */
/* ------------------------------------------------------------------ */

/** Welcome / empty-state panel shown when no folder is open */
const WelcomePanel = (props: IDockviewPanelProps) => {
	const onOpenFolder = props.params.onOpenFolder as (() => void) | undefined;

	return (
		<div className="flex items-center justify-center h-full text-fg-muted select-none">
			<div className="text-center space-y-4">
				<div className="text-6xl opacity-15 font-bold tracking-tighter">K</div>
				<p className="text-[var(--font-size-base)] text-fg-secondary">
					Open a folder to get started
				</p>
				<button
					type="button"
					onClick={onOpenFolder}
					className="inline-flex items-center gap-2 px-4 py-2 text-[var(--font-size-sm)]
					           bg-button text-button-fg border border-border rounded
					           hover:bg-button-hover transition-colors cursor-pointer"
				>
					Open Folder...
				</button>
				<p className="text-[var(--font-size-xs)] text-fg-muted">
					or press{" "}
					<kbd className="px-1.5 py-0.5 bg-bg-surface border border-border rounded text-[var(--font-size-xs)]">
						Cmd+O
					</kbd>{" "}
					to open a folder
				</p>
				<p className="text-[var(--font-size-xs)] text-fg-muted">
					Press{" "}
					<kbd className="px-1.5 py-0.5 bg-bg-surface border border-border rounded text-[var(--font-size-xs)]">
						Cmd+K
					</kbd>{" "}
					for commands
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
/*  File tree helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Recursively load a directory and its children into a flat
 * Record<string, FileNode> map compatible with headless-tree.
 */
async function loadFileTree(
	rootPath: string,
): Promise<{ items: Record<string, FileNode>; rootId: string }> {
	const items: Record<string, FileNode> = {};

	// Sanitise a filesystem path into a stable key for headless-tree
	const toKey = (p: string) => p.replace(/[^a-zA-Z0-9_\-/]/g, "_");

	async function walk(dirPath: string): Promise<string[]> {
		const { entries } = await readDirectory(dirPath);
		const childKeys: string[] = [];

		for (const entry of entries) {
			const key = toKey(entry.path);
			childKeys.push(key);

			if (entry.isDirectory) {
				const grandchildren = await walk(entry.path);
				items[key] = {
					name: entry.name,
					path: entry.path,
					isDirectory: true,
					children: grandchildren,
				};
			} else {
				items[key] = {
					name: entry.name,
					path: entry.path,
					isDirectory: false,
				};
			}
		}

		return childKeys;
	}

	const rootKey = toKey(rootPath);
	const children = await walk(rootPath);
	const rootName = rootPath.split("/").pop() ?? rootPath;

	items[rootKey] = {
		name: rootName,
		path: rootPath,
		isDirectory: true,
		children,
	};

	return { items, rootId: rootKey };
}

/* ------------------------------------------------------------------ */
/*  App                                                               */
/* ------------------------------------------------------------------ */

let terminalCounter = 0;

function App() {
	const apiRef = useRef<DockviewApi | null>(null);
	const [sidebarVisible, setSidebarVisible] = useState(true);

	// Workspace state
	const [workspacePath, setWorkspacePath] = useState<string | null>(null);
	const [fileTreeItems, setFileTreeItems] = useState<Record<string, FileNode>>({});
	const [fileTreeRootId, setFileTreeRootId] = useState<string>("root");

	const workspaceOpen = workspacePath !== null;

	/** Open a folder in the workspace: load file tree, show sidebar, open terminal tab */
	const handleOpenWorkspace = useCallback(async (folderPath: string) => {
		setWorkspacePath(folderPath);
		setSidebarVisible(true);

		// Load the file tree from the filesystem
		try {
			const { items, rootId } = await loadFileTree(folderPath);
			setFileTreeItems(items);
			setFileTreeRootId(rootId);
		} catch {
			// If loading fails, show an empty tree
			setFileTreeItems({});
			setFileTreeRootId("root");
		}

		// Transition Dockview: remove welcome panel, open a terminal tab in its place
		const api = apiRef.current;
		if (!api) return;

		const termId = `terminal-${++terminalCounter}`;

		// Add terminal in the same group as welcome (replaces it visually)
		api.addPanel({
			id: termId,
			component: "terminal",
			title: `Terminal ${terminalCounter}`,
			params: { cwd: folderPath },
			position: { referencePanel: "welcome", direction: "within" },
		});

		// Remove the welcome panel now that a real tab is in its place
		const welcomePanel = api.getPanel("welcome");
		if (welcomePanel) {
			api.removePanel(welcomePanel);
		}
	}, []);

	/** Trigger the native folder picker, then open the selected folder */
	const handleOpenFolderDialog = useCallback(async () => {
		const path = await openFolder();
		if (path) {
			handleOpenWorkspace(path);
		}
	}, [handleOpenWorkspace]);

	/** Initialise the default Dockview layout */
	const onReady = useCallback(
		(event: DockviewReadyEvent) => {
			apiRef.current = event.api;

			// Start with the welcome panel
			event.api.addPanel({
				id: "welcome",
				component: "welcome",
				title: "Welcome",
				params: { onOpenFolder: handleOpenFolderDialog },
			});
		},
		[handleOpenFolderDialog],
	);

	// Listen for workspace-opened events from the app menu (File > Open Folder)
	useEffect(() => {
		const unsub = onWorkspaceOpened((path) => {
			handleOpenWorkspace(path);
		});
		return unsub;
	}, [handleOpenWorkspace]);

	// Listen for Cmd+O keyboard shortcut to open a folder
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "o" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
				e.preventDefault();
				handleOpenFolderDialog();
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [handleOpenFolderDialog]);

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

		// Find an anchor panel to open "within" (first non-welcome panel, or any)
		const anchor = api.panels[0];
		if (!anchor) return;

		const fileName = path.split("/").pop() ?? path;
		api.addPanel({
			id: path,
			component: "editor",
			title: fileName,
			params: { filePath: path },
			position: { referencePanel: anchor.id, direction: "within" },
		});
	}, []);

	/** Open a new terminal panel as a tab in the main group */
	const openTerminal = useCallback(() => {
		const api = apiRef.current;
		if (!api) return;

		const termId = `terminal-${++terminalCounter}`;

		// Find an existing terminal to group with, or use the first panel
		const existingTerminal = api.panels.find(
			(p) => p.id.startsWith("terminal-"),
		);
		const anchor = existingTerminal ?? api.panels[0];
		if (!anchor) return;

		api.addPanel({
			id: termId,
			component: "terminal",
			title: `Terminal ${terminalCounter}`,
			params: { cwd: workspacePath ?? undefined },
			position: { referencePanel: anchor.id, direction: "within" },
		});
	}, [workspacePath]);

	/** Toggle sidebar visibility (only meaningful when a folder is open) */
	const toggleSidebar = useCallback(() => {
		if (!workspaceOpen) return;
		setSidebarVisible((v) => !v);
	}, [workspaceOpen]);

	/** Command palette commands */
	const commands: CommandItem[] = useMemo(
		() => [
			{
				id: "open-folder",
				label: "Open Folder...",
				group: "File",
				shortcut: "Cmd+O",
				onSelect: handleOpenFolderDialog,
			},
			{
				id: "new-terminal",
				label: "New Terminal",
				group: "Terminal",
				shortcut: "Ctrl+`",
				onSelect: openTerminal,
			},
			...(workspaceOpen
				? [
						{
							id: "toggle-sidebar",
							label: sidebarVisible ? "Hide Sidebar" : "Show Sidebar",
							group: "View",
							shortcut: "Cmd+B",
							onSelect: toggleSidebar,
						},
					]
				: []),
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
		[workspaceOpen, sidebarVisible, openTerminal, toggleSidebar, handleOpenFolderDialog],
	);

	return (
		<div className="flex flex-col h-full w-full overflow-hidden bg-bg">
			{/* Main content: sidebar + dockview */}
			<div className="flex flex-1 min-h-0">
				{/* Sidebar -- only visible when a folder is open */}
				{workspaceOpen && sidebarVisible && (
					<Sidebar
						title="Explorer"
						items={fileTreeItems}
						rootId={fileTreeRootId}
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
